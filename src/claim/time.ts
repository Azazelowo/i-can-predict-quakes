/**
 * 時間（docs/MODELS.md 2.2）：找出原文中「最先出現」的時間說法，換算成時間窗。
 *
 * 做法：每一類說法各自找出最早的有效比對，再取起點最早者；起點相同時取較長者
 * （「這週末」勝過「這週」、「11/15 前」勝過「11/15」、「11/10 到 11/15」勝過「11/10」）。
 * 窗口一律由 window.ts 的 computeWindow（＝ windowFor）算出，所以確認卡用同樣的參數重算會得到同樣的結果。
 *
 * 規格沒寫、我們的解讀（見 notes）：
 * - 另收的說法：這個禮拜／這個星期／本禮拜／本星期（thisWeek）、本週末／這個週末（weekend；「這個週」不能把
 *   規格的「週末」切開）、單獨的「月底」（thisMonth）、單獨的「年底」（thisYear）、
 *   這一兩天／這兩三天／未來幾天／接下來幾天／最近幾天（7 天，模糊）、
 *   「未來 N 週」等（未來、接下來可接任何單位）、「N 個月」的「個」可省略於週／禮拜／星期（「兩星期內」）。
 * - 寫了年份或「明年」的說法見 firstCalendarYear：「2026 年底前」「2026 年內」（當年）= thisYear；
 *   「2027 年底前」「明年底前」→ untilDate；「2027 年內」「明年」→ 那一整年。單獨的「1999 年」不算時間。
 * - 排除：「不久前」（過去）、上週末、上個月底、去年底、幾年內（不是今年）。
 * - 「N 月底前」→ untilDate（到該月最後一天，比照「年底前」）；「N 月底」沒有「前」時照規格當成 month。
 * - 「11/15 前後」是「大約那天」，不是「之前」：當成 date。「1/2 的機率」是分數，不是日期。
 * - 範圍的年份由「結束日」決定：結束日照單一日期的規則推（今年；早於發布日改明年），開始日取同一年，
 *   晚於結束日時取前一年（「12/28 到 1/3」跨年）。範圍的第二個日期可只寫日（「11月10日到15日」「11/10~15」）。
 * - 「11/15 前」若寫了年份而且已經過了，[發布日, 該日] 是空的：改成 date（只算那一天）並加 time-past。
 * - 日期型窗口的開始日早於發布日時加 time-past（與確認卡的 isPastWindow 一致）。
 * - 年份：四位數是西元；「民國 N 年」與三位數的「N 年」是民國年（+1911）；「二〇二六」逐字讀。只接受 1900–2200 年。
 * - 數字可帶小數（「1.5 個月」= 45 天，無條件捨去）；「兩三天」取 3 天（見 numbers.ts）。
 */
import { MAX_WINDOW_DAYS, VAGUE_WINDOW_DAYS } from '../core/constants';
import { dayToIso, firstDayOfMonth, isoToDay, monthDayOfDay, yearOfDay } from '../core/time';
import type { Flag, Span, TimeKind, TimeWindow } from '../core/types';
import { CN_NUM_CHARS, CN_PLAIN_DIGITS, NUM_LEFT, NUM_SRC, digitValue, parseNumber } from './numbers';
import { execAt, forEachMatch, pickEarliest } from './scan';
import { computeWindow, lastDayOfMonth } from './window';

export interface TimeResult {
  time: TimeWindow;
  flags: Flag[];
  spans: Span[];
}

interface Ctx {
  norm: string;
  orig: string;
  issuedAt: string;
  d0: number;
  y0: number;
  m0: number;
}

interface Built {
  time: TimeWindow;
  flags: Flag[];
}

interface Found extends Built {
  start: number;
  end: number;
}

/** 明確年份的合理範圍（與網址解碼 src/app/url.ts 相同） */
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

/** 「這幾天」「這兩天」「近日」：7 天（規格 2.2） */
const SHORT_VAGUE_DAYS = 7;
/** 「半年內」：182 天（規格 2.2） */
const HALF_YEAR_DAYS = 182;

// ================================================================ 窗口

