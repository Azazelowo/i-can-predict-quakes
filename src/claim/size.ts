/**
 * 大小（docs/MODELS.md 2.4）。
 *
 * 優先順序：明確數值（規模、震度、「N 級」；多個時取最先出現的）＞「大地震」這類詞＞「有感」這類詞＞都沒有。
 *
 * 規模的判定方式：數值後 4 個字內有「以上、起跳、+、↑、≥」，或數值前有「至少、超過、大於」→ strict；其餘 lenient。
 *
 * 規格沒寫、我們的解讀（見 notes）：
 * - 「4 個字內」= 數值結尾之後的 4 個 UTF-16 字元裡完整出現該詞（「M7 以上」算、「規模 7 級 以上」不算）。
 * - 「數值前」= 關鍵字與數值之間（「規模至少 6」），或緊接在整個說法前面、中間只隔空白（「至少規模 6」「超過 6 級」）。
 *   「≥」「>」寫在數值前（「M≥6」「ML>5」）也算 strict。
 * - 關鍵字與數值之間可以夾「約、達、達到、高達、可達、可能、會、將、有、為、是、在、將近、接近、上看、恐、逾」與空白、冒號、等號。
 * - 數值後面接「次、個、天、週、年、月、些、定、直…」時是在數東西（「規模有一定」「大規模 3 天」），不算大小。
 * - 「N 級」沒有接「地震」也算（「花蓮 6 級以上」）；前面是「第」時不算；數值已接在規模／芮氏／震度後面、
 *   或「級」後面接震度／規模時不是歧義（由其他規則處理，數值不合法時就不算大小）。
 * - 「大地震」這類詞與「有感」這類詞同時出現時取「大地震」（沒說多大，看光譜）：說的是「大」地震，
 *   用震度 1 計算會讓預言看起來比原意容易中。
 * - 「五六級」這類約數不當成數值；震度只接受整數 0–7，「4 強」的「強」不算（只有 5、6 可接弱／強）。
 */
import { MIN_ML } from '../core/constants';
import type { Flag, SizeSpec, Span } from '../core/types';
import { NUM_LEFT, NUM_SRC, parseNumber, toTenths } from './numbers';
import { forEachMatch, pickEarliest } from './scan';

export interface SizeResult {
  size: SizeSpec;
  flags: Flag[];
  spans: Span[];
}

interface SizeFound extends SizeResult {
  start: number;
  end: number;
}

/** 關鍵字與數值之間可以出現的字。每個選項都不是其他選項的組合，避免 regex 回溯爆炸。 */
const FILL = '(?:大約|達到|高達|可達|至少|超過|大於|將近|接近|可能|上看|約|達|為|是|有|在|會|將|恐|逾|≥|>|=|:|\\s)*';
/** 數值後面接這些字時是在數東西，不是大小（「日本」除外） */
const NOT_SIZE_AFTER = '(?!\\s*(?:[次個天週年月星禮些定直樣種倍分秒時號隻份成萬千億/]|日(?!本)))';
const MAG_KEYWORD = '芮氏規模|芮氏|規模|(?<![A-Za-z])[Mm][LlWw]?';

/** 規模 v、芮氏 v、芮氏規模 v、M v、ML v、Mw v（可接「級」） */
const MAGNITUDE_RE = new RegExp(`(${MAG_KEYWORD})(${FILL})(${NUM_SRC})${NOT_SIZE_AFTER}(?:\\s*級)?`, 'g');
/** 「6 級規模」：規模在後面，也不算歧義 */
const MAGNITUDE_AFTER_RE = new RegExp(`${NUM_LEFT}(${NUM_SRC})\\s*級\\s*(?:的\\s*)?規模`, 'g');
/** 震度 v、震度 v 弱／強（可接「級」） */
const INTENSITY_RE = new RegExp(`震度(${FILL})(${NUM_SRC})${NOT_SIZE_AFTER}(\\s*[弱強])?(?:\\s*級)?`, 'g');
/** v 級震度、v 弱震度 */
const INTENSITY_AFTER_RE = new RegExp(
  `${NUM_LEFT}(${NUM_SRC})\\s*(?:([弱強])(?:\\s*級)?|級)\\s*(?:的\\s*)?震度`,
  'g',
);
/** 「v 級」：前後都沒有規模、芮氏、震度 → 規模（寬鬆）＋ size-level-ambiguous */
const LEVEL_RE = new RegExp(`${NUM_LEFT}(?<!第\\s*)(${NUM_SRC})\\s*級`, 'g');
const KEYWORD_AFTER_RE = /\s*(?:的\s*)?(?:震度|規模)/y;

