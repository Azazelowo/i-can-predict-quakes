/**
 * 大小（docs/MODELS.md 2.4、附錄 D）。
 *
 * 優先順序：明確數值（規模、震度、舊制／新制震度、「N 級」；多個時取最先出現的）
 *   ＞ 有對應大小的中央氣象署分級名稱（中地震、弱震…，src/core/terms.ts）
 *   ＞「大地震」這類詞（沒說多大，看光譜）＞ 沒有對應大小的分級名稱（顯著地震…）＞「有感」這類詞＞ 都沒有。
 *
 * 規模的判定方式：數值後 4 個字內有「以上、起跳、+、↑、≥」，或數值前有「至少、超過、大於」→ strict；其餘 lenient。
 *
 * 規格沒寫、我們的解讀（見 notes）：
 * - 「4 個字內」= 數值結尾之後的 4 個 UTF-16 字元裡完整出現該詞（「M7 以上」算、「規模 7 級 以上」不算）。
 * - 「數值前」= 關鍵字與數值之間（「規模至少 6」），或緊接在整個說法前面、中間只隔空白（「至少規模 6」「超過 6 級」）。
 *   「≥」「>」寫在數值前（「M≥6」「ML>5」）也算 strict。
 * - 關鍵字與數值之間可以夾「約、達、達到、高達、可達、可能、會、將、有、為、是、在、將近、接近、上看、恐、逾」與空白、冒號、等號。
 * - 數值後面接「次、個、天、週、年、月、些、定、直…」時是在數東西（「規模有一定」「大規模 3 天」），不算大小。
 * - 「N 級」沒有接「地震」也算（「花蓮 6 級以上」）；前面是「第」時不算；數值已接在規模／芮氏／震度／舊制／新制後面、
 *   或「級」後面接震度／規模時不是歧義（由其他規則處理，數值不合法時就不算大小）。
 * - 「大地震」這類詞與「有感」這類詞同時出現時取「大地震」（沒說多大，看光譜）：說的是「大」地震，
 *   用震度 1 計算會讓預言看起來比原意容易中。
 * - 「五六級」這類約數不當成數值；震度只接受整數 0–7，「4 強」的「強」不算（只有 5、6 可接弱／強）。
 * - 規模種類：Mw、Ms、Mj、mb 和中央氣象署的 ML 數值不同（地震百問第 27 題），數值照樣當 ML 門檻，加 size-magnitude-type。
 * - 原文有兩個以上「不同的」明確大小（數值或有對應大小的分級名稱）時加 size-multiple，仍取最先出現的數值。
 * - PGA、PGV、加速度等本網站不計算的量：加 size-unsupported-term，不影響大小。
 */
import { MIN_ML } from '../core/constants';
import { OFFICIAL_TERMS, officialTerm, type OfficialTerm } from '../core/terms'; // officialTerm: 比對到的詞 → 定義
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
  /** 規模種類（Mw、Ms、Mj、mb；ML、M 或沒寫時為 null） */
  magType: string | null;
}

/** 關鍵字與數值之間可以出現的字。每個選項都不是其他選項的組合，避免 regex 回溯爆炸。 */
const FILL = '(?:大約|達到|高達|可達|至少|超過|大於|將近|接近|可能|上看|約|達|為|是|有|在|會|將|恐|逾|≥|>|=|:|\\s)*';
/** 數值後面接這些字時是在數東西，不是大小（「日本」除外） */
const NOT_SIZE_AFTER = '(?!\\s*(?:[次個天週年月星禮些定直樣種倍分秒時號隻份成萬千億/]|日(?!本)))';
/** 規模關鍵字：芮氏、規模，或 M、ML、Mw、Ms、Mj、Mjma、mb（前面不能是英文字母） */
const MAG_KEYWORD = '芮氏規模|芮氏|規模|(?<![A-Za-z])(?:[Mm][Jj][Mm][Aa]|[Mm][LlWwSsJjBb]?)';

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
/** 舊制、新制震度（不一定寫「震度」）：「舊制 7 級」「新制 6 弱」「舊制震度 5 級」 */
const SCALE_RE = new RegExp(`((?:舊制|新制)(?:震度)?)(${FILL})(${NUM_SRC})${NOT_SIZE_AFTER}(\\s*[弱強])?(?:\\s*級)?`, 'g');
/** 「v 級」：前後都沒有規模、芮氏、震度 → 規模（寬鬆）＋ size-level-ambiguous */
const LEVEL_RE = new RegExp(`${NUM_LEFT}(?<!第\\s*)(${NUM_SRC})\\s*級`, 'g');
const KEYWORD_AFTER_RE = /\s*(?:的\s*)?(?:震度|規模)/y;

