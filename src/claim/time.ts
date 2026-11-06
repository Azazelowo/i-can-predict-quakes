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
import { dayToIso, firstDayOfMonth, isoToDay, monthDayOfDay, weekdayMon0, yearOfDay } from '../core/time';
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
  /** 回傳 null：這個比對不算（例如「下週一定」的「下週一」） */
  build: (ctx: Ctx, start: number, end: number, m: RegExpExecArray) => Built | null;
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

/** 「半個月內」「十天半個月」：15 天 */
const HALF_MONTH_DAYS = 15;
/** 「幾個月內」「數月內」：90 天（模糊） */
const FEW_MONTHS_DAYS = 90;

/** 「幾年內」「未來幾年」：3 年（模糊） */
const FEW_YEARS_DAYS = 3 * 365;

/** 下下個月：那個月 1 日到最後一天 */
function monthAfterNext(ctx: Ctx): Built {
  return absolute(ctx, 'month', firstDayOfMonth(ctx.y0, ctx.m0 + 2), lastDayOfMonth(ctx.y0, ctx.m0 + 2));
}

/** 某年 1/1（元旦）：今天就是 1/1 時算今天，否則是下一個 1/1 */
function nextNewYear(ctx: Ctx): number {
  const thisYear = firstDayOfMonth(ctx.y0, 1);
  return thisYear === ctx.d0 ? thisYear : firstDayOfMonth(ctx.y0 + 1, 1);
}

/** 上旬 1–10 日、中旬 11–20 日、下旬 21 日到月底；月初 = 上旬、月中 = 中旬 */
function monthPart(ctx: Ctx, year: number, month: number, part: string): Built {
  const first = firstDayOfMonth(year, month);
  const last = lastDayOfMonth(year, month);
  if (part === '上旬' || part === '初') return absolute(ctx, 'dateRange', first, first + 9);
  if (part === '中旬' || part === '中') return absolute(ctx, 'dateRange', first + 10, first + 19);
  return absolute(ctx, 'dateRange', first + 20, last);
}

/** 沒寫月份的「上旬」「月初」「月中」「下旬」：這個月的那一段；已經過了就是下個月的；正在那一段裡就從今天開始 */
function bareMonthPart(ctx: Ctx, part: string): Built {
  const key = part.replace('月', '');
  for (const offset of [0, 1]) {
    const built = monthPart(ctx, ctx.y0, ctx.m0 + offset, key);
    const end = isoToDay(built.time.end);
    if (end < ctx.d0) continue;
    const start = isoToDay(built.time.start);
    return start < ctx.d0 ? absolute(ctx, 'dateRange', ctx.d0, end) : built;
  }
  return monthPart(ctx, ctx.y0, ctx.m0 + 1, key);
}

/** 「過、超過、經過…」：「過 N 天」只在前面不是這些字時才是「N 天後」 */
const NOT_PASS_BEFORE = '超經度透通錯難不';