function byDays(ctx: Ctx, kind: 'withinDays' | 'vague', days: number): Built {
  const clamped = days > MAX_WINDOW_DAYS;
  return {
    time: computeWindow(kind, ctx.issuedAt, { days: clamped ? MAX_WINDOW_DAYS : days }),
    flags: clamped ? [{ code: 'time-clamped' }] : [],
  };
}

/** 日期型窗口（呼叫端保證 start ≤ end）：早於發布日加 time-past，超過上限截斷並加 time-clamped。 */
function absolute(ctx: Ctx, kind: 'date' | 'untilDate' | 'dateRange' | 'month', start: number, end: number): Built {
  const flags: Flag[] = [];
  if (start < ctx.d0) flags.push({ code: 'time-past' });
  let last = end;
  if (last - start + 1 > MAX_WINDOW_DAYS) {
    last = start + MAX_WINDOW_DAYS - 1;
    flags.push({ code: 'time-clamped' });
  }
  const endIso = dayToIso(last);
  const opts = kind === 'untilDate' ? { end: endIso } : { start: dayToIso(start), end: endIso };
  return { time: computeWindow(kind, ctx.issuedAt, opts), flags };
}

/** 「某日前」：[發布日, 該日]；該日已經過了（只會發生在寫了年份時）就只算那一天，並加 time-past。 */
function until(ctx: Ctx, day: number): Built {
  return day < ctx.d0 ? absolute(ctx, 'date', day, day) : absolute(ctx, 'untilDate', ctx.d0, day);
}

// ================================================================ 曆法

/** 年月日 → 日序；日期不存在或年份不合理時回傳 null。 */
function dayIndex(year: number, month: number, date: number): number | null {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const first = firstDayOfMonth(year, month);
  if (!Number.isInteger(date) || date < 1 || date > lastDayOfMonth(year, month) - first + 1) return null;
  return first + date - 1;
}

/** 沒寫年份的日期：取發布日當年；若早於發布日，改取明年（規格 2.2）。 */
function inferDay(ctx: Ctx, month: number, date: number): number | null {
  const sameYear = dayIndex(ctx.y0, month, date);
  if (sameYear !== null && sameYear >= ctx.d0) return sameYear;
  return dayIndex(ctx.y0 + 1, month, date);
}

// ================================================================ 固定說法

interface WordRule {
  re: RegExp;
  build: (ctx: Ctx, start: number, end: number) => Built;
}

function relative(kind: TimeKind): WordRule['build'] {
  return (ctx) => ({ time: computeWindow(kind, ctx.issuedAt), flags: [] });
}

function vagueRule(kind: 'withinDays' | 'vague', days: number): WordRule['build'] {
  return (ctx, start, end) => {
    const built = byDays(ctx, kind, days);
    return { time: built.time, flags: [{ code: 'time-vague', detail: ctx.orig.slice(start, end) }, ...built.flags] };
  };
}

/** 阿拉伯數字與中文數字（放進 lookbehind 的字元類別） */
const NUMERAL = `\\d${CN_NUM_CHARS}`;
const BEFORE = '(?:之前|以前|前)';

// 「周」在 normalize() 已換成「週」，「台」已換成「臺」，所以這裡只寫「週」。
const WORD_RULES: readonly WordRule[] = [
  { re: /今天|今日|今晚|今夜/g, build: relative('today') },
  { re: /明天|明日|明晚/g, build: relative('tomorrow') },
  { re: /後天/g, build: relative('dayAfterTomorrow') },
  // 大後天：規格指定 kind = date
  { re: /大後天/g, build: (ctx) => absolute(ctx, 'date', ctx.d0 + 3, ctx.d0 + 3) },
  { re: /(?:這個?|本)(?:週|禮拜|星期)/g, build: relative('thisWeek') },
  { re: /下個?(?:週|禮拜|星期)/g, build: relative('nextWeek') },
  // 「這個週末」要整個比對到：否則 thisWeek 的「這個週」會先佔住起點，把規格的「週末」切開
  { re: /(?<!上)(?:這個?|本)?週末/g, build: relative('weekend') },
  {
    re: new RegExp(`這個月|本月|這月|(?<![${NUMERAL}個上下])月底${BEFORE}?`, 'g'),
    build: relative('thisMonth'),
  },
  { re: /下個?月/g, build: relative('nextMonth') },
  {
    re: new RegExp(
      `今年(?:底${BEFORE}?|之內|以內|內)?|(?<![${NUMERAL}去明前後幾多近半])年(?:底${BEFORE}?|之內|以內|內)`,
      'g',
    ),
    build: relative('thisYear'),
  },
  {
    re: /這\s*(?:幾|一兩|兩三|兩)\s*天|(?:未來|接下來)\s*(?:的\s*)?幾\s*天|最近\s*幾\s*天|近日/g,
    build: vagueRule('withinDays', SHORT_VAGUE_DAYS),
  },
  {
    re: /近期|最近|不久(?:之後|後)?(?!\s*(?:之前|以前|前))|即將|很快|隨時/g,
    build: vagueRule('vague', VAGUE_WINDOW_DAYS),
  },
];