const BIG_WORDS_RE = /超大地震|大規模地震|強烈地震|大地震|地牛翻身|毀滅性|災難性|強震|巨震|大震/g;
const FELT_WORDS_RE = /有感|會搖|會晃|感覺得到/g;
/**
 * 中央氣象署的分級名稱（由長到短：「小區域有感地震」先於「小地震」「有感」）。
 * 「中地震」「中震」前面是「臺」時是地名（「台中地震」「台中震度 5 級」），不算分級名稱。
 */
const TERMS_RE = new RegExp(
  [...OFFICIAL_TERMS]
    .sort((a, b) => b.word.length - a.word.length)
    .map((t) => (t.word.startsWith('中') ? `(?<!臺)${t.word}` : t.word))
    .join('|'),
  'g',
);
/** 本網站不計算的量 */
const UNSUPPORTED_RE = /PGA|PGV|(?<![A-Za-z])gal(?![A-Za-z])|地表加速度|地動加速度|加速度/g;

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

/** 規模有效門檻（strict = 值；lenient = 值 − 0.5）是否低於 4.0（用十分之一為單位比較，避免浮點誤差） */
function belowMin(tenths: number, strict: boolean): boolean {
  return (strict ? tenths : tenths - 5) < MIN_ML * 10;
}

/** 「Mw」「Ms」「Mj」「Mjma」「mb」回傳原文寫法；ML、M、規模、芮氏回傳 null */
function magTypeOf(keyword: string): string | null {
  return /^(?:mw|ms|mb|mj|mjma)$/i.test(keyword) ? keyword : null;
}

function magnitudeFound(
  norm: string,
  exprStart: number,
  exprEnd: number,
  numEnd: number,
  fill: string,
  decimal: string,
  ambiguous: boolean,
  magType: string | null,
): SizeFound | null {
  const tenths = toTenths(decimal);
  // 規模 1.0–9.9（取一位小數）
  if (!(tenths >= 10 && tenths <= 99)) return null;
  const mods = modifiers(norm, exprStart, numEnd);
  const strict = mods.strict || STRICT_IN_FILL_RE.test(fill);
  const flags: Flag[] = [];
  if (ambiguous) flags.push({ code: 'size-level-ambiguous' });
  if (belowMin(tenths, strict)) flags.push({ code: 'size-below-min' });
  return {
    start: exprStart,
    end: exprEnd,
    size: { kind: 'magnitude', value: tenths / 10, tolerance: strict ? 'strict' : 'lenient' },
    flags,
    spans: [{ slot: 'size', start: exprStart, end: exprEnd }, ...mods.spans],
    magType,
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
    magType: null,
  };
}

/** 收集一條規則的所有有效比對 */
function collect(re: RegExp, norm: string, build: (m: RegExpExecArray) => SizeFound | null): SizeFound[] {
  const out: SizeFound[] = [];
  forEachMatch(re, norm, (m) => {
    const found = build(m);
    if (found !== null) out.push(found);
    return false;
  });
  return out;
}

function magnitudes(norm: string): SizeFound[] {
  return collect(MAGNITUDE_RE, norm, (m) => {
    const keyword = m[1] ?? '';
    const fill = m[2] ?? '';
    const numText = m[3] ?? '';
    const n = parseNumber(numText);
    if (n === null || n.approx) return null;
    const numEnd = m.index + keyword.length + fill.length + numText.length;
    return magnitudeFound(norm, m.index, m.index + m[0].length, numEnd, fill, n.decimal, false, magTypeOf(keyword));
  });
}