// 「周」在 normalize() 已換成「週」，「台」已換成「臺」，所以這裡只寫「週」。
const WORD_RULES: readonly WordRule[] = [
  // 「去年的今天」說的是去年，不是今天
  { re: /(?<!年的?)(?:今天|今日)|今晚|今夜/g, build: relative('today') },
  { re: /明天|明日|明晚/g, build: relative('tomorrow') },
  // 「地震過後天氣變冷」「之後天天」「先天後天」的「後天」不是日子
  { re: /(?<![過之以然最先])後天(?![氣性])/g, build: relative('dayAfterTomorrow') },
  // 大後天：規格指定 kind = date
  { re: /大後天/g, build: (ctx) => absolute(ctx, 'date', ctx.d0 + 3, ctx.d0 + 3) },
  // 今明兩天：今天和明天；明後天：明天和後天
  { re: /今明(?:兩)?天/g, build: (ctx) => byDays(ctx, 'withinDays', 2) },
  { re: /明後(?:兩)?天/g, build: (ctx) => absolute(ctx, 'dateRange', ctx.d0 + 1, ctx.d0 + 2) },
  // 元旦（1/1）、跨年（12/31 到 1/1）；「元旦前」到 1/1
  {
    re: new RegExp(`元旦(${BEFORE}(?!後))?`, 'g'),
    build: (ctx, _s, _e, m) => {
      const day = nextNewYear(ctx);
      return m[1] !== undefined ? until(ctx, day) : absolute(ctx, 'date', day, day);
    },
  },
  {
    re: /跨年/g,
    build: (ctx) => {
      const day = nextNewYear(ctx);
      return day === ctx.d0 ? absolute(ctx, 'date', day, day) : absolute(ctx, 'dateRange', day - 1, day);
    },
  },
  // 上旬、中旬、下旬、月初、月中（沒寫月份）：「N 月上旬」由日期處理
  { re: /(?<![\d〇零一二兩三四五六七八九十月個這本上下])(?:上旬|中旬|下旬|月初|月中)/g, build: (ctx, s, e) => bareMonthPart(ctx, ctx.norm.slice(s, e)) },
  // 這三天、這兩週、這十天：N 天（「這兩天」「這幾天」是口語，由模糊規則處理）
  {
    re: new RegExp(
      `這\\s*(?!(?:幾|一兩|兩三|兩)\\s*天|一\\s*(?:個\\s*)?(?:天|日|週|禮拜|星期))(${NUM_SRC})\\s*(天|日|個?\\s*(?:週|禮拜|星期))(?!\\s*${BEFORE})`,
      'g',
    ),
    build: (ctx, _s, _e, m) => {
      const n = parseNumber(m[1] ?? '');
      if (n === null || !(n.value >= 1)) return null;
      const days = Math.floor(n.value * ((m[2] ?? '').match(/[天日]/) ? 1 : 7) + 1e-9);
      return byDays(ctx, 'withinDays', days);
    },
  },
  { re: /(?:這(?:一個|一|個)?|本)(?:週|禮拜|星期)/g, build: relative('thisWeek') },
  // 下下週：下下週一到下下週日（沒有對應的 TimeKind，用日期範圍）；比「下週」早一個字開始，所以會優先
  {
    re: /下下(?:一?個)?(?:週|禮拜|星期)/g,
    build: (ctx) => {
      const w0 = weekdayMon0(ctx.d0);
      return absolute(ctx, 'dateRange', ctx.d0 + 14 - w0, ctx.d0 + 20 - w0);
    },
  },
  { re: /下(?:一個|一|個)?(?:週|禮拜|星期)/g, build: relative('nextWeek') },
  // 週末前：到這週五（比「週末」長，起點相同時優先）
  {
    re: new RegExp(`(?<!上)(?:這個?|本)?週末\\s*${BEFORE}(?!後)`, 'g'),
    build: (ctx) => until(ctx, ctx.d0 + 4 - weekdayMon0(ctx.d0)),
  },
  // 「這個週末」要整個比對到：否則 thisWeek 的「這個週」會先佔住起點，把規格的「週末」切開
  { re: /(?<!上)(?:這個?|本)?週末/g, build: relative('weekend') },
  {
    re: new RegExp(`這個月|本月|這月|(?<![${NUMERAL}個上下])月底${BEFORE}?`, 'g'),
    build: relative('thisMonth'),
  },
  // 下下個月：比「下個月」早一個字開始，所以會優先
  { re: /下下個?月/g, build: monthAfterNext },
  { re: /下個?月/g, build: relative('nextMonth') },
  {
    re: new RegExp(
      `今年(?:底${BEFORE}?|之內|以內|內)?|(?<![${NUMERAL}去明前後幾多近半])年(?:底${BEFORE}?|之內|以內|內)`,
      'g',
    ),
    build: relative('thisYear'),
  },
  {
    // 這幾天、這兩天、未來幾天、最近幾天、近日、幾天內、數日內、幾天後、過兩天、過幾天：7 天（模糊）
    re: new RegExp(
      `這\\s*(?:幾|一兩|兩三|兩)\\s*天|(?:未來|接下來)\\s*(?:的\\s*)?幾\\s*天|最近\\s*幾\\s*天|近日|` +
        `(?:幾|數)\\s*[天日]\\s*(?:之內|以內|內|之後|以後|後)|(?<![${NOT_PASS_BEFORE}])過\\s*(?:幾|一兩|兩三|兩)\\s*天`,
      'g',
    ),
    build: vagueRule('withinDays', SHORT_VAGUE_DAYS),
  },
  // 幾週內、數週內、幾個禮拜後：30 天（模糊）
  { re: /(?:幾|數)\s*個?\s*(?:週|禮拜|星期)\s*(?:之內|以內|內|之後|以後|後)/g, build: vagueRule('withinDays', VAGUE_WINDOW_DAYS) },
  // 幾個月內、數月內：90 天（模糊）
  { re: /(?:幾|數)\s*個\s*月\s*(?:之內|以內|內)|數\s*月\s*(?:之內|以內|內)/g, build: vagueRule('withinDays', FEW_MONTHS_DAYS) },
  // 十天半個月（內）：15 天（模糊）
  { re: /十天半個?月(?:\s*(?:之內|以內|內))?/g, build: vagueRule('withinDays', HALF_MONTH_DAYS) },
  // 幾年內、數年內、未來幾年：3 年（模糊）
  { re: /(?:幾|數)\s*年\s*(?:之內|以內|內)|(?:未來|接下來)\s*(?:的\s*)?(?:幾|數)\s*年/g, build: vagueRule('withinDays', FEW_YEARS_DAYS) },
  {
    // 「離台北最近的斷層」的「最近」是距離，不是時間
    re: /近期|最近(?!的)|不久(?:之後|後)?(?!\s*(?:之前|以前|前))|即將|很快|隨時/g,
    build: vagueRule('vague', VAGUE_WINDOW_DAYS),
  },
];