function firstWord(ctx: Ctx, rule: WordRule): Found | null {
  rule.re.lastIndex = 0;
  const m = rule.re.exec(ctx.norm);
  if (m === null) return null;
  const start = m.index;
  const end = start + m[0].length;
  return { start, end, ...rule.build(ctx, start, end) };
}

// ================================================================ N 天內

const UNIT = '(天|日|個\\s*(?:週|禮拜|星期|月)|週|禮拜|星期|年)';
const WITHIN = '(?:之內|以內|內)';

const COUNT_RULES: readonly RegExp[] = [
  // N 天內、N 日內、N 週內、N 個禮拜內、N 個星期內、N 個月內、N 年內（內、之內、以內）
  new RegExp(`${NUM_LEFT}(${NUM_SRC})\\s*${UNIT}\\s*${WITHIN}`, 'g'),
  // 未來 N 天、接下來 N 天（也接受週、月、年；後面可再接「內」）
  new RegExp(`(?:未來|接下來)\\s*(?:的\\s*)?(${NUM_SRC})\\s*${UNIT}(?:\\s*${WITHIN})?`, 'g'),
];

const HALF_YEAR_RE = new RegExp(
  `(?:未來|接下來)\\s*(?:的\\s*)?半\\s*年(?:\\s*${WITHIN})?|(?<![${NUMERAL}])半\\s*年\\s*${WITHIN}`,
  'g',
);

function unitDays(unit: string): number {
  if (unit === '天' || unit === '日') return 1;
  if (unit === '年') return 365;
  return unit.endsWith('月') ? 30 : 7;
}

function firstCount(ctx: Ctx, re: RegExp): Found | null {
  let found: Found | null = null;
  forEachMatch(re, ctx.norm, (m) => {
    const n = parseNumber(m[1] ?? '');
    const unit = m[2];
    if (n === null || unit === undefined) return false;
    // 「2026 年內」是曆年，不是 2026 年份的天數（由 firstCalendarYear 處理）
    if (unit === '年' && n.value >= 1000) return false;
    // 1e-9：避免 2.3 × 30 = 68.99999… 被捨成 68
    const days = Math.floor(n.value * unitDays(unit) + 1e-9);
    if (!(days >= 1)) return false;
    found = { start: m.index, end: m.index + m[0].length, ...byDays(ctx, 'withinDays', days) };
    return true;
  });
  return found;
}

function firstHalfYear(ctx: Ctx): Found | null {
  HALF_YEAR_RE.lastIndex = 0;
  const m = HALF_YEAR_RE.exec(ctx.norm);
  if (m === null) return null;
  return { start: m.index, end: m.index + m[0].length, ...byDays(ctx, 'withinDays', HALF_YEAR_DAYS) };
}

// ================================================================ 日期

interface DayRef {
  /** 明確寫出的西元年；沒寫為 null */
  year: number | null;
  month: number;
  date: number;
}

interface DateToken {
  start: number;
  end: number;
  year: number | null;
  month: number;
  /** null：只有月份（「12 月」「12 月底」） */
  date: number | null;
  /** 「N 月底」 */
  monthEnd: boolean;
  /** 斜線寫法：範圍的第二個日期可以只寫日（「11/10~15」） */
  slash: boolean;
}

