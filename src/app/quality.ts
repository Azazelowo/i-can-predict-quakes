/**
 * 解析結果的把關：哪些情況要先請使用者確認，不直接給一個數字（純函式，可在 Node 測試）。
 *
 * 為什麼：解析器一定會產生一個 Claim（沒說的部分用預設值補），所以就算輸入是亂打的、
 * 或說的是歐洲，也會算出一個看起來很精確的命中率。對一個講求「誠實」的網站，這比算錯還糟。
 *
 * 依序檢查（第一個符合的就是結果）：
 * - foreign-only：只提到國外（region-foreign-only）。台灣的資料算不出國外的命中率。
 * - not-quake：原文裡找不到任何和地震有關的字，多半是貼錯或在測試。
 * - not-prophecy：在講地震演練、保險、防災包，或「人事大地震」「股市震盪」這類比喻，而且沒說多大。
 * - negated：說的是「不會發生」或「最多多大」（size-negated）。本網站只算「會發生、至少多大」的預言。
 * - empty：時間、地點、大小都沒說（「地震」「去年的地震好可怕」），沒有東西可以算中或不中。
 * - past：說的是已經發生的地震：採用的時間已經過了（time-past），或沒說未來的時間、卻提到去年、昨天、
 *   幾天前、民國 88 年…
 * - conflicting：說法互相矛盾：大小或時間有 3 種以上，或大小、時間、地點中有兩項各有 2 種以上。
 *
 * 使用者按「照目前的設定算算看」，或在確認卡改了任何一項，就算確認過了（由 controller 處理）。
 * 詳細規則見 docs/MODELS.md 2.7。
 */
import { normalize } from '../claim/normalize';
import type { Flag, FlagCode, ParseResult } from '../core/types';

export type GateKind =
  | 'foreign-only'
  | 'not-quake'
  | 'not-prophecy'
  | 'negated'
  | 'empty'
  | 'past'
  | 'conflicting';

/**
 * 和地震有關的字（排除規則要和 src/claim/size.ts 一致）：
 * - 「震」，但不含震撼（含錯字震憾）、震驚、震怒、震耳、震懾、震天、震盪
 * - 地牛、芮氏；「規模」後面要接完整的數字，而且不是年數、金額（「規模龐大」「規模達 30 億」不是地震）
 * - 搖、晃（不含搖滾、搖頭、搖擺、搖籃、動搖、手搖、閒晃、晃晃、晃神、晃過去）
 * - 有感（規則同 size.ts：後面接地震、搖晃，或在句尾；或前面是會、都、臺）
 * - 「M6」「Mw 5」這類寫法：M 前面不能是英文字（Apple M4），後面不能是產品詞、英文字或件、號（M2 MacBook、M 6 件）
 * - 單獨的「5 強」「6 弱」
 * 比對前先經過 normalize()（全形英數變半形、≧ 變 ≥），空白一律有上限，避免長字串反覆回溯。
 */
const QUAKE_WORD_RE = new RegExp(
  [
    '震(?![撼憾驚怒耳懾天盪蕩])',
    '地牛',
    '芮氏',
    // 數字要整個比對（右邊不能再接數字），否則「規模達 30 億」會退回「3」而通過
    '規模\\s{0,2}(?:[約達到為是有在會將恐逾可能上看接近高≥>]\\s{0,2}){0,4}(?:\\d+(?:\\.\\d+)?|[一二三四五六七八九十]+)(?![\\d.一二三四五六七八九十百])(?!\\s*(?:年|萬|億|兆|元|倍|%|件))',
    '(?<![動手])搖(?![滾頭擺籃曳旗手錢鈴])',
    '(?<![閒晃])晃(?![晃神過])',
    '(?<!很)(?<!讓[^，,。\\s]{0,4})有感(?=\\s{0,2}(?:的\\s{0,2})?(?:地震|搖|晃|震)|\\s{0,2}(?:$|[，,。.!！?？~～、]))',
    '(?<=[會都臺])有感(?![覺而情謝動染想冒加減施上下降經政])',
    '(?<![A-Za-z][\\s-]{0,3})[Mm]\\s?[LlWwSsJjBb]?\\s?[0-9](?![0-9.]*\\s{0,2}(?:晶片|處理器|系列|車款|跑車|手機|筆電|電腦|型號|[A-Za-z]{2,}|件|號|碼))',
    '(?<![\\d.])[56]\\s{0,2}[弱強](?!\\s*(?:賽|隊|國|之|人|者))',
  ].join('|'),
);