// ================================================================ 星期幾

/** 星期幾：一 = 0 … 六 = 5，日／天 = 6（和 weekdayMon0 一致） */
function weekdayIndex(ch: string): number {
  const k = '一二三四五六'.indexOf(ch);
  return k >= 0 ? k : 6;
}

/**
 * 「星期五」「週五」「下週三」「這個禮拜天」。「上週三」是過去，不算。
 * 空白一律有上限（\s{0,2}）：連續的 \s* 在一長串空白上會反覆回溯，6000 字的輸入要跑幾十秒。
 */
const WEEKDAY_HEAD_RE = /(?<!上\s{0,2}(?:一?個\s{0,2})?)(下下|下|這|本)?\s{0,2}(?:一?個\s{0,2})?(?:週|禮拜|星期)([一二三四五六日天])/g;
/** 後面再接的星期幾：「週一到週五」「六日」「一、三、五」 */
const WEEKDAY_MORE_RE = /\s{0,2}(?:到|至|~|-|–|—|〜|、|和|或|跟|與|及)?\s{0,2}(?:週|禮拜|星期)?([一二三四五六日天])/y;

/**
 * 星期字後面接這些字時，那個字屬於別的詞，不是星期幾：
 * 「下週五級地震」（五級）、「下週二度強震」「下週一波」「一連三天」「一次」「一整週」「下週一定」「一直」、
 * 「這週天氣」「日本」「日子」「日期」。
 */
function weekdayCharOk(ch: string, after: string): boolean {
  if (/^\s*[級度波連次整口]/.test(after)) return false;
  if (ch === '一' && /^[定直起樣些點般切]/.test(after)) return false;
  if (ch === '日' && /^[本子氣期常]/.test(after)) return false;
  if (ch === '天' && /^[氣子下空]/.test(after)) return false;
  return true;
}

/**
 * 沒寫這／下：最近的那一天（今天就是星期五時算今天）；這週、本週：這週的那一天（已過加 time-past）；
 * 下週、下下週：那一週的那一天。好幾天（週一到週五、六日、一三五）取第一天到最後一天；
 * 後面接「前」時是「到那一天為止」（「下週三前」= 今天到下週三）。
 */