type CjkPart = Pick<DateToken, 'end' | 'month' | 'date' | 'monthEnd' | 'slash'>;

/** 月、日的數字：1–2 位阿拉伯數字或中文數字（十二、三十一） */
const MD_NUM = '(\\d{1,2}|[〇零一二兩三四五六七八九十]{1,3})';

const YMD_SLASH_RE = /(\d{4})([/.-])(\d{1,2})\2(\d{1,2})(?!\d)/y;
/** 「1/2 的機率」是分數，不是日期 */
const MD_SLASH_RE = /(\d{1,2})\/(\d{1,2})(?!\d|\/\d|\s*(?:的\s*)?(?:機率|機會|可能性))/y;
const YEAR_RE = new RegExp(`(民國\\s*)?(\\d{2,4}|[${CN_PLAIN_DIGITS}]{4})\\s*年\\s*`, 'y');
const CJK_MD_RE = new RegExp(`${MD_NUM}\\s*月\\s*${MD_NUM}(?:\\s*([日號]))?`, 'y');
const CJK_MONTH_END_RE = new RegExp(`${MD_NUM}\\s*月\\s*底`, 'y');
const CJK_MONTH_RE = new RegExp(`${MD_NUM}\\s*月(?!\\s*[日號])`, 'y');
/** 沒寫「日」「號」的日（「11月15前」）後面接這些字時不是日期（「12月 3 級」「11月15天」） */
const NOT_A_BARE_DATE_RE = /\s*[\d天週個年級月點./]/y;
const UNTIL_RE = /\s*(?:之前|以前|前)(?!後)/y;
const RANGE_SEP_RE = /\s*(?:到|至|~|-|–|—|〜)\s*/y;
const DAY_ONLY_RE = new RegExp(`${MD_NUM}\\s*[日號]`, 'y');
const BARE_DAY_RE = /(\d{1,2})(?![\d/.]|\s*[天週個年級月點日號])/y;

/** 日期可以從這些字開始（「民」只用在「民國」） */
const TOKEN_START = new Set([...'0123456789〇零一二兩三四五六七八九十']);
/** 日期的左邊界：前一個字不能是數字（「2026/11/15」裡的「6/11」不算） */
const NUMERAL_BEFORE = new RegExp(`[${NUMERAL}點./]`);

function startsToken(norm: string, i: number): boolean {
  const ch = norm[i];
  if (ch === undefined) return false;
  if (ch === '民') return norm.startsWith('民國', i);
  if (!TOKEN_START.has(ch)) return false;
  const prev = norm[i - 1];
  return prev === undefined || !NUMERAL_BEFORE.test(prev);
}

function smallInt(text: string | undefined): number | null {
  if (text === undefined) return null;
  const n = parseNumber(text);
  return n !== null && !n.approx && Number.isInteger(n.value) ? n.value : null;
}

function parseYear(m: RegExpExecArray): number | null {
  const roc = m[1] !== undefined;
  const raw = m[2] ?? '';
  let year: number;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (roc) {
      if (raw.length > 3) return null;
      year = n + 1911;
    } else if (raw.length === 4) {
      year = n;
    } else if (raw.length === 3) {
      year = n + 1911; // 「115 年」= 民國 115 年
    } else {
      return null; // 兩位數又沒寫「民國」：分不出是哪一年
    }
  } else {
    if (roc) return null;
    let digits = '';
    for (const ch of raw) digits += String(digitValue(ch) ?? '');
    year = Number(digits);
  }
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