const BIG_WORDS_RE = /超大地震|大規模地震|強烈地震|大地震|地牛翻身|毀滅性|災難性|強震|巨震|大震/g;
const FELT_WORDS_RE = /有感|會搖|會晃|感覺得到/g;

const STRICT_AFTER: readonly string[] = ['以上', '起跳', '+', '↑', '≥'];
const LENIENT_AFTER: readonly string[] = ['左右', '上下'];
/** 緊接在說法前面的修飾語（先比對兩個字的） */
const BEFORE_WORDS: readonly { word: string; strict: boolean }[] = [
  { word: '至少', strict: true },
  { word: '超過', strict: true },
  { word: '大於', strict: true },
  { word: '大約', strict: false },
  { word: '將近', strict: false },
  { word: '接近', strict: false },
  { word: '≥', strict: true },
  { word: '>', strict: true },
  { word: '約', strict: false },
];
const STRICT_IN_FILL_RE = /至少|超過|大於|≥|>/;
/** 數值後幾個字內的修飾語（規格 2.4：4 個字） */
const AFTER_WINDOW = 4;

interface Modifiers {
  strict: boolean;
  spans: Span[];
}

function modifiers(norm: string, exprStart: number, numEnd: number): Modifiers {
  const spans: Span[] = [];
  let strict = false;
  const after = norm.slice(numEnd, numEnd + AFTER_WINDOW);
  for (const word of [...STRICT_AFTER, ...LENIENT_AFTER]) {
    const k = after.indexOf(word);
    if (k < 0) continue;
    spans.push({ slot: 'modifier', start: numEnd + k, end: numEnd + k + word.length });
    if (STRICT_AFTER.includes(word)) strict = true;
  }
  let k = exprStart;
  while (k > 0 && /\s/.test(norm[k - 1] ?? '')) k -= 1;
  const before = BEFORE_WORDS.find(({ word }) => k >= word.length && norm.startsWith(word, k - word.length));
  if (before !== undefined) {
    spans.push({ slot: 'modifier', start: k - before.word.length, end: k });
    if (before.strict) strict = true;
  }
  return { strict, spans };
}

function magnitudeFound(
  norm: string,
  exprStart: number,
  exprEnd: number,
  numEnd: number,
  fill: string,
  decimal: string,
  ambiguous: boolean,
): SizeFound | null {
  const tenths = toTenths(decimal);
  // 規模 1.0–9.9（取一位小數）
  if (!(tenths >= 10 && tenths <= 99)) return null;
  const mods = modifiers(norm, exprStart, numEnd);
  const strict = mods.strict || STRICT_IN_FILL_RE.test(fill);
  const flags: Flag[] = [];
  if (ambiguous) flags.push({ code: 'size-level-ambiguous' });
  // 有效門檻（strict = 值；lenient = 值 − 0.5）低於 4.0；用十分之一為單位比較，避免浮點誤差
  if ((strict ? tenths : tenths - 5) < MIN_ML * 10) flags.push({ code: 'size-below-min' });
  return {
    start: exprStart,
    end: exprEnd,
    size: { kind: 'magnitude', value: tenths / 10, tolerance: strict ? 'strict' : 'lenient' },
    flags,
    spans: [{ slot: 'size', start: exprStart, end: exprEnd }, ...mods.spans],
  };
}

/** 震度值：整數 0–7；弱／強只用在 5、6（5 強 = 5.5、6 強 = 6.5）。suffixOk = 弱／強有沒有被採用。 */
function intensityValue(numText: string, suffix: string | undefined): { value: number; suffixOk: boolean } | null {
  const n = parseNumber(numText);
  if (n === null || n.approx || !Number.isInteger(n.value) || n.value < 0 || n.value > 7) return null;
  if (suffix !== undefined && (n.value === 5 || n.value === 6)) {
    return { value: suffix === '強' ? n.value + 0.5 : n.value, suffixOk: true };
  }
  return { value: n.value, suffixOk: false };
}

function intensityFound(norm: string, exprStart: number, exprEnd: number, numEnd: number, value: number): SizeFound {
  const mods = modifiers(norm, exprStart, numEnd);
  return {
    start: exprStart,
    end: exprEnd,
    size: { kind: 'intensity', value },
    flags: [],
    spans: [{ slot: 'size', start: exprStart, end: exprEnd }, ...mods.spans],
  };
}

function firstMagnitude(norm: string): SizeFound | null {
  let found: SizeFound | null = null;
  forEachMatch(MAGNITUDE_RE, norm, (m) => {
    const keyword = m[1] ?? '';
    const fill = m[2] ?? '';
    const numText = m[3] ?? '';
    const n = parseNumber(numText);
    if (n === null || n.approx) return false;
    const numEnd = m.index + keyword.length + fill.length + numText.length;
    found = magnitudeFound(norm, m.index, m.index + m[0].length, numEnd, fill, n.decimal, false);
    return found !== null;
  });
  return found;
}

