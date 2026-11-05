/**
 * 解析結果的把關：哪些情況要先請使用者確認，不直接給一個數字（純函式，可在 Node 測試）。
 *
 * 為什麼：解析器一定會產生一個 Claim（沒說的部分用預設值補），所以就算輸入是亂打的、
 * 或說的是歐洲，也會算出一個看起來很精確的命中率。對一個講求「誠實」的網站，這比算錯還糟。
 *
 * 依序檢查（第一個符合的就是結果）：
 * - foreign-only：只提到國外（region-foreign-only）。台灣的資料算不出國外的命中率。
 * - not-quake：原文裡找不到任何和地震有關的字，多半是貼錯或在測試。
 * - not-prophecy：在講地震演練、保險、防災包，而且沒說多大。
 * - empty：時間、地點、大小都沒說（「地震」「去年的地震好可怕」），沒有東西可以算中或不中。
 * - past：提到過去的時間（去年、昨天、1999 年…），卻沒有說未來什麼時候，說的多半是已經發生的地震。
 * - conflicting：說法互相矛盾：大小或時間有 3 種以上，或大小、時間、地點中有兩項各有 2 種以上。
 *
 * 使用者按「照目前的設定算算看」，或在確認卡改了任何一項，就算確認過了（由 controller 處理）。
 * 詳細規則見 docs/MODELS.md 2.7。
 */
import { normalize } from '../claim/normalize';
import type { Flag, FlagCode, ParseResult } from '../core/types';

export type GateKind = 'foreign-only' | 'not-quake' | 'not-prophecy' | 'empty' | 'past' | 'conflicting';

/**
 * 和地震有關的字（排除規則要和 src/claim/size.ts 一致）：
 * - 「震」，但不含震撼、震驚、震怒、震耳、震懾、震天、震盪（「這部電影太震撼」「股市震盪」）
 * - 地牛、芮氏；「規模」後面要接數字（「規模龐大」「總規模約 3 兆元」不是地震）
 * - 搖、晃（不含搖滾、搖頭、搖擺、搖籃、動搖、閒晃）
 * - 有感（不含有感而發、有感覺、有感動）
 * - 「M6」「Mw 5」這類寫法：M 前面不能是英文字（Apple M4、BMW M3），後面不能是晶片、車款這類產品詞
 * 比對前先經過 normalize()（全形英數變半形），空白一律有上限，避免長字串反覆回溯。
 */
const QUAKE_WORD_RE = new RegExp(
  [
    '震(?![撼驚怒耳懾天盪蕩])',
    '地牛',
    '芮氏',
    '規模\\s{0,2}(?:[約達到為是有在會將恐逾可能上看接近高]\\s{0,2}){0,4}[0-9一二三四五六七八九十]',
    '(?<!動)搖(?![滾頭擺籃曳旗手錢鈴])',
    '(?<!閒)晃',
    '有感(?![覺而情謝動染想冒])',
    '(?<![A-Za-z][\\s-]{0,3})[Mm]\\s?[LlWwSsJjBb]?\\s?[0-9](?![0-9.]*\\s{0,2}(?:晶片|處理器|系列|車款|跑車|手機|筆電|電腦|型號|Pro|Max|Ultra))',
  ].join('|'),
);

/** 不是預言的情境：演練、保險、防災準備 */
const NOT_PROPHECY_RE = /演練|演習|地震險|保險|防災包|避難包|逃生包/;

/** 過去的時間說法（沒有說未來的時間時，才當成「說的是已經發生的地震」） */
const PAST_WORD_RE = /去年|前年|昨天|昨日|昨晚|昨夜|前天|前晚|上週|上禮拜|上星期|上個月|上月|前陣子|前幾天|剛剛|剛才|當年|那年|曾經/;
/** 寫了西元年份：早於發布日那一年就是過去 */
const YEAR_RE = /(?<!\d)((?:19|20)\d{2})\s*年/g;

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
    if (Number(m[1]) < issuedYear) return true;
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

  const noTime = has(flags, 'time-unspecified');
  const noRegion = has(flags, 'region-unspecified');
  const noSizeWord = flags.some((f) => f.code === 'size-unspecified' && !(f.detail ?? '').trim());
  if (noTime && noRegion && noSizeWord) return 'empty';
  if (noTime && mentionsPast(norm, Number(claim.issuedAt.slice(0, 4)))) return 'past';

  const sizes = detailCount(flags, 'size-multiple');
  const times = detailCount(flags, 'time-multiple');
  const places = detailCount(flags, 'region-union');
  const multiDims = [sizes, times, places].filter((n) => n >= 2).length;
  if (sizes >= 3 || times >= 3 || multiDims >= 2) return 'conflicting';
  return null;
}