/** 「11月15日」「11月底」「12月」（從 i 開始，不含年份） */
function cjkAt(norm: string, i: number): CjkPart | null {
  let m = execAt(CJK_MD_RE, norm, i);
  if (m !== null) {
    const month = smallInt(m[1]);
    const date = smallInt(m[2]);
    const end = i + m[0].length;
    const bare = m[3] === undefined;
    if (
      month !== null && month >= 1 && month <= 12 &&
      date !== null && date >= 1 && date <= 31 &&
      !(bare && execAt(NOT_A_BARE_DATE_RE, norm, end) !== null)
    ) {
      return { end, month, date, monthEnd: false, slash: false };
    }
  }
  m = execAt(CJK_MONTH_END_RE, norm, i);
  if (m !== null) {
    const month = smallInt(m[1]);
    if (month !== null && month >= 1 && month <= 12) {
      return { end: i + m[0].length, month, date: null, monthEnd: true, slash: false };
    }
  }
  m = execAt(CJK_MONTH_RE, norm, i);
  if (m !== null) {
    const month = smallInt(m[1]);
    if (month !== null && month >= 1 && month <= 12) {
      return { end: i + m[0].length, month, date: null, monthEnd: false, slash: false };
    }
  }
  return null;
}

/** 從 i 開始的日期（不檢查左邊界）。 */
function dateTokenAt(norm: string, i: number): DateToken | null {
  let m = execAt(YMD_SLASH_RE, norm, i);
  if (m !== null) {
    const year = Number(m[1]);
    const month = Number(m[3]);
    const date = Number(m[4]);
    // 形狀像「YYYY/MM/DD」卻不是合法日期時，不再把它拆開重讀
    if (dayIndex(year, month, date) === null) return null;
    return { start: i, end: i + m[0].length, year, month, date, monthEnd: false, slash: true };
  }
  m = execAt(YEAR_RE, norm, i);
  if (m !== null) {
    const year = parseYear(m);
    if (year === null) return null;
    const rest = cjkAt(norm, i + m[0].length);
    return rest === null ? null : { start: i, year, ...rest };
  }
  m = execAt(MD_SLASH_RE, norm, i);
  if (m !== null) {
    const month = Number(m[1]);
    const date = Number(m[2]);
    if (month < 1 || month > 12 || date < 1 || date > 31) return null;
    return { start: i, end: i + m[0].length, year: null, month, date, monthEnd: false, slash: true };
  }
  const rest = cjkAt(norm, i);
  return rest === null ? null : { start: i, year: null, ...rest };
}

/** 「到 11/15」「至 15 日」「~15」：範圍的第二個日期。 */
function rangeEnd(norm: string, first: DateToken): { end: number; ref: DayRef } | null {
  if (first.date === null) return null;
  const sep = execAt(RANGE_SEP_RE, norm, first.end);
  if (sep === null) return null;
  const k = first.end + sep[0].length;
  const second = dateTokenAt(norm, k);
  if (second !== null && second.date !== null) {
    return { end: second.end, ref: { year: second.year, month: second.month, date: second.date } };
  }
  // 只寫日：沿用第一個日期的年、月；日比第一個小時不當成範圍（避免跨月的誤讀）
  const m = execAt(DAY_ONLY_RE, norm, k) ?? (first.slash ? execAt(BARE_DAY_RE, norm, k) : null);
  if (m === null) return null;
  const date = smallInt(m[1]);
  if (date === null || date < first.date) return null;
  return { end: k + m[0].length, ref: { year: first.year, month: first.month, date } };
}

function resolveRange(ctx: Ctx, a: DayRef, b: DayRef): [number, number] | null {
  if (a.year !== null && b.year !== null) {
    const s = dayIndex(a.year, a.month, a.date);
    const e = dayIndex(b.year, b.month, b.date);
    if (s === null || e === null) return null;
    return s <= e ? [s, e] : [e, s];
  }
  if (a.year !== null) {
    const s = dayIndex(a.year, a.month, a.date);
    let e = dayIndex(a.year, b.month, b.date);
    if (s === null || e === null) return null;
    if (e < s) e = dayIndex(a.year + 1, b.month, b.date);
    return e === null ? null : [s, e];
  }
  // 結束日決定年份；開始日取同一年，晚於結束日時取前一年（跨年）
  const e = b.year !== null ? dayIndex(b.year, b.month, b.date) : inferDay(ctx, b.month, b.date);
  if (e === null) return null;
  const endYear = yearOfDay(e);
  let s = dayIndex(endYear, a.month, a.date);
  if (s !== null && s > e) s = dayIndex(endYear - 1, a.month, a.date);
  return s === null ? null : [s, e];
}