function magnitudesAfter(norm: string): SizeFound[] {
  return collect(MAGNITUDE_AFTER_RE, norm, (m) => {
    const numText = m[1] ?? '';
    const n = parseNumber(numText);
    if (n === null || n.approx) return null;
    return magnitudeFound(norm, m.index, m.index + m[0].length, m.index + numText.length, '', n.decimal, false, null);
  });
}

function intensities(norm: string): SizeFound[] {
  return collect(INTENSITY_RE, norm, (m) => {
    const fill = m[1] ?? '';
    const numText = m[2] ?? '';
    const suffix = m[3]?.trim();
    const v = intensityValue(numText, suffix);
    if (v === null) return null;
    const numEnd = m.index + '震度'.length + fill.length + numText.length;
    // 弱／強沒被採用時（「震度 4 強」），span 只到數值
    const end = suffix !== undefined && !v.suffixOk ? numEnd : m.index + m[0].length;
    return intensityFound(norm, m.index, end, numEnd, v.value);
  });
}

function intensitiesAfter(norm: string): SizeFound[] {
  return collect(INTENSITY_AFTER_RE, norm, (m) => {
    const numText = m[1] ?? '';
    const suffix = m[2];
    const v = intensityValue(numText, suffix);
    if (v === null || (suffix !== undefined && !v.suffixOk)) return null;
    return intensityFound(norm, m.index, m.index + m[0].length, m.index + numText.length, v.value);
  });
}

function scales(norm: string): SizeFound[] {
  return collect(SCALE_RE, norm, (m) => {
    const prefix = m[1] ?? '';
    const fill = m[2] ?? '';
    const numText = m[3] ?? '';
    const suffix = m[4]?.trim();
    const v = intensityValue(numText, suffix);
    if (v === null) return null;
    const numEnd = m.index + prefix.length + fill.length + numText.length;
    const end = suffix !== undefined && !v.suffixOk ? numEnd : m.index + m[0].length;
    return intensityFound(norm, m.index, end, numEnd, v.value);
  });
}

/**
 * 已經接在規模、芮氏、震度、舊制／新制後面的數值起點（不論值合不合法）。這些數值由其他規則處理，
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
  forEachMatch(SCALE_RE, norm, (m) => {
    starts.add(m.index + (m[1] ?? '').length + (m[2] ?? '').length);
    return false;
  });
  return starts;
}

function levels(norm: string): SizeFound[] {
  let claimed: Set<number> | null = null;
  return collect(LEVEL_RE, norm, (m) => {
    const numText = m[1] ?? '';
    const n = parseNumber(numText);
    if (n === null || n.approx) return null;
    const end = m.index + m[0].length;
    // 前後有規模、芮氏、震度時不是歧義，由其他規則處理
    claimed ??= keywordNumberStarts(norm);
    if (claimed.has(m.index)) return null;
    KEYWORD_AFTER_RE.lastIndex = end;
    if (KEYWORD_AFTER_RE.test(norm)) return null;
    return magnitudeFound(norm, m.index, end, m.index + numText.length, '', n.decimal, true, null);
  });
}

interface WordHit {
  start: number;
  end: number;
}

function allWords(re: RegExp, norm: string): WordHit[] {
  const out: WordHit[] = [];
  forEachMatch(re, norm, (m) => {
    out.push({ start: m.index, end: m.index + m[0].length });
    return false;
  });
  return out;
}

interface TermHit extends WordHit {
  term: OfficialTerm;
}

function termHits(norm: string): TermHit[] {
  const out: TermHit[] = [];
  forEachMatch(TERMS_RE, norm, (m) => {
    const term = officialTerm(m[0]);
    if (term !== undefined) out.push({ start: m.index, end: m.index + m[0].length, term });
    return false;
  });
  return out;
}

function sizeKey(size: SizeSpec): string {
  return size.kind === 'unspecified' ? 'u' : `${size.kind}:${size.value}`;
}

/** 原文有沒有提到多個不同的明確大小；有就回傳 size-multiple（detail = 各說法正規化後的寫法，依出現順序） */
function multipleFlag(norm: string, numeric: readonly SizeFound[], terms: readonly TermHit[]): Flag | null {
  const precise = [
    ...numeric.map((f) => ({ start: f.start, end: f.end, size: f.size })),
    ...terms.flatMap((t) => (t.term.size === null ? [] : [{ start: t.start, end: t.end, size: t.term.size }])),
  ].sort((a, b) => a.start - b.start || b.end - a.end);
  const distinct = new Map<string, string>();
  for (const p of precise) {
    const key = sizeKey(p.size);
    if (!distinct.has(key)) distinct.set(key, norm.slice(p.start, p.end));
  }
  return distinct.size > 1 ? { code: 'size-multiple', detail: [...distinct.values()].slice(0, 8).join('、') } : null;
}