function allWeekdays(ctx: Ctx): Found[] {
  const out: Found[] = [];
  const { norm } = ctx;
  WEEKDAY_HEAD_RE.lastIndex = 0;
  for (let m = WEEKDAY_HEAD_RE.exec(norm); m !== null; m = WEEKDAY_HEAD_RE.exec(norm)) {
    const firstCh = m[2] ?? '';
    let end = m.index + m[0].length;
    if (!weekdayCharOk(firstCh, norm.slice(end))) continue;
    let lastCh = firstCh;
    for (let t = execAt(WEEKDAY_MORE_RE, norm, end); t !== null; t = execAt(WEEKDAY_MORE_RE, norm, end)) {
      const ch = t[1] ?? '';
      const next = end + t[0].length;
      if (!weekdayCharOk(ch, norm.slice(next))) break;
      lastCh = ch;
      end = next;
    }
    const a = weekdayIndex(firstCh);
    const w0 = weekdayMon0(ctx.d0);
    const monday = ctx.d0 - w0;
    let first: number;
    if (m[1] === '下下') first = monday + 14 + a;
    else if (m[1] === '下') first = monday + 7 + a;
    else if (m[1] === '這' || m[1] === '本') first = monday + a;
    else first = ctx.d0 + ((a - w0 + 7) % 7);
    const last = first + ((weekdayIndex(lastCh) - a + 7) % 7);
    const u = execAt(UNTIL_RE, norm, end);
    let built: Built;
    if (u !== null) {
      built = until(ctx, last);
      end += u[0].length;
    } else {
      built = last === first ? absolute(ctx, 'date', first, first) : absolute(ctx, 'dateRange', first, last);
    }
    out.push({ start: m.index, end, ...built });
    WEEKDAY_HEAD_RE.lastIndex = end;
  }
  return out;
}