function dateCandidate(ctx: Ctx, tok: DateToken): Found | null {
  const { norm } = ctx;

  if (tok.date === null) {
    // 只有月份：該月 1 日到最後一天；已過取明年；就是本月則從發布日開始
    const year = tok.year ?? (tok.month < ctx.m0 ? ctx.y0 + 1 : ctx.y0);
    const first = dayIndex(year, tok.month, 1);
    if (first === null) return null;
    const last = lastDayOfMonth(year, tok.month);
    if (tok.monthEnd) {
      const u = execAt(UNTIL_RE, norm, tok.end);
      if (u !== null) return { start: tok.start, end: tok.end + u[0].length, ...until(ctx, last) };
    }
    const start = year === ctx.y0 && tok.month === ctx.m0 ? ctx.d0 : first;
    return { start: tok.start, end: tok.end, ...absolute(ctx, 'month', start, last) };
  }

  const range = rangeEnd(norm, tok);
  if (range !== null) {
    const span = resolveRange(ctx, { year: tok.year, month: tok.month, date: tok.date }, range.ref);
    if (span !== null) return { start: tok.start, end: range.end, ...absolute(ctx, 'dateRange', span[0], span[1]) };
  }

  const day = tok.year !== null ? dayIndex(tok.year, tok.month, tok.date) : inferDay(ctx, tok.month, tok.date);
  if (day === null) return null;
  const u = execAt(UNTIL_RE, norm, tok.end);
  if (u !== null) return { start: tok.start, end: tok.end + u[0].length, ...until(ctx, day) };
  return { start: tok.start, end: tok.end, ...absolute(ctx, 'date', day, day) };
}

function firstDate(ctx: Ctx): Found | null {
  for (let i = 0; i < ctx.norm.length; i++) {
    if (!startsToken(ctx.norm, i)) continue;
    const tok = dateTokenAt(ctx.norm, i);
    if (tok === null) continue;
    const found = dateCandidate(ctx, tok);
    if (found !== null) return found;
  }
  return null;
}

/** 年份之後的「底」「底前」（YEAR_RE 已吃掉「年」與後面的空白） */
const YEAR_END_RE = new RegExp(`底${BEFORE}?`, 'y');
/** 年份之後一定要有「前」的「底前」：用在發布日當年以外的年份 */
const YEAR_END_BEFORE_RE = new RegExp(`底${BEFORE}`, 'y');
/** 年份之後的「內」「之內」「以內」 */
const YEAR_WITHIN_RE = new RegExp(`\\s*${WITHIN}`, 'y');
/** 「明年」「明年底（前）」「明年年底（前）」「明年（之／以）內」 */
const NEXT_YEAR_RE = new RegExp(`明年(?:\\s*年?\\s*(底${BEFORE}?)|\\s*${WITHIN})?`, 'g');

/** 明確寫出的年份：四位數、「民國 N 年」、四個中文數字。三位數的「100 年內」比較像「一百年內」，不算年份。 */
function explicitYear(m: RegExpExecArray): number | null {
  const roc = m[1] !== undefined;
  const raw = m[2] ?? '';
  if (!roc && [...raw].length !== 4) return null;
  return parseYear(m);
}

/** 某一整年：發布日當年 → thisYear（從發布日到年底）；其他年份 → 1/1 到 12/31（已過加 time-past） */
function wholeYear(ctx: Ctx, year: number): Built | null {
  if (year === ctx.y0) return { time: computeWindow('thisYear', ctx.issuedAt), flags: [] };
  const first = dayIndex(year, 1, 1);
  const last = dayIndex(year, 12, 31);
  return first === null || last === null ? null : absolute(ctx, 'dateRange', first, last);
}

/** 某年年底前：發布日當年 → thisYear；其他年份 → 到該年 12/31（已過只算那天並加 time-past） */
function yearEnd(ctx: Ctx, year: number): Built | null {
  if (year === ctx.y0) return { time: computeWindow('thisYear', ctx.issuedAt), flags: [] };
  const last = dayIndex(year, 12, 31);
  return last === null ? null : until(ctx, last);
}