export function findSize(norm: string, orig: string): SizeResult {
  const numeric = [
    ...magnitudes(norm),
    ...magnitudesAfter(norm),
    ...intensities(norm),
    ...intensitiesAfter(norm),
    ...scales(norm),
    ...levels(norm),
  ];
  const terms = termHits(norm);

  // 不論最後採用哪一個，這些提醒都要附上
  const extra: Flag[] = [];
  const multiple = multipleFlag(norm, numeric, terms);
  if (multiple !== null) extra.push(multiple);
  const unsupported = allWords(UNSUPPORTED_RE, norm)[0];
  if (unsupported !== undefined) {
    extra.push({ code: 'size-unsupported-term', detail: norm.slice(unsupported.start, unsupported.end) });
  }

  const chosen = pickEarliest<SizeFound>(numeric);
  if (chosen !== null) {
    const flags = [...chosen.flags];
    if (chosen.magType !== null) flags.push({ code: 'size-magnitude-type', detail: chosen.magType });
    return { size: chosen.size, flags: [...flags, ...extra], spans: chosen.spans };
  }

  // 有對應大小的分級名稱（中地震、弱震、小區域有感地震…）
  const mapped = terms.find((t) => t.term.size !== null);
  if (mapped !== undefined && mapped.term.size !== null) {
    const size = mapped.term.size;
    const flags: Flag[] = [{ code: 'size-official-term', detail: mapped.term.word }];
    if (size.kind === 'magnitude' && belowMin(Math.round(size.value * 10), size.tolerance === 'strict')) {
      flags.push({ code: 'size-below-min' });
    }
    return { size, flags: [...flags, ...extra], spans: [{ slot: 'size', start: mapped.start, end: mapped.end }] };
  }

  // 「大地震」「強震」也是官方名稱，但照樣看光譜；官方定義由畫面依 size-unspecified 的 detail 查 src/core/terms.ts
  const big = allWords(BIG_WORDS_RE, norm)[0];
  if (big !== undefined) {
    return {
      size: { kind: 'unspecified' },
      flags: [{ code: 'size-unspecified', detail: orig.slice(big.start, big.end) }, ...extra],
      spans: [{ slot: 'size', start: big.start, end: big.end }],
    };
  }

  // 沒有對應大小的分級名稱（稍顯著、顯著地震）：看光譜（官方定義同樣由畫面查）
  const unmapped = terms[0];
  if (unmapped !== undefined) {
    return {
      size: { kind: 'unspecified' },
      flags: [{ code: 'size-unspecified', detail: orig.slice(unmapped.start, unmapped.end) }, ...extra],
      spans: [{ slot: 'size', start: unmapped.start, end: unmapped.end }],
    };
  }

  const felt = allWords(FELT_WORDS_RE, norm)[0];
  if (felt !== undefined) {
    return {
      size: { kind: 'intensity', value: 1 },
      flags: extra,
      spans: [{ slot: 'size', start: felt.start, end: felt.end }],
    };
  }

  return { size: { kind: 'unspecified' }, flags: [{ code: 'size-unspecified', detail: '' }, ...extra], spans: [] };
}