function firstMagnitudeAfter(norm: string): SizeFound | null {
  let found: SizeFound | null = null;
  forEachMatch(MAGNITUDE_AFTER_RE, norm, (m) => {
    const numText = m[1] ?? '';
    const n = parseNumber(numText);
    if (n === null || n.approx) return false;
    const numEnd = m.index + numText.length;
    found = magnitudeFound(norm, m.index, m.index + m[0].length, numEnd, '', n.decimal, false);
    return found !== null;
  });
  return found;
}

function firstIntensity(norm: string): SizeFound | null {
  let found: SizeFound | null = null;
  forEachMatch(INTENSITY_RE, norm, (m) => {
    const fill = m[1] ?? '';
    const numText = m[2] ?? '';
    const suffix = m[3]?.trim();
    const v = intensityValue(numText, suffix);
    if (v === null) return false;
    const numEnd = m.index + '震度'.length + fill.length + numText.length;
    // 弱／強沒被採用時（「震度 4 強」），span 只到數值
    const end = suffix !== undefined && !v.suffixOk ? numEnd : m.index + m[0].length;
    found = intensityFound(norm, m.index, end, numEnd, v.value);
    return true;
  });
  return found;
}

function firstIntensityAfter(norm: string): SizeFound | null {
  let found: SizeFound | null = null;
  forEachMatch(INTENSITY_AFTER_RE, norm, (m) => {
    const numText = m[1] ?? '';
    const suffix = m[2];
    const v = intensityValue(numText, suffix);
    if (v === null || (suffix !== undefined && !v.suffixOk)) return false;
    found = intensityFound(norm, m.index, m.index + m[0].length, m.index + numText.length, v.value);
    return true;
  });
  return found;
}

/**
 * 已經接在規模、芮氏、震度後面的數值起點（不論值合不合法）。這些數值由其他規則處理，
 * 不能再當成「N 級」的歧義（例如「震度 8 級」不合法，但也不該變成「規模 8」）。
 */
function keywordNumberStarts(norm: string): Set<number> {
  const starts = new Set<number>();
  forEachMatch(MAGNITUDE_RE, norm, (m) => {
    starts.add(m.index + (m[1] ?? '').length + (m[2] ?? '').length);
    return false;
  });
  forEachMatch(INTENSITY_RE, norm, (m) => {
    starts.add(m.index + '震度'.length + (m[1] ?? '').length);
    return false;
  });
  return starts;
}

function firstLevel(norm: string): SizeFound | null {
  let claimed: Set<number> | null = null;
  let found: SizeFound | null = null;
  forEachMatch(LEVEL_RE, norm, (m) => {
    const numText = m[1] ?? '';
    const n = parseNumber(numText);
    if (n === null || n.approx) return false;
    const end = m.index + m[0].length;
    // 前後有規模、芮氏、震度時不是歧義，由其他規則處理
    claimed ??= keywordNumberStarts(norm);
    if (claimed.has(m.index)) return false;
    KEYWORD_AFTER_RE.lastIndex = end;
    if (KEYWORD_AFTER_RE.test(norm)) return false;
    found = magnitudeFound(norm, m.index, end, m.index + numText.length, '', n.decimal, true);
    return found !== null;
  });
  return found;
}

function firstWord(re: RegExp, norm: string): { start: number; end: number } | null {
  re.lastIndex = 0;
  const m = re.exec(norm);
  return m === null ? null : { start: m.index, end: m.index + m[0].length };
}

export function findSize(norm: string, orig: string): SizeResult {
  const numeric = pickEarliest<SizeFound>([
    firstMagnitude(norm),
    firstMagnitudeAfter(norm),
    firstIntensity(norm),
    firstIntensityAfter(norm),
    firstLevel(norm),
  ]);
  if (numeric !== null) return { size: numeric.size, flags: numeric.flags, spans: numeric.spans };

  const big = firstWord(BIG_WORDS_RE, norm);
  if (big !== null) {
    return {
      size: { kind: 'unspecified' },
      flags: [{ code: 'size-unspecified', detail: orig.slice(big.start, big.end) }],
      spans: [{ slot: 'size', start: big.start, end: big.end }],
    };
  }

  const felt = firstWord(FELT_WORDS_RE, norm);
  if (felt !== null) {
    return {
      size: { kind: 'intensity', value: 1 },
      flags: [],
      spans: [{ slot: 'size', start: felt.start, end: felt.end }],
    };
  }

  return { size: { kind: 'unspecified' }, flags: [{ code: 'size-unspecified', detail: '' }], spans: [] };
}