/**
 * 寫了年份或「明年」的說法（規格 2.2 只定義了「今年底」「年底前」「今年內」，其餘是我們的解讀）：
 * - 「2026 年底（前）」「2026 年內」，年份就是發布日當年 → thisYear
 * - 其他年份：「2027 年底前」→ untilDate 到 2027/12/31；「2027 年內」→ 2027 整年（dateRange）
 * - 「明年底（前）」→ untilDate 到明年 12/31；「明年」「明年內」→ 明年整年
 * - 單獨的「1999 年」「2024 年底」（沒有「前」）不算時間：預言常提到過去的地震
 *   （「像 1999 年集集大地震那樣」），當成時間窗會蓋掉後面真正的「下週」。
 */
function firstCalendarYear(ctx: Ctx): Found | null {
  const { norm } = ctx;
  const candidates: (Found | null)[] = [];

  // 「今年」「明年」後面接月份或日期（「明年 1 月」「今年 12 月 15 日」）：當成寫了年份的日期
  RELATIVE_YEAR_RE.lastIndex = 0;
  for (let m = RELATIVE_YEAR_RE.exec(norm); m !== null; m = RELATIVE_YEAR_RE.exec(norm)) {
    const year = m[1] === '明' ? ctx.y0 + 1 : ctx.y0;
    const tok = dateTokenAt(norm, m.index + m[0].length);
    if (tok !== null && tok.year === null) {
      const found = dateCandidate(ctx, { ...tok, start: m.index, year });
      if (found !== null) {
        candidates.push(found);
        break;
      }
    }
  }

  NEXT_YEAR_RE.lastIndex = 0;
  for (let m = NEXT_YEAR_RE.exec(norm); m !== null; m = NEXT_YEAR_RE.exec(norm)) {
    const built = m[1] !== undefined ? yearEnd(ctx, ctx.y0 + 1) : wholeYear(ctx, ctx.y0 + 1);
    if (built !== null) {
      candidates.push({ start: m.index, end: m.index + m[0].length, ...built });
      break;
    }
  }

  candidates.push(firstExplicitYear(ctx));
  return pickEarliest(candidates);
}

/** 「今年」「明年」之後可接日期（空白可有可無） */
const RELATIVE_YEAR_RE = /([今明])年\s*/g;

/** 明確寫出年份的「年底前」「年內」 */
function firstExplicitYear(ctx: Ctx): Found | null {
  const { norm } = ctx;
  for (let i = 0; i < norm.length; i++) {
    if (!startsToken(norm, i)) continue;
    const y = execAt(YEAR_RE, norm, i);
    if (y === null) continue;
    const year = explicitYear(y);
    if (year === null) continue;
    const k = i + y[0].length;
    const endRe = year === ctx.y0 ? YEAR_END_RE : YEAR_END_BEFORE_RE;
    const tail = execAt(endRe, norm, k);
    const within = tail === null ? execAt(YEAR_WITHIN_RE, norm, k) : null;
    const built = tail !== null ? yearEnd(ctx, year) : within !== null ? wholeYear(ctx, year) : null;
    if (built === null) continue;
    const end = k + (tail ?? within)![0].length;
    return { start: i, end, ...built };
  }
  return null;
}

// ================================================================ 對外

/** 找出時間說法；都沒有時用 [發布日, 發布日 + 29] 並加 time-unspecified。 */
export function findTime(norm: string, orig: string, issuedAt: string): TimeResult {
  const d0 = isoToDay(issuedAt);
  const ctx: Ctx = { norm, orig, issuedAt, d0, y0: yearOfDay(d0), m0: monthDayOfDay(d0).month };
  const best = pickEarliest<Found>([
    ...WORD_RULES.map((rule) => firstWord(ctx, rule)),
    ...COUNT_RULES.map((re) => firstCount(ctx, re)),
    firstHalfYear(ctx),
    firstDate(ctx),
    firstCalendarYear(ctx),
  ]);
  if (best === null) {
    return {
      time: computeWindow('unspecified', issuedAt, { days: VAGUE_WINDOW_DAYS }),
      flags: [{ code: 'time-unspecified' }],
      spans: [],
    };
  }
  return { time: best.time, flags: best.flags, spans: [{ slot: 'time', start: best.start, end: best.end }] };
}