/** 一條規則在原文中的所有比對（多個時間說法要全部找出來，才知道預言有沒有同時說好幾個時間） */
function allWord(ctx: Ctx, rule: WordRule): Found[] {
  const out: Found[] = [];
  rule.re.lastIndex = 0;
  for (let m = rule.re.exec(ctx.norm); m !== null; m = rule.re.exec(ctx.norm)) {
    const start = m.index;
    const end = start + m[0].length;
    const built = rule.build(ctx, start, end, m);
    if (built !== null) out.push({ start, end, ...built });
  }
  return out;
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

/** 半年內、未來半年（182 天）；半個月內、未來半個月（15 天）。m[1] 是「年」或「月」 */
const HALF_RE = new RegExp(
  `(?:未來|接下來)\\s*(?:的\\s*)?半\\s*(年|個\\s*月)(?:\\s*${WITHIN})?|(?<![${NUMERAL}])半\\s*(年|個\\s*月)\\s*${WITHIN}`,
  'g',
);
/** 半年後、半個月後：那一天 */
const HALF_AFTER_RE = new RegExp(`(?<![${NUMERAL}])半\\s*(年|個\\s*月)\\s*(?:之後|以後|後)(?!\\s*${WITHIN})(?!天)`, 'g');

function unitDays(unit: string): number {
  if (unit === '天' || unit === '日') return 1;
  if (unit === '年') return 365;
  return unit.endsWith('月') ? 30 : 7;
}

/** 「N 天」換成天數；不合理（0 天、「2026 年」這種年份）時回傳 null */
function countDays(numText: string | undefined, unit: string | undefined): number | null {
  const n = parseNumber(numText ?? '');
  if (n === null || unit === undefined) return null;
  // 「2026 年內」「2027 年後」是曆年，不是 2026 年份的天數（由 firstCalendarYear 處理）
  if (unit === '年' && n.value >= 1000) return null;
  // 1e-9：避免 2.3 × 30 = 68.99999… 被捨成 68
  const days = Math.floor(n.value * unitDays(unit) + 1e-9);
  return days >= 1 ? days : null;
}

function allCount(ctx: Ctx, re: RegExp): Found[] {
  const out: Found[] = [];
  forEachMatch(re, ctx.norm, (m) => {
    const days = countDays(m[1], m[2]);
    if (days !== null) out.push({ start: m.index, end: m.index + m[0].length, ...byDays(ctx, 'withinDays', days) });
    return false;
  });
  return out;
}

/** 「72 小時內」「未來 48 小時」：天數 = 小時 ÷ 24 無條件進位（72 小時 = 3 天，和「3 天內」一樣含今天） */
const HOURS_RULES: readonly RegExp[] = [
  new RegExp(`${NUM_LEFT}(${NUM_SRC})\\s*(?:個\\s*)?(?:小時|鐘頭)\\s*${WITHIN}`, 'g'),
  new RegExp(`(?:未來|接下來)\\s*(?:的\\s*)?(${NUM_SRC})\\s*(?:個\\s*)?(?:小時|鐘頭)(?:\\s*${WITHIN})?`, 'g'),
];
/** 「48 小時後」：那一天（發布日 + 小時 ÷ 24 四捨五入；6 小時後還是今天） */
const HOURS_AFTER_RE = new RegExp(
  `${NUM_LEFT}(${NUM_SRC})\\s*(?:個\\s*)?(?:小時|鐘頭)\\s*(?:之後|以後|後)(?!\\s*${WITHIN})`,
  'g',
);

function allHours(ctx: Ctx): Found[] {
  const out: Found[] = [];
  for (const re of HOURS_RULES) {
    forEachMatch(re, ctx.norm, (m) => {
      const n = parseNumber(m[1] ?? '');
      if (n !== null && n.value > 0) {
        out.push({ start: m.index, end: m.index + m[0].length, ...byDays(ctx, 'withinDays', Math.ceil(n.value / 24)) });
      }
      return false;
    });
  }
  forEachMatch(HOURS_AFTER_RE, ctx.norm, (m) => {
    const n = parseNumber(m[1] ?? '');
    if (n !== null && n.value > 0) {
      const day = ctx.d0 + Math.round(n.value / 24);
      out.push({ start: m.index, end: m.index + m[0].length, ...absolute(ctx, 'date', day, day) });
    }
    return false;
  });
  return out;
}

/** 「169 天後」「3 週後」「2 個月以後」：那一天（發布日 + 天數）。後面接「內」時不算（「3 天後之內」不是一個日期） */
const AFTER_RE = new RegExp(
  `${NUM_LEFT}(${NUM_SRC})\\s*${UNIT}\\s*(?:之後|以後|後)(?!\\s*${WITHIN})(?!天)`,
  'g',
);
/** 「過三天」「再過一週」：同「三天後」。「過兩天」「過幾天」是口語的「這幾天」，由模糊規則處理；「超過 3 天」不算 */
const PASS_RE = new RegExp(
  `(?<![${NOT_PASS_BEFORE}])過\\s*(?!(?:一兩|兩三|兩|幾)\\s*[天日])(${NUM_SRC})\\s*${UNIT}(?!\\s*${WITHIN})`,
  'g',
);

function allAfter(ctx: Ctx): Found[] {
  const out: Found[] = [];
  const visit = (m: RegExpExecArray): boolean => {
    const days = countDays(m[1], m[2]);
    if (days !== null && days <= MAX_WINDOW_DAYS) {
      const day = ctx.d0 + days;
      out.push({ start: m.index, end: m.index + m[0].length, ...absolute(ctx, 'date', day, day) });
    }
    return false;
  };
  forEachMatch(AFTER_RE, ctx.norm, visit);
  forEachMatch(PASS_RE, ctx.norm, visit);
  forEachMatch(HALF_AFTER_RE, ctx.norm, (m) => {
    const day = ctx.d0 + ((m[1] ?? '') === '年' ? HALF_YEAR_DAYS : HALF_MONTH_DAYS);
    out.push({ start: m.index, end: m.index + m[0].length, ...absolute(ctx, 'date', day, day) });
    return false;
  });
  return out;
}

function allHalf(ctx: Ctx): Found[] {
  const out: Found[] = [];
  forEachMatch(HALF_RE, ctx.norm, (m) => {
    const unit = m[1] ?? m[2] ?? '';
    const days = unit === '年' ? HALF_YEAR_DAYS : HALF_MONTH_DAYS;
    out.push({ start: m.index, end: m.index + m[0].length, ...byDays(ctx, 'withinDays', days) });
    return false;
  });
  return out;
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
/** 「1/2 的機率」「機率 1/10」「1/3 的專家」是分數，不是日期 */
const MD_SLASH_RE =
  /(?<!(?:機率|機會|比例|佔|占)\s{0,2})(\d{1,2})\/(\d{1,2})(?!\d|\/\d|\s*(?:的\s*)?(?:機率|機會|可能性|比例|人|專家|網友|民眾|學者))/y;
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

/** 農曆、陰曆、舊曆的日期不能直接當國曆（由 time-unrecognized 提醒使用者自己選日期） */
const LUNAR_BEFORE_RE = /(?:農曆|陰曆|舊曆)\s{0,2}$/;
/** 「N 月上旬」「N 月中」：那個月的那一段（年份比照只寫月份的規則） */
const MONTH_PART_RE = /\s*(上旬|中旬|下旬|初|中)(?![\d〇零一二兩三四五六七八九十])/y;

/** 原文中所有的日期（「11/15 或 12/20」兩個都要找到）；比對到的字不再重複使用 */
function allDates(ctx: Ctx): Found[] {
  const out: Found[] = [];
  const { norm } = ctx;
  for (let i = 0; i < norm.length; i++) {
    if (!startsToken(norm, i)) continue;
    const tok = dateTokenAt(norm, i);
    if (tok === null) continue;
    if (LUNAR_BEFORE_RE.test(norm.slice(Math.max(0, i - 4), i))) {
      i = tok.end - 1;
      continue;
    }
    let found: Found | null = null;
    const part = tok.date === null && !tok.monthEnd ? execAt(MONTH_PART_RE, norm, tok.end) : null;
    if (part !== null) {
      const year = tok.year ?? (tok.month < ctx.m0 ? ctx.y0 + 1 : ctx.y0);
      found = { start: tok.start, end: tok.end + part[0].length, ...monthPart(ctx, year, tok.month, part[1] ?? '') };
    } else {
      found = dateCandidate(ctx, tok);
    }
    if (found === null) continue;
    out.push(found);
    i = found.end - 1;
  }
  return out;
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
    const year = ctx.y0 + (m[1] === '明' ? 1 : m[1] === '去' ? -1 : m[1] === '前' ? -2 : 0);
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

/** 「今年」「明年」「去年」「前年」之後可接日期（空白可有可無）；去年、前年的日期會加 time-past */
const RELATIVE_YEAR_RE = /([今明去前])年\s*/g;

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

function isVague(f: Found): boolean {
  return f.flags.some((flag) => flag.code === 'time-vague');
}

function isPast(f: Found): boolean {
  return f.flags.some((flag) => flag.code === 'time-past');
}

/** 由左到右、起點相同取較長者；和已收下的說法重疊的不算（「下下週」裡的「下週」、「今年 12 月」裡的「今年」） */
function nonOverlapping(candidates: readonly Found[]): Found[] {
  const sorted = [...candidates].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Found[] = [];
  for (const c of sorted) {
    if (out.every((a) => c.end <= a.start || c.start >= a.end)) out.push(c);
  }
  return out;
}

/** 「今天起一週內」「明天開始三天內」：起點 + 天數 */
const FROM_GAP_RE = /^\s{0,2}(?:起|開始|算起)\s{0,2}(?:的\s{0,2})?$/;
/** 「從今天到月底」「明天到下週三」「這週到下週」：起點到終點 */
const TO_GAP_RE = /^\s{0,2}(?:到|至|~|-|–|—|〜|一直到|直到)\s{0,2}$/;

/** 相鄰的兩個說法合成一個範圍（合併後起點相同、比較長，所以會取代原本的兩個說法） */
function mergedRanges(ctx: Ctx, candidates: readonly Found[]): Found[] {
  const out: Found[] = [];
  const sorted = nonOverlapping(candidates);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const gap = ctx.norm.slice(a.end, b.start);
    const from = isoToDay(a.time.start);
    let to: number | null = null;
    if (FROM_GAP_RE.test(gap) && b.time.kind === 'withinDays') to = from + b.time.days - 1;
    else if (TO_GAP_RE.test(gap)) to = isoToDay(b.time.end);
    if (to === null || to < from) continue;
    out.push({ start: a.start, end: b.end, ...absolute(ctx, 'dateRange', from, to) });
  }
  return out;
}

/** 兩個時間說法之間只有這些字時，是同一組選項（「明天或下個月」「11/15、12/20」） */
const CLUSTER_GAP_RE = /^[\s、,，或和及與跟]*$/;

/**
 * 從候選中選一個：有「地震說法」的位置（anchor：採用的大小，或第一個地震用詞）時，取 anchor 前面最後一組說法的
 * 第一個（「今天在群組看到：下週花蓮會有規模 6」是下週；「明天或下個月，花蓮會有規模 6」是明天）；
 * anchor 前面沒有時間說法時，取最先出現的。
 */
function choose(ctx: Ctx, pool: readonly Found[], anchor: number | null): Found | null {
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => a.start - b.start);
  if (anchor === null) return sorted[0]!;
  let k = -1;
  for (let i = 0; i < sorted.length; i++) if (sorted[i]!.start < anchor) k = i;
  if (k < 0) return sorted[0]!;
  while (k > 0 && CLUSTER_GAP_RE.test(ctx.norm.slice(sorted[k - 1]!.end, sorted[k]!.start))) k -= 1;
  return sorted[k]!;
}

/**
 * 認不出、但看得出是時間的說法（節日、連假、農曆）：仍用 30 天，但改用 time-unrecognized 提醒使用者自己選日期，
 * 不說「沒說時間」。「三年前」「幾年後」不算（前面是數字）。
 */
const UNRECOGNIZED_RE =
  /過年|春節|農曆新年|除夕|元宵|清明|端午|中秋|重陽|連假|農曆|陰曆|舊曆|(?<![\d〇零一二兩三四五六七八九十百幾數多])年[前後](?!天)/;

/**
 * 找出時間說法；都沒有時用 [發布日, 發布日 + 29] 並加 time-unspecified。
 *
 * 選法（docs/MODELS.md 2.2）：
 * 1. 每一類說法的每個比對都是候選；相鄰的「今天起一週內」「從今天到月底」先合成範圍；重疊的只留起點最早、最長的。
 * 2. 優先用明確說法（不是近期、最近、這幾天…這類模糊說法）；明確說法裡又優先用還沒過去的
 *    （「2024年4月3日花蓮大地震後，下個月…」是下個月）。
 * 3. 在這些說法裡，取地震說法（anchor）前面最近的那一組（choose）。
 */
export function findTime(norm: string, orig: string, issuedAt: string, anchor: number | null = null): TimeResult {
  const d0 = isoToDay(issuedAt);
  const ctx: Ctx = { norm, orig, issuedAt, d0, y0: yearOfDay(d0), m0: monthDayOfDay(d0).month };
  const raw: Found[] = [
    ...WORD_RULES.flatMap((rule) => allWord(ctx, rule)),
    ...allWeekdays(ctx),
    ...COUNT_RULES.flatMap((re) => allCount(ctx, re)),
    ...allHours(ctx),
    ...allAfter(ctx),
    ...allHalf(ctx),
    ...allDates(ctx),
  ];
  const calendar = firstCalendarYear(ctx);
  if (calendar !== null) raw.push(calendar);
  const candidates = nonOverlapping([...raw, ...mergedRanges(ctx, raw)]);

  const specific = candidates.filter((c) => !isVague(c));
  const future = specific.filter((c) => !isPast(c));
  const pool = future.length > 0 ? future : specific.length > 0 ? specific : candidates;
  const best = choose(ctx, pool, anchor);
  if (best === null) {
    const flags: Flag[] = [{ code: 'time-unspecified' }];
    const hint = UNRECOGNIZED_RE.exec(norm);
    if (hint !== null) {
      flags.push({ code: 'time-unrecognized', detail: orig.slice(hint.index, hint.index + hint[0].length) });
    }
    return { time: computeWindow('unspecified', issuedAt, { days: VAGUE_WINDOW_DAYS }), flags, spans: [] };
  }
  // 另一個時間：只算和採用的說法同一類的（採用明確說法時，模糊說法不算；採用未來的時間時，過去的事件日期不算）
  const others = candidates.filter((c) => (isVague(best) || !isVague(c)) && (isPast(best) || !isPast(c)));
  const multiple = multipleTimes(ctx, others);
  return {
    time: best.time,
    flags: multiple === null ? best.flags : [...best.flags, multiple],
    spans: [{ slot: 'time', start: best.start, end: best.end }],
  };
}

/** 原文有沒有提到多個不同的時間窗（候選已經去掉重疊的部分）；detail 為各說法正規化後的寫法 */
function multipleTimes(ctx: Ctx, candidates: readonly Found[]): Flag | null {
  const distinct = new Map<string, string>();
  for (const c of [...candidates].sort((a, b) => a.start - b.start)) {
    const key = `${c.time.start}|${c.time.end}`;
    if (!distinct.has(key)) distinct.set(key, ctx.norm.slice(c.start, c.end));
  }
  return distinct.size > 1 ? { code: 'time-multiple', detail: [...distinct.values()].join('、') } : null;
}