/** 不是預言的情境：演練、保險、防災準備；「人事大地震」「股市震盪」這類比喻 */
const NOT_PROPHECY_RE =
  /演練|演習|地震險|保險|防災包|避難包|逃生包|(?:人事|政壇|政治|政局|股市|台股|臺股|職場|演藝圈|球隊|業界|產業)[^，,。]{0,3}(?:大地震|地震|震盪)/;

/**
 * 過去的時間說法（沒有說未來的時間時，才當成「說的是已經發生的地震」）：
 * 去年、昨天、上週、上個禮拜、上一週、幾天前、三天前、兩週前、十年前、日前、稍早、今晨、上次、前陣子、前些日子…
 */
const PAST_WORD_RE = new RegExp(
  [
    '去年|前年|昨天|昨日|昨晚|昨夜|前天|前晚|上個?月|前陣子|前一陣子|前些(?:日子|天)|前幾天|前幾年',
    '剛剛|剛才|稍早|今晨|上次|當年|那年|曾經',
    '上\\s{0,2}(?:一|個)?\\s{0,2}(?:週|禮拜|星期)',
    '(?:幾|數|\\d+|[〇零一二兩三四五六七八九十百]+)\\s{0,2}(?:天|日|週|個?\\s{0,2}禮拜|個?\\s{0,2}星期|個?\\s{0,2}月|年)\\s{0,2}前(?!後)',
    '(?<![\\d〇零一二三四五六七八九十])日前',
  ].join('|'),
);
/** 寫了年份：西元四位數、民國 N 年、四個中文數字（「二〇二四年」） */
const YEAR_RE = /(?<![\d〇零一二三四五六七八九])(民國\s{0,2})?(\d{2,4}|[〇零一二三四五六七八九]{4})\s{0,2}年/g;
const CN_DIGITS = '〇一二三四五六七八九';

function yearOf(m: RegExpMatchArray): number | null {
  const raw = m[2] ?? '';
  const digits = /^\d+$/.test(raw) ? raw : [...raw].map((c) => (c === '零' ? 0 : CN_DIGITS.indexOf(c))).join('');
  const n = Number(digits);
  if (!Number.isInteger(n)) return null;
  if (m[1] !== undefined) return n + 1911; // 民國
  if (digits.length === 4) return n;
  if (digits.length === 3) return n + 1911; // 「115 年」= 民國 115 年
  return null;
}

/** 某個旗標的 detail 列了幾項（以「、」分隔）；沒有這個旗標時為 0 */
export function detailCount(flags: readonly Flag[], code: FlagCode): number {
  const flag = flags.find((f) => f.code === code);
  if (!flag) return 0;
  const detail = (flag.detail ?? '').trim();
  return detail ? detail.split('、').length : 1;
}

function has(flags: readonly Flag[], code: FlagCode): boolean {
  return flags.some((f) => f.code === code);
}

function mentionsPast(norm: string, issuedYear: number): boolean {
  if (PAST_WORD_RE.test(norm)) return true;
  for (const m of norm.matchAll(YEAR_RE)) {
    const year = yearOf(m);
    if (year !== null && year < issuedYear) return true;
  }
  return false;
}

export function assessParse(text: string, parse: ParseResult): GateKind | null {
  const { flags, claim } = parse;
  const norm = normalize(text);
  if (has(flags, 'region-foreign-only')) return 'foreign-only';
  if (!QUAKE_WORD_RE.test(norm)) return 'not-quake';
  const noSize = claim.size.kind === 'unspecified';
  if (noSize && NOT_PROPHECY_RE.test(norm)) return 'not-prophecy';
  if (has(flags, 'size-negated')) return 'negated';

  const noTime = has(flags, 'time-unspecified');
  const noRegion = has(flags, 'region-unspecified');
  const noSizeWord = flags.some((f) => f.code === 'size-unspecified' && !(f.detail ?? '').trim());
  if (noTime && noRegion && noSizeWord && !has(flags, 'time-unrecognized')) return 'empty';
  // 採用的時間已經過了：解析器只有在沒有任何未來的明確說法時，才會採用過去的日期
  if (has(flags, 'time-past')) return 'past';
  if (noTime && mentionsPast(norm, Number(claim.issuedAt.slice(0, 4)))) return 'past';

  const sizes = detailCount(flags, 'size-multiple');
  const times = detailCount(flags, 'time-multiple');
  const places = detailCount(flags, 'region-union');
  const multiDims = [sizes, times, places].filter((n) => n >= 2).length;
  if (sizes >= 3 || times >= 3 || multiDims >= 2) return 'conflicting';
  return null;
}
