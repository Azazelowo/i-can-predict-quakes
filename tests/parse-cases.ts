/**
 * 解析器的表格案例（docs/MODELS.md 第 2 節）。
 *
 * 每一筆的預期值都是「依規格手算」：時間窗依 2.2 的表格、地點依 2.3、大小依 2.4、其他旗標依 2.5；
 * 縣市 id、分區與合稱的成員依規格指定的詞表 src/core/regions.ts。不是先跑解析器再抄結果。
 *
 * flags 是旗標代碼的「完整集合」（不可多也不可少，順序不拘）。規格有定義 detail 的旗標
 * （region-out-of-scope 的地名、size-unspecified 的原文用詞）才比對 detail，其餘只比對代碼。
 *
 * 名稱帶【解讀】的案例：規格在這裡有歧義，測的是我們選的解讀（理由寫在案例上方的註解）。
 *
 * 發布日（星期以週一 = 0）：
 *   WED   2026-11-04 週三 w0 = 2（主要的發布日）
 *   SAT   2026-11-07 週六 w0 = 5
 *   SUN   2026-11-08 週日 w0 = 6
 *   MON   2026-11-09 週一 w0 = 0
 *   DEC28 2026-12-28 週一（這週、下週跨年）
 *   DEC31 2026-12-31 週四（本月、今年只剩一天）
 *   JAN31 2026-01-31 週六（下個月是只有 28 天的 2 月）
 */
import type {
  FlagCode,
  GroupId,
  RegionSpec,
  SizeSpec,
  TimeKind,
  TimeWindow,
  Tolerance,
} from '../src/core/types';

export type ExpectedFlag = FlagCode | { code: FlagCode; detail: string };

export interface ParseCase {
  name: string;
  text: string;
  issuedAt: string;
  expect: {
    time: TimeWindow;
    region: RegionSpec;
    size: SizeSpec;
    flags: readonly ExpectedFlag[];
  };
}

// ================================================================ 發布日

export const WED = '2026-11-04';
export const SAT = '2026-11-07';
export const SUN = '2026-11-08';
export const MON = '2026-11-09';
export const DEC28 = '2026-12-28';
export const DEC31 = '2026-12-31';
export const JAN31 = '2026-01-31';

// ================================================================ 小工具

function w(kind: TimeKind, start: string, end: string, days: number): TimeWindow {
  return { kind, start, end, days };
}

const TAIWAN: RegionSpec = { kind: 'taiwan' };

/** 縣市（依首次出現排序）；外推預設 30 公里，提到外海等字時 60 公里 */
function at(ids: readonly string[], bufferKm = 30, group?: GroupId): RegionSpec {
  return group === undefined
    ? { kind: 'counties', ids: [...ids], bufferKm }
    : { kind: 'counties', ids: [...ids], bufferKm, group };
}

// 分區的縣市（src/core/regions.ts 的 GROUPS，順序照詞表）
const NORTH = ['C', 'A', 'F', 'H', 'O', 'J'];
const CENTRAL = ['K', 'B', 'N', 'M', 'P'];
const SOUTH = ['I', 'Q', 'D', 'E', 'T'];
const EAST = ['G', 'U', 'V'];
const HUADONG = ['U', 'V'];

function mag(value: number, tolerance: Tolerance): SizeSpec {
  return { kind: 'magnitude', value, tolerance };
}

function shindo(value: number): SizeSpec {
  return { kind: 'intensity', value };
}

const NO_SIZE: SizeSpec = { kind: 'unspecified' };

/** size-unspecified，detail = 原文用詞（都沒有時為空字串） */
function word(detail: string): ExpectedFlag {
  return { code: 'size-unspecified', detail };
}

/** region-out-of-scope，detail = 國外地名，以「、」連接 */
function abroad(detail: string): ExpectedFlag {
  return { code: 'region-out-of-scope', detail };
}

function c(
  name: string,
  issuedAt: string,
  text: string,
  time: TimeWindow,
  region: RegionSpec,
  size: SizeSpec,
  flags: readonly ExpectedFlag[] = [],
): ParseCase {
  return { name, text, issuedAt, expect: { time, region, size, flags } };
}

/** WED（d0 = 2026-11-04，w0 = 2）的常用窗口，依 2.2 的表格手算 */
const wed = {
  today: w('today', '2026-11-04', '2026-11-04', 1),
  tomorrow: w('tomorrow', '2026-11-05', '2026-11-05', 1),
  dayAfterTomorrow: w('dayAfterTomorrow', '2026-11-06', '2026-11-06', 1),
  /** [d0, d0 + 6 − w0] */
  thisWeek: w('thisWeek', '2026-11-04', '2026-11-08', 5),
  /** [d0 + 7 − w0, d0 + 13 − w0] */
  nextWeek: w('nextWeek', '2026-11-09', '2026-11-15', 7),
  /** [d0 + 5 − w0, d0 + 6 − w0] */
  weekend: w('weekend', '2026-11-07', '2026-11-08', 2),
  thisMonth: w('thisMonth', '2026-11-04', '2026-11-30', 27),
  nextMonth: w('nextMonth', '2026-12-01', '2026-12-31', 31),
  december: w('month', '2026-12-01', '2026-12-31', 31),
  /** 11/04–11/30 共 27 天 + 12 月 31 天 */
  thisYear: w('thisYear', '2026-11-04', '2026-12-31', 58),
  within3: w('withinDays', '2026-11-04', '2026-11-06', 3),
  within7: w('withinDays', '2026-11-04', '2026-11-10', 7),
  within10: w('withinDays', '2026-11-04', '2026-11-13', 10),
  within14: w('withinDays', '2026-11-04', '2026-11-17', 14),
  within30: w('withinDays', '2026-11-04', '2026-12-03', 30),
  /** 3650 天：2036-11-04 = d0 + 3653（其間有 2028、2032、2036 三個 2/29） */
  within3650: w('withinDays', '2026-11-04', '2036-10-31', 3650),
  vague: w('vague', '2026-11-04', '2026-12-03', 30),
  unspecified: w('unspecified', '2026-11-04', '2026-12-03', 30),
  nov15: w('date', '2026-11-15', '2026-11-15', 1),
  nov20: w('date', '2026-11-20', '2026-11-20', 1),
  until15: w('untilDate', '2026-11-04', '2026-11-15', 12),
  range10to15: w('dateRange', '2026-11-10', '2026-11-15', 6),
} as const;

// ================================================================ 案例

export const PARSE_CASES: readonly ParseCase[] = [
  // ------------------------------------------------ 2.2 時間：表格每一列（WED）
  c('時間｜今天', WED, '今天花蓮會有地震', wed.today, at(['U']), NO_SIZE, [word('')]),
  c('時間｜今日', WED, '今日台東規模5', wed.today, at(['V']), mag(5, 'lenient')),
  c('時間｜今晚', WED, '今晚會有大地震', wed.today, TAIWAN, NO_SIZE, ['region-unspecified', word('大地震')]),
  c('時間｜今夜', WED, '今夜宜蘭有感', wed.today, at(['G']), shindo(1)),
  c('時間｜明天', WED, '明天台北會搖', wed.tomorrow, at(['A']), shindo(1)),
  c('時間｜明日', WED, '明日南投規模6以上', wed.tomorrow, at(['M']), mag(6, 'strict')),
  c('時間｜明晚', WED, '明晚屏東會晃', wed.tomorrow, at(['T']), shindo(1)),
  c('時間｜後天', WED, '後天苗栗地震', wed.dayAfterTomorrow, at(['K']), NO_SIZE, [word('')]),
  c('時間｜大後天（kind = date，d0 + 3）', WED, '大後天彰化震度4',
    w('date', '2026-11-07', '2026-11-07', 1), at(['N']), shindo(4)),
  c('時間｜這週', WED, '這週雲林有感地震', wed.thisWeek, at(['P']), shindo(1)),
  c('時間｜本週', WED, '本週會有規模5.5的地震', wed.thisWeek, TAIWAN, mag(5.5, 'lenient'), ['region-unspecified']),
  c('時間｜這禮拜', WED, '這禮拜屏東會地震', wed.thisWeek, at(['T']), NO_SIZE, [word('')]),
  c('時間｜這星期', WED, '這星期基隆M5', wed.thisWeek, at(['C']), mag(5, 'lenient')),
  c('時間｜這周（周＝週）', WED, '這周高雄芮氏6', wed.thisWeek, at(['E']), mag(6, 'lenient')),
  c('時間｜下週', WED, '下週新北規模6', wed.nextWeek, at(['F']), mag(6, 'lenient')),
  c('時間｜下禮拜', WED, '下禮拜桃園會有感', wed.nextWeek, at(['H']), shindo(1)),
  c('時間｜下星期', WED, '下星期澎湖地震', wed.nextWeek, at(['X']), NO_SIZE, [word('')]),
  c('時間｜下個禮拜', WED, '下個禮拜金門有地震', wed.nextWeek, at(['W']), NO_SIZE, [word('')]),
  c('時間｜下個星期', WED, '下個星期馬祖地震', wed.nextWeek, at(['Z']), NO_SIZE, [word('')]),
  c('時間｜下周', WED, '下周連江會搖', wed.nextWeek, at(['Z']), shindo(1)),
  c('時間｜週末', WED, '週末台中會有地震', wed.weekend, at(['B']), NO_SIZE, [word('')]),
  c('時間｜這週末（整個詞是週末，不是這週）', WED, '這週末嘉義市有感', wed.weekend, at(['I']), shindo(1)),
  // 「這個週末」= 規格的「這週末」加量詞「個」；裡面沒有規格列出的「這週」類說法，只有「週末」
  c('時間｜這個週末', WED, '這個週末宜蘭會有地震', wed.weekend, at(['G']), NO_SIZE, [word('')]),
  c('時間｜這個月', WED, '某老師說這個月花蓮會有規模 6 以上的地震', wed.thisMonth, at(['U']), mag(6, 'strict')),
  c('時間｜本月', WED, '本月嘉義縣會有大地震', wed.thisMonth, at(['Q']), NO_SIZE, [word('大地震')]),
  c('時間｜這月', WED, '這月新竹市震度3', wed.thisMonth, at(['O']), shindo(3)),
  c('時間｜月底前', WED, '月底前新竹縣規模5以上', wed.thisMonth, at(['J']), mag(5, 'strict')),
  c('時間｜下個月', WED, '新竹下個月會有6級地震', wed.nextMonth, at(['O', 'J']), mag(6, 'lenient'),
    ['region-ambiguous', 'size-level-ambiguous']),
  c('時間｜下月', WED, '下月台東外海規模6.5', wed.nextMonth, at(['V'], 60), mag(6.5, 'lenient'), ['region-offshore']),
  c('時間｜12月', WED, '12月會有大地震', wed.december, TAIWAN, NO_SIZE, ['region-unspecified', word('大地震')]),
  c('時間｜十二月', WED, '十二月花蓮強震', wed.december, at(['U']), NO_SIZE, [word('強震')]),
  c('時間｜11月（就是本月：從發布日開始）', WED, '11月宜蘭會有地震',
    w('month', '2026-11-04', '2026-11-30', 27), at(['G']), NO_SIZE, [word('')]),
  c('時間｜3月（已過：取明年）', WED, '3月台南會有地震',
    w('month', '2027-03-01', '2027-03-31', 31), at(['D']), NO_SIZE, [word('')]),
  c('時間｜二月（已過：取明年，28 天）', WED, '二月地牛翻身',
    w('month', '2027-02-01', '2027-02-28', 28), TAIWAN, NO_SIZE, ['region-unspecified', word('地牛翻身')]),
  c('時間｜今年', WED, '今年會有規模7的地震', wed.thisYear, TAIWAN, mag(7, 'lenient'), ['region-unspecified']),
  c('時間｜今年內', WED, '今年內南部會有大地震', wed.thisYear, at(SOUTH, 30, 'south'), NO_SIZE, [word('大地震')]),
  c('時間｜年內', WED, '年內北部會有強震', wed.thisYear, at(NORTH, 30, 'north'), NO_SIZE, [word('強震')]),
  c('時間｜年底前', WED, '年底前中部會有巨震', wed.thisYear, at(CENTRAL, 30, 'central'), NO_SIZE, [word('巨震')]),
  c('時間｜今年底', WED, '今年底東部會有M7', wed.thisYear, at(EAST, 30, 'east'), mag(7, 'lenient')),
  c('時間｜N 天內', WED, '3天內會有規模5以上地震', wed.within3, TAIWAN, mag(5, 'strict'), ['region-unspecified']),
  c('時間｜N 日內', WED, '7日內花東有感', wed.within7, at(HUADONG, 30, 'huadong'), shindo(1)),
  c('時間｜N 天之內', WED, '10天之內宜花東會有強震', wed.within10, at(EAST), NO_SIZE, [word('強震')]),
  c('時間｜N 天以內', WED, '30天以內北北基會有地震', wed.within30, at(['A', 'F', 'C']), NO_SIZE, [word('')]),
  c('時間｜未來 N 天', WED, '未來5天北北基桃規模4.5',
    w('withinDays', '2026-11-04', '2026-11-08', 5), at(['A', 'F', 'C', 'H']), mag(4.5, 'lenient')),
  c('時間｜接下來 N 天', WED, '接下來14天桃竹苗會有感', wed.within14, at(['H', 'O', 'J', 'K']), shindo(1)),
  c('時間｜N 週內（兩週內 = 14 天）', WED, '兩週內中彰投會有大地震', wed.within14, at(['B', 'N', 'M']), NO_SIZE,
    [word('大地震')]),
  c('時間｜N 週之內', WED, '兩週之內花蓮規模5', wed.within14, at(['U']), mag(5, 'lenient')),
  c('時間｜N 個禮拜內', WED, '2個禮拜內雲嘉南規模6', wed.within14, at(['P', 'I', 'Q', 'D']), mag(6, 'lenient')),
  c('時間｜N 個星期內（21 天）', WED, '3個星期內高屏震度5弱',
    w('withinDays', '2026-11-04', '2026-11-24', 21), at(['E', 'T']), shindo(5)),
  c('時間｜N 個月內（一個月內 = 30 天）', WED, '一個月內台灣東部會有大地震', wed.within30, at(EAST, 30, 'east'), NO_SIZE,
    [word('大地震')]),
  c('時間｜N 個月以內（90 天）', WED, '三個月以內宜蘭會有強震',
    w('withinDays', '2026-11-04', '2027-02-01', 90), at(['G']), NO_SIZE, [word('強震')]),
  c('時間｜六個月內（180 天）', WED, '六個月內宜蘭規模6',
    w('withinDays', '2026-11-04', '2027-05-02', 180), at(['G']), mag(6, 'lenient')),
  c('時間｜半年內（182 天）', WED, '半年內會有規模7',
    w('withinDays', '2026-11-04', '2027-05-04', 182), TAIWAN, mag(7, 'lenient'), ['region-unspecified']),
  c('時間｜N 年內（三年內 = 1095 天）', WED, '三年內台灣會有超大地震',
    w('withinDays', '2026-11-04', '2029-11-02', 1095), TAIWAN, NO_SIZE, [word('超大地震')]),
  c('時間｜一年內（365 天）', WED, '一年內台北會有大規模地震',
    w('withinDays', '2026-11-04', '2027-11-03', 365), at(['A']), NO_SIZE, [word('大規模地震')]),
  c('時間｜N 年以內（730 天，跨 2028 閏年）', WED, '兩年以內花蓮會有大地震',
    w('withinDays', '2026-11-04', '2028-11-02', 730), at(['U']), NO_SIZE, [word('大地震')]),
  c('時間｜這幾天（7 天，模糊）', WED, '這幾天會有地震', wed.within7, TAIWAN, NO_SIZE,
    ['time-vague', 'region-unspecified', word('')]),
  c('時間｜這兩天（7 天，模糊）', WED, '這兩天花蓮會有強烈地震', wed.within7, at(['U']), NO_SIZE,
    ['time-vague', word('強烈地震')]),
  c('時間｜近日（7 天，模糊）', WED, '近日恐有大震', wed.within7, TAIWAN, NO_SIZE,
    ['time-vague', 'region-unspecified', word('大震')]),
  c('時間｜近期', WED, '近期東部外海會有強震', wed.vague, at(EAST, 60, 'east'), NO_SIZE,
    ['time-vague', 'region-offshore', word('強震')]),
  c('時間｜最近', WED, '最近會有毀滅性地震', wed.vague, TAIWAN, NO_SIZE,
    ['time-vague', 'region-unspecified', word('毀滅性')]),
  c('時間｜不久', WED, '不久將有災難性地震', wed.vague, TAIWAN, NO_SIZE,
    ['time-vague', 'region-unspecified', word('災難性')]),
  c('時間｜不久後', WED, '不久後南投會有大地震', wed.vague, at(['M']), NO_SIZE, ['time-vague', word('大地震')]),
  c('時間｜即將', WED, '即將發生規模6地震', wed.vague, TAIWAN, mag(6, 'lenient'), ['time-vague', 'region-unspecified']),
  c('時間｜很快', WED, '很快就會有地牛翻身', wed.vague, TAIWAN, NO_SIZE,
    ['time-vague', 'region-unspecified', word('地牛翻身')]),
  c('時間｜隨時', WED, '花蓮隨時會有大地震', wed.vague, at(['U']), NO_SIZE, ['time-vague', word('大地震')]),
  c('時間｜日期 11/15', WED, '11/15花蓮會地震', wed.nov15, at(['U']), NO_SIZE, [word('')]),
  c('時間｜日期 11月15日', WED, '11月15日會有規模6', wed.nov15, TAIWAN, mag(6, 'lenient'), ['region-unspecified']),
  c('時間｜日期 11月15號', WED, '11月15號台中有感', wed.nov15, at(['B']), shindo(1)),
  c('時間｜日期 2026/11/15', WED, '2026/11/15會有大地震', wed.nov15, TAIWAN, NO_SIZE,
    ['region-unspecified', word('大地震')]),
  c('時間｜11/15前', WED, '11/15前會有M6', wed.until15, TAIWAN, mag(6, 'lenient'), ['region-unspecified']),
  c('時間｜11/15之前', WED, '11/15之前台南有地震', wed.until15, at(['D']), NO_SIZE, [word('')]),
  c('時間｜11月15日以前', WED, '11月15日以前高雄會搖', wed.until15, at(['E']), shindo(1)),
  c('時間｜範圍：到', WED, '11/10到11/15台南會有震度5強', wed.range10to15, at(['D']), shindo(5.5)),
  c('時間｜範圍：至', WED, '11/10至11/15宜蘭規模5', wed.range10to15, at(['G']), mag(5, 'lenient')),
  c('時間｜範圍：~', WED, '11/10~11/15屏東地震', wed.range10to15, at(['T']), NO_SIZE, [word('')]),
  c('時間｜範圍：～（全形，日期也是全形）', WED, '１１／１０～１１／１５澎湖地震', wed.range10to15, at(['X']), NO_SIZE,
    [word('')]),
  c('時間｜範圍：-', WED, '11/10-11/15金門會搖', wed.range10to15, at(['W']), shindo(1)),
  c('時間｜都沒有（暫用 30 天）', WED, '花蓮會有地震', wed.unspecified, at(['U']), NO_SIZE,
    ['time-unspecified', word('')]),

  // ------------------------------------------------ 2.2 時間：與星期有關的列（其他發布日）
  c('時間｜這週（SAT 週六）', SAT, '這週會有地震', w('thisWeek', '2026-11-07', '2026-11-08', 2), TAIWAN, NO_SIZE,
    ['region-unspecified', word('')]),
  c('時間｜下週（SAT 週六）', SAT, '下週花蓮規模6', w('nextWeek', '2026-11-09', '2026-11-15', 7), at(['U']),
    mag(6, 'lenient')),
  c('時間｜週末（SAT 週六：今天和明天）', SAT, '週末台東有感', w('weekend', '2026-11-07', '2026-11-08', 2), at(['V']),
    shindo(1)),
  c('時間｜這週（SUN 週日：只剩今天）', SUN, '這週宜蘭會晃', w('thisWeek', '2026-11-08', '2026-11-08', 1), at(['G']),
    shindo(1)),
  c('時間｜下週（SUN 週日）', SUN, '下週台南強震', w('nextWeek', '2026-11-09', '2026-11-15', 7), at(['D']), NO_SIZE,
    [word('強震')]),
  c('時間｜週末（SUN 週日：只有今天）', SUN, '這週末高雄地震', w('weekend', '2026-11-08', '2026-11-08', 1), at(['E']),
    NO_SIZE, [word('')]),
  c('時間｜這週（MON 週一：整週）', MON, '本週台中規模5以上', w('thisWeek', '2026-11-09', '2026-11-15', 7), at(['B']),
    mag(5, 'strict')),
  c('時間｜下週（MON 週一）', MON, '下禮拜基隆有感', w('nextWeek', '2026-11-16', '2026-11-22', 7), at(['C']),
    shindo(1)),
  c('時間｜週末（MON 週一）', MON, '週末桃園會搖', w('weekend', '2026-11-14', '2026-11-15', 2), at(['H']), shindo(1)),

  // ------------------------------------------------ 2.2 時間：邊界（跨年、月底、2 月）
  c('時間｜這週跨年（DEC28 週一）', DEC28, '這週會有大地震', w('thisWeek', '2026-12-28', '2027-01-03', 7), TAIWAN,
    NO_SIZE, ['region-unspecified', word('大地震')]),
  c('時間｜下週在明年（DEC28）', DEC28, '下週花蓮規模6以上', w('nextWeek', '2027-01-04', '2027-01-10', 7), at(['U']),
    mag(6, 'strict')),
  c('時間｜週末在明年（DEC28）', DEC28, '週末台北有感', w('weekend', '2027-01-02', '2027-01-03', 2), at(['A']),
    shindo(1)),
  c('時間｜下個月在明年（DEC28）', DEC28, '下個月南部大地震', w('nextMonth', '2027-01-01', '2027-01-31', 31),
    at(SOUTH, 30, 'south'), NO_SIZE, [word('大地震')]),
  c('時間｜這個月剩 4 天（DEC28）', DEC28, '這個月東部強震', w('thisMonth', '2026-12-28', '2026-12-31', 4),
    at(EAST, 30, 'east'), NO_SIZE, [word('強震')]),
  c('時間｜1/3前（DEC28，沒寫年份：明年）', DEC28, '1/3前高雄地震', w('untilDate', '2026-12-28', '2027-01-03', 7),
    at(['E']), NO_SIZE, [word('')]),
  c('時間｜明天跨年（DEC31）', DEC31, '明天台北會搖', w('tomorrow', '2027-01-01', '2027-01-01', 1), at(['A']),
    shindo(1)),
  c('時間｜後天跨年（DEC31）', DEC31, '後天台中有感', w('dayAfterTomorrow', '2027-01-02', '2027-01-02', 1), at(['B']),
    shindo(1)),
  c('時間｜大後天跨年（DEC31）', DEC31, '大後天花蓮規模5', w('date', '2027-01-03', '2027-01-03', 1), at(['U']),
    mag(5, 'lenient')),
  c('時間｜這週跨年（DEC31 週四）', DEC31, '這週會有地震', w('thisWeek', '2026-12-31', '2027-01-03', 4), TAIWAN,
    NO_SIZE, ['region-unspecified', word('')]),
  c('時間｜下週（DEC31）', DEC31, '下星期宜蘭有感', w('nextWeek', '2027-01-04', '2027-01-10', 7), at(['G']),
    shindo(1)),
  c('時間｜週末（DEC31）', DEC31, '週末台南會晃', w('weekend', '2027-01-02', '2027-01-03', 2), at(['D']), shindo(1)),
  c('時間｜本月只剩一天（DEC31）', DEC31, '本月花蓮地震', w('thisMonth', '2026-12-31', '2026-12-31', 1), at(['U']),
    NO_SIZE, [word('')]),
  c('時間｜下個月（DEC31）', DEC31, '下個月宜蘭會晃', w('nextMonth', '2027-01-01', '2027-01-31', 31), at(['G']),
    shindo(1)),
  c('時間｜今年只剩一天（DEC31）', DEC31, '今年底前台東會有強震', w('thisYear', '2026-12-31', '2026-12-31', 1),
    at(['V']), NO_SIZE, [word('強震')]),
  c('時間｜12月就是本月（DEC31）', DEC31, '12月台中會有地震', w('month', '2026-12-31', '2026-12-31', 1), at(['B']),
    NO_SIZE, [word('')]),
  c('時間｜1月已過：取明年（DEC31）', DEC31, '1月花蓮規模6', w('month', '2027-01-01', '2027-01-31', 31), at(['U']),
    mag(6, 'lenient')),
  c('時間｜1/5前（DEC31，沒寫年份：明年）', DEC31, '1/5前南投有感', w('untilDate', '2026-12-31', '2027-01-05', 6),
    at(['M']), shindo(1)),
  c('時間｜30 天內跨年（DEC31）', DEC31, '30天內北部規模6', w('withinDays', '2026-12-31', '2027-01-29', 30),
    at(NORTH, 30, 'north'), mag(6, 'lenient')),
  c('時間｜下個月是 2 月（JAN31）', JAN31, '下個月花蓮會有大地震', w('nextMonth', '2026-02-01', '2026-02-28', 28),
    at(['U']), NO_SIZE, [word('大地震')]),
  c('時間｜這個月只剩一天（JAN31）', JAN31, '這個月台東有感', w('thisMonth', '2026-01-31', '2026-01-31', 1), at(['V']),
    shindo(1)),
  c('時間｜週末（JAN31 週六）', JAN31, '週末宜蘭地震', w('weekend', '2026-01-31', '2026-02-01', 2), at(['G']), NO_SIZE,
    [word('')]),
  c('時間｜這週（JAN31 週六）', JAN31, '這禮拜台北會搖', w('thisWeek', '2026-01-31', '2026-02-01', 2), at(['A']),
    shindo(1)),
  c('時間｜下週（JAN31）', JAN31, '下週台中規模5', w('nextWeek', '2026-02-02', '2026-02-08', 7), at(['B']),
    mag(5, 'lenient')),
  c('時間｜2月還沒到：今年（JAN31）', JAN31, '2月南部強震', w('month', '2026-02-01', '2026-02-28', 28),
    at(SOUTH, 30, 'south'), NO_SIZE, [word('強震')]),
  c('時間｜1月就是本月（JAN31）', JAN31, '1月花蓮會有地震', w('month', '2026-01-31', '2026-01-31', 1), at(['U']),
    NO_SIZE, [word('')]),
  c('時間｜今年（JAN31，335 天）', JAN31, '今年會有規模7', w('thisYear', '2026-01-31', '2026-12-31', 335), TAIWAN,
    mag(7, 'lenient'), ['region-unspecified']),

  // ------------------------------------------------ 2.2 時間：年份、已過的日期、多個說法、上限
  c('時間｜沒寫年份且已過：取明年（不加 time-past）', WED, '11/3花蓮地震', w('date', '2027-11-03', '2027-11-03', 1),
    at(['U']), NO_SIZE, [word('')]),
  c('時間｜沒寫年份的「前」已過：到明年那天', WED, '11/3前台南地震',
    w('untilDate', '2026-11-04', '2027-11-03', 365), at(['D']), NO_SIZE, [word('')]),
  c('時間｜寫了年份而已過：保留並加 time-past', WED, '2026/11/1花蓮地震', w('date', '2026-11-01', '2026-11-01', 1),
    at(['U']), NO_SIZE, ['time-past', word('')]),
  c('時間｜寫了年份（年月日）而已過', WED, '2025年3月1日台南規模6', w('date', '2025-03-01', '2025-03-01', 1), at(['D']),
    mag(6, 'lenient'), ['time-past']),
  c('時間｜寫了年份的月份已過', WED, '2025年12月花蓮地震', w('month', '2025-12-01', '2025-12-31', 31), at(['U']),
    NO_SIZE, ['time-past', word('')]),
  c('時間｜寫了年份的月份（明年）', WED, '2027年1月嘉義縣地震', w('month', '2027-01-01', '2027-01-31', 31), at(['Q']),
    NO_SIZE, [word('')]),
  // 寫的年份就是發布日當年：「2026年底前」=「年底前」、「2026年底」=「今年底」（2.2 的 thisYear）
  c('時間｜寫了今年的年份：2026年底前 = 年底前', WED, '2026年底前花蓮會有大地震', wed.thisYear, at(['U']), NO_SIZE,
    [word('大地震')]),
  c('時間｜寫了今年的年份：2026年底 = 今年底（JAN31）', JAN31, '2026年底台東會有強震',
    w('thisYear', '2026-01-31', '2026-12-31', 335), at(['V']), NO_SIZE, [word('強震')]),
  // 四位數的「2026 年內」是曆年，不是「2026 年份的天數」：就是今年 → thisYear（見 MODELS.md 附錄 D）
  c('時間｜2026年內 = 今年內', WED, '2026年內花蓮地震', wed.thisYear, at(['U']), NO_SIZE, [word('')]),
  c('時間｜2027年內 = 2027 整年', WED, '2027年內台北會有大地震', w('dateRange', '2027-01-01', '2027-12-31', 365),
    at(['A']), NO_SIZE, [word('大地震')]),
  c('時間｜2025年內（已過）', WED, '2025年內台南地震', w('dateRange', '2025-01-01', '2025-12-31', 365), at(['D']),
    NO_SIZE, ['time-past', word('')]),
  // 2026-11-04 到 2026-12-31 共 58 天，加 2027 整年 365 天 = 423 天
  c('時間｜明年底前', WED, '明年底前花蓮會有大地震', w('untilDate', '2026-11-04', '2027-12-31', 423), at(['U']),
    NO_SIZE, [word('大地震')]),
  c('時間｜明年 = 明年整年', WED, '明年會有大地震', w('dateRange', '2027-01-01', '2027-12-31', 365), TAIWAN, NO_SIZE,
    ['region-unspecified', word('大地震')]),
  c('時間｜民國116年底前 = 2027 年底前', WED, '民國116年底前台東地震', w('untilDate', '2026-11-04', '2027-12-31', 423),
    at(['V']), NO_SIZE, [word('')]),
  c('時間｜2024年底前（已過：只算那天）', WED, '2024年底前花蓮地震', w('date', '2024-12-31', '2024-12-31', 1), at(['U']),
    NO_SIZE, ['time-past', word('')]),
  // 「今年」「明年」接月份或日期 = 寫了年份的日期（「明年 11 月」不是今年 11 月）
  c('時間｜明年11月', WED, '明年11月花蓮會有規模6以上', w('month', '2027-11-01', '2027-11-30', 30), at(['U']),
    mag(6, 'strict')),
  c('時間｜今年12月15日', WED, '今年12月15日台北有感', w('date', '2026-12-15', '2026-12-15', 1), at(['A']), shindo(1)),
  c('時間｜明年 1/10 前', WED, '明年 1/10 前東部大地震', w('untilDate', '2026-11-04', '2027-01-10', 68),
    at(EAST, 30, 'east'), NO_SIZE, [word('大地震')]),
  // 提到過去的地震年份不是時間窗，否則會蓋掉後面真正的「下週」
  c('時間｜單獨的過去年份不算時間（集集是南投縣的鎮）', WED, '像1999年集集大地震那樣，下週會再來一次', wed.nextWeek,
    at(['M']), NO_SIZE, ['region-town', word('大地震')]),
  c('時間｜寫了年份的範圍', WED, '2026/11/10到2026/11/20台東地震', w('dateRange', '2026-11-10', '2026-11-20', 11),
    at(['V']), NO_SIZE, [word('')]),
  c('時間｜沒寫年份的範圍跨年', WED, '12/28到1/3花蓮大地震', w('dateRange', '2026-12-28', '2027-01-03', 7), at(['U']),
    NO_SIZE, [word('大地震')]),
  c('時間｜中文日期範圍（至）', WED, '11月10日至11月15日台中地震', wed.range10to15, at(['B']), NO_SIZE, [word('')]),
  c('時間｜多個說法取最先出現的（明天 vs 後天）', WED, '明天或後天花蓮會有地震', wed.tomorrow, at(['U']), NO_SIZE,
    ['time-multiple', word('')]),
  c('時間｜多個說法取最先出現的（下週末 = 下週先出現）', WED, '下週末花蓮會有地震', wed.nextWeek, at(['U']), NO_SIZE,
    [word('')]),
  c('時間｜十年內剛好 3650 天（不截斷）', WED, '十年內台灣會有規模8', wed.within3650, TAIWAN, mag(8, 'lenient')),
  c('時間｜二十年內：截斷到 3650 天', WED, '二十年內會有大地震', wed.within3650, TAIWAN, NO_SIZE,
    ['time-clamped', 'region-unspecified', word('大地震')]),
  c('時間｜3651 天內：截斷到 3650 天', WED, '3651天內花蓮地震', wed.within3650, at(['U']), NO_SIZE,
    ['time-clamped', word('')]),

  // ------------------------------------------------ 2.1 中文數字
  c('數字｜三天內', WED, '三天內台南規模5', wed.within3, at(['D']), mag(5, 'lenient')),
  c('數字｜十五天內', WED, '十五天內會有地震', w('withinDays', '2026-11-04', '2026-11-18', 15), TAIWAN, NO_SIZE,
    ['region-unspecified', word('')]),
  c('數字｜六點五級（v 級地震）', WED, '花蓮六點五級地震', wed.unspecified, at(['U']), mag(6.5, 'lenient'),
    ['time-unspecified', 'size-level-ambiguous']),
  c('數字｜規模七', WED, '下週會有規模七的地震', wed.nextWeek, TAIWAN, mag(7, 'lenient'), ['region-unspecified']),
  c('數字｜震度五強', WED, '下週震度五強', wed.nextWeek, TAIWAN, shindo(5.5), ['region-unspecified']),
  c('數字｜全形數字與全形空白', WED, '下週　花蓮　規模６以上', wed.nextWeek, at(['U']), mag(6, 'strict')),

  // ------------------------------------------------ 2.3 地點
  c('地點｜臺北市（臺）', WED, '下週臺北市規模5', wed.nextWeek, at(['A']), mag(5, 'lenient')),
  c('地點｜北市', WED, '明天北市有感', wed.tomorrow, at(['A']), shindo(1)),
  c('地點｜竹北 = 新竹縣', WED, '竹北下週會搖', wed.nextWeek, at(['J']), shindo(1)),
  c('地點｜臺中、臺南市、臺東縣（依出現順序）', WED, '臺中、臺南市、臺東縣這週都會有地震', wed.thisWeek, at(['B', 'D', 'V']),
    NO_SIZE, ['region-union', word('')]),
  c('地點｜嘉義：縣市都算', WED, '嘉義下週有感', wed.nextWeek, at(['I', 'Q']), shindo(1), ['region-ambiguous']),
  c('地點｜新竹市、嘉義縣：不是歧義', WED, '新竹市和嘉義縣明天地震', wed.tomorrow, at(['O', 'Q']), NO_SIZE,
    ['region-union', word('')]),
  c('地點｜新竹縣、嘉義市：不是歧義', WED, '新竹縣、嘉義市下週規模5', wed.nextWeek, at(['J', 'I']), mag(5, 'lenient'),
    ['region-union']),
  c('地點｜北台灣 = 北部', WED, '北台灣下週會有大地震', wed.nextWeek, at(NORTH, 30, 'north'), NO_SIZE, [word('大地震')]),
  c('地點｜中臺灣 = 中部', WED, '中臺灣一個月內規模6', wed.within30, at(CENTRAL, 30, 'central'), mag(6, 'lenient')),
  c('地點｜南台灣 = 南部', WED, '南台灣明天會搖', wed.tomorrow, at(SOUTH, 30, 'south'), shindo(1)),
  c('地點｜東半部 = 東部', WED, '東半部近期會有強震', wed.vague, at(EAST, 30, 'east'), NO_SIZE,
    ['time-vague', word('強震')]),
  c('地點｜後山 = 東部', WED, '後山這週有感', wed.thisWeek, at(EAST, 30, 'east'), shindo(1)),
  c('地點｜臺灣東部 = 東部（不是台灣）', WED, '臺灣東部下週規模6', wed.nextWeek, at(EAST, 30, 'east'), mag(6, 'lenient')),
  c('地點｜外海以外的字：海域', WED, '花蓮海域下週規模6', wed.nextWeek, at(['U'], 60), mag(6, 'lenient'),
    ['region-offshore']),
  c('地點｜外海以外的字：近海', WED, '宜蘭近海明天會有地震', wed.tomorrow, at(['G'], 60), NO_SIZE,
    ['region-offshore', word('')]),
  c('地點｜外海以外的字：海上', WED, '台東海上這週規模5.5', wed.thisWeek, at(['V'], 60), mag(5.5, 'lenient'),
    ['region-offshore']),
  c('地點｜外海以外的字：外洋（分區仍記下）', WED, '花東外洋近期強震', wed.vague, at(HUADONG, 60, 'huadong'), NO_SIZE,
    ['time-vague', 'region-offshore', word('強震')]),
  c('地點｜只有國外：台灣，不加 region-unspecified，加 region-foreign-only', WED, '日本下週會有大地震', wed.nextWeek,
    TAIWAN, NO_SIZE, [abroad('日本'), 'region-foreign-only', word('大地震')]),
  c('地點｜國外與台灣混在一起', WED, '30 天以內，日本、台灣、大陸、菲律賓、印尼可能發生 M7.0 地震', wed.within30, TAIWAN,
    mag(7, 'lenient'), [abroad('日本、大陸、菲律賓、印尼')]),
  c('地點｜國外與縣市混在一起', WED, '菲律賓和屏東外海下週規模7', wed.nextWeek, at(['T'], 60), mag(7, 'lenient'),
    [abroad('菲律賓'), 'region-offshore']),
  c('地點｜其中部分：中部不算地名', WED, '其中部分人說宜花東兩週內會有芮氏規模六點五左右的地震', wed.within14, at(EAST),
    mag(6.5, 'lenient')),
  c('地點｜兩個縣市：依首次出現排序', WED, '花蓮、宜蘭明天規模6', wed.tomorrow, at(['U', 'G']), mag(6, 'lenient'),
    ['region-union']),
  c('地點｜兩個縣市：先出現的在前', WED, '高雄跟台南下週有感', wed.nextWeek, at(['E', 'D']), shindo(1), ['region-union']),
  c('地點｜分區加縣市：聯集、不記 group', WED, '花東和宜蘭這週強震', wed.thisWeek, at(['U', 'V', 'G']), NO_SIZE,
    ['region-union', word('強震')]),
  c('地點｜兩個分區：聯集、不記 group', WED, '北部和東部下個月大地震', wed.nextMonth, at([...NORTH, ...EAST]), NO_SIZE,
    ['region-union', word('大地震')]),
  c('地點｜合稱加重複的縣市：去重', WED, '北北基和台北明天會搖', wed.tomorrow, at(['A', 'F', 'C']), shindo(1),
    ['region-union']),
  c('地點｜合稱：西半部', WED, '西半部下週會有規模5', wed.nextWeek, at([...NORTH, ...CENTRAL, ...SOUTH]), mag(5, 'lenient')),
  c('地點｜合稱：西部', WED, '西部這週有感', wed.thisWeek, at([...NORTH, ...CENTRAL, ...SOUTH]), shindo(1)),
  c('地點｜合稱：中南部', WED, '中南部明天規模6以上', wed.tomorrow, at([...CENTRAL, ...SOUTH]), mag(6, 'strict')),
  c('地點｜全台：台灣的說法', WED, '全台這週都會有感', wed.thisWeek, TAIWAN, shindo(1)),
  // 【解讀】外海只寫在「有縣市」那一列：台灣及近海本來就含近海，沒有外推距離可改，所以不加旗標
  c('地點｜【解讀】台灣外海：仍是台灣、不加 region-offshore', WED, '台灣外海下週規模6', wed.nextWeek, TAIWAN,
    mag(6, 'lenient')),
  // 【解讀】「依序比對」= 單一次由左到右掃描、每個位置先試最長的詞：「台東」先比對到，「東部」的「東」已用掉
  c('地點｜【解讀】台東部分地區 = 臺東縣（不是東部）', WED, '台東部分地區明天會有地震', wed.tomorrow, at(['V']), NO_SIZE,
    [word('')]),

  // ------------------------------------------------ 2.4 大小
  c('大小｜規模 v 級（有規模：不是歧義）', WED, '下週規模6級地震', wed.nextWeek, TAIWAN, mag(6, 'lenient'),
    ['region-unspecified']),
  c('大小｜ML', WED, '明天ML5.5', wed.tomorrow, TAIWAN, mag(5.5, 'lenient'), ['region-unspecified']),
  c('大小｜Mw（規模種類不是 ML，提醒）', WED, '下週Mw7.2', wed.nextWeek, TAIWAN, mag(7.2, 'lenient'),
    ['region-unspecified', { code: 'size-magnitude-type', detail: 'Mw' }]),
  c('大小｜起跳 → strict', WED, '這週規模5起跳', wed.thisWeek, TAIWAN, mag(5, 'strict'), ['region-unspecified']),
  c('大小｜+ → strict', WED, '明天M6+', wed.tomorrow, TAIWAN, mag(6, 'strict'), ['region-unspecified']),
  c('大小｜↑ → strict', WED, '下週花蓮規模6↑', wed.nextWeek, at(['U']), mag(6, 'strict')),
  c('大小｜≥ 在數值後 → strict', WED, '下週規模6≥', wed.nextWeek, TAIWAN, mag(6, 'strict'), ['region-unspecified']),
  // 【解讀】規格把「≥」列在「數值後」，但實際多寫在數值前（M≥6）：一樣是 strict
  c('大小｜【解讀】≥ 在數值前 → strict', WED, '下週M≥6', wed.nextWeek, TAIWAN, mag(6, 'strict'), ['region-unspecified']),
  c('大小｜至少（在說法前）→ strict', WED, '下週至少規模6', wed.nextWeek, TAIWAN, mag(6, 'strict'),
    ['region-unspecified']),
  c('大小｜至少（在規模與數值之間）→ strict', WED, '花蓮規模至少6', wed.unspecified, at(['U']), mag(6, 'strict'),
    ['time-unspecified']),
  c('大小｜超過 → strict', WED, '這週超過規模5', wed.thisWeek, TAIWAN, mag(5, 'strict'), ['region-unspecified']),
  c('大小｜超過（在規模與數值之間）→ strict', WED, '花蓮下週規模超過6', wed.nextWeek, at(['U']), mag(6, 'strict')),
  c('大小｜大於 → strict', WED, '明天會有大於M5的地震', wed.tomorrow, TAIWAN, mag(5, 'strict'), ['region-unspecified']),
  c('大小｜左右 → lenient', WED, '下週規模6左右', wed.nextWeek, TAIWAN, mag(6, 'lenient'), ['region-unspecified']),
  c('大小｜上下 → lenient', WED, '下週規模6上下', wed.nextWeek, TAIWAN, mag(6, 'lenient'), ['region-unspecified']),
  c('大小｜約（在說法前）→ lenient', WED, '下週約規模6', wed.nextWeek, TAIWAN, mag(6, 'lenient'), ['region-unspecified']),
  c('大小｜約（在規模與數值之間）→ lenient', WED, '花蓮規模約6.5', wed.unspecified, at(['U']), mag(6.5, 'lenient'),
    ['time-unspecified']),
  c('大小｜將近 → lenient', WED, '下週將近規模7', wed.nextWeek, TAIWAN, mag(7, 'lenient'), ['region-unspecified']),
  c('大小｜震度 1（接級）', WED, '明天震度1級', wed.tomorrow, TAIWAN, shindo(1), ['region-unspecified']),
  c('大小｜震度 2', WED, '下週震度2', wed.nextWeek, TAIWAN, shindo(2), ['region-unspecified']),
  c('大小｜v 級震度', WED, '明天會有4級震度', wed.tomorrow, TAIWAN, shindo(4), ['region-unspecified']),
  c('大小｜震度 6 弱', WED, '下週震度6弱', wed.nextWeek, TAIWAN, shindo(6), ['region-unspecified']),
  c('大小｜震度 6 強', WED, '下週震度6強', wed.nextWeek, TAIWAN, shindo(6.5), ['region-unspecified']),
  c('大小｜震度 7（接級）', WED, '下週震度7級', wed.nextWeek, TAIWAN, shindo(7), ['region-unspecified']),
  // 【解讀】2.4 寫震度 v ∈ 0–7（1.5 與 types.ts 的值域則是 1–7）：依解析規則 2.4 接受 0
  c('大小｜【解讀】震度 0', WED, '明天震度0級', wed.tomorrow, TAIWAN, shindo(0), ['region-unspecified']),
  c('大小｜感覺得到 → 震度 1', WED, '明天台北感覺得到的地震', wed.tomorrow, at(['A']), shindo(1)),
  c('大小｜明確數值優先於大地震', WED, '下週大地震，規模7', wed.nextWeek, TAIWAN, mag(7, 'lenient'),
    ['region-unspecified']),
  c('大小｜明確數值優先於有感', WED, '明天有感地震，震度3', wed.tomorrow, TAIWAN, shindo(3), ['region-unspecified']),
  c('大小｜多個數值取最先出現的（加 size-multiple）', WED, '下週震度4、規模6', wed.nextWeek, TAIWAN, shindo(4),
    ['region-unspecified', { code: 'size-multiple', detail: '震度4、規模6' }]),
  c('大小｜size-below-min：規模 3.5 以上（strict 3.5）', WED, '明天規模3.5以上', wed.tomorrow, TAIWAN,
    mag(3.5, 'strict'), ['region-unspecified', 'size-below-min']),
  c('大小｜size-below-min：規模 4（lenient → 3.5）', WED, '明天規模4', wed.tomorrow, TAIWAN, mag(4, 'lenient'),
    ['region-unspecified', 'size-below-min']),
  c('大小｜不加 size-below-min：規模 4.5（lenient → 4.0）', WED, '明天規模4.5', wed.tomorrow, TAIWAN,
    mag(4.5, 'lenient'), ['region-unspecified']),
  c('大小｜不加 size-below-min：規模 4 以上（strict 4.0）', WED, '明天規模4以上', wed.tomorrow, TAIWAN,
    mag(4, 'strict'), ['region-unspecified']),
  // 【解讀】「大地震」與「有感」同時出現（沒有數值）：說的是「大」地震，取大地震（沒說多大，看光譜）
  c('大小｜【解讀】有感的大地震 → 沒說多大', WED, '明天會有感的大地震', wed.tomorrow, TAIWAN, NO_SIZE,
    ['region-unspecified', word('大地震')]),
  // 【解讀】表格寫「v 級地震 → 寬鬆」，但判定方式說數值後有「以上」→ strict：判定方式優先，仍是歧義
  c('大小｜【解讀】6 級以上 → strict，仍加 size-level-ambiguous', WED, '下週6級以上地震', wed.nextWeek, TAIWAN,
    mag(6, 'strict'), ['region-unspecified', 'size-level-ambiguous']),

  // ------------------------------------------------ 2.5 重複預言
  c('旗標｜又說', WED, '某某又說下週會有大地震', wed.nextWeek, TAIWAN, NO_SIZE,
    ['region-unspecified', word('大地震'), 'repeat-mentioned']),
  c('旗標｜再次', WED, '網友再次預言明天花蓮規模6', wed.tomorrow, at(['U']), mag(6, 'lenient'), ['repeat-mentioned']),
  c('旗標｜每週都（周＝週）', WED, '某老師每周都說會地震', wed.unspecified, TAIWAN, NO_SIZE,
    ['time-unspecified', 'region-unspecified', word(''), 'repeat-mentioned']),
  c('旗標｜一直說', WED, '某某一直說花蓮會有強震', wed.unspecified, at(['U']), NO_SIZE,
    ['time-unspecified', word('強震'), 'repeat-mentioned']),
  c('旗標｜再度', WED, '再度預言這週台南規模5', wed.thisWeek, at(['D']), mag(5, 'lenient'), ['repeat-mentioned']),
  c('旗標｜每次都', WED, '他每次都說下週會有地震', wed.nextWeek, TAIWAN, NO_SIZE,
    ['region-unspecified', word(''), 'repeat-mentioned']),
  c('旗標｜重複', WED, '重複預言：下週花蓮規模6', wed.nextWeek, at(['U']), mag(6, 'lenient'), ['repeat-mentioned']),

  // ------------------------------------------------ 規格有歧義的時間說法
  // 【解讀】「最近幾天」：「最近」在 30 天的清單，但整個詞和「這幾天」同義：取 7 天（仍是模糊）
  c('時間｜【解讀】最近幾天 = 7 天', WED, '最近幾天會有大地震', wed.within7, TAIWAN, NO_SIZE,
    ['time-vague', 'region-unspecified', word('大地震')]),
  // 【解讀】「12 月底前」：比照「年底前」，[發布日, 12/31]，而不是 12 月整月
  c('時間｜【解讀】12月底前 = 到 12/31', WED, '12月底前花蓮會有大地震', w('untilDate', '2026-11-04', '2026-12-31', 58),
    at(['U']), NO_SIZE, [word('大地震')]),
  // 【解讀】沒寫年份的範圍：逐一套用「早於發布日改明年」會變成反向範圍；改由結束日決定年份，開始日已過加 time-past
  c('時間｜【解讀】範圍開始日已過（沒寫年份）', WED, '11/1到11/10花蓮地震', w('dateRange', '2026-11-01', '2026-11-10', 10),
    at(['U']), NO_SIZE, ['time-past', word('')]),
  // 【解讀】寫了年份的「某日前」已過：[發布日, 該日] 是空的，改成只算那一天
  c('時間｜【解讀】寫了年份的「前」已過 → 只算那天', WED, '2025/12/31前花蓮地震',
    w('date', '2025-12-31', '2025-12-31', 1), at(['U']), NO_SIZE, ['time-past', word('')]),
  // 【解讀】範圍的第二個日期在第一個之前：結束日決定年份、開始日取前一年（與「12/28到1/3」同一條規則），
  // 不自動對調；開始日已過，加 time-past（2025-11-15 + 360 天 = 2026-11-10）
  c('時間｜【解讀】倒過來的範圍：開始日取前一年', WED, '11/15到11/10花蓮地震',
    w('dateRange', '2025-11-15', '2026-11-10', 361), at(['U']), NO_SIZE, ['time-past', word('')]),
  // 【解讀】寫了別的年份的「年底前」：到那一年的 12/31（不是今年）
  c('時間｜【解讀】2027年底前：到 2027/12/31', WED, '2027年底前花蓮地震',
    w('untilDate', '2026-11-04', '2027-12-31', 423), at(['U']), NO_SIZE, [word('')]),
  // 【解讀】日期範圍超過 3650 天：保留開始日、截斷結束日（2026-11-10 + 3649 天）
  c('時間｜【解讀】範圍超過 3650 天：截斷結束日', WED, '2026/11/10到2040/1/1地震',
    w('dateRange', '2026-11-10', '2036-11-06', 3650), TAIWAN, NO_SIZE,
    ['time-clamped', 'region-unspecified', word('')]),

  // ------------------------------------------------ 實例：社群上常見的寫法（人名一律用某某、某老師、網友）
  c('實例｜緊急轉傳', WED, '【緊急】網友預言11/15前花蓮外海會有規模7以上大地震，大家快準備緊急避難包！！', wed.until15,
    at(['U'], 60), mag(7, 'strict'), ['region-offshore']),
  c('實例｜某某說下週會大地震', WED, '某某說下週會大地震', wed.nextWeek, TAIWAN, NO_SIZE,
    ['region-unspecified', word('大地震')]),
  c('實例｜轉傳週末震度', WED, '轉傳：某老師說這週末台北會有震度5弱以上的地震，請大家注意安全🙏', wed.weekend, at(['A']),
    shindo(5)),
  c('實例｜阿嬤說貓一直叫', WED, '我阿嬤說最近貓一直叫，地牛快要翻身了', wed.vague, TAIWAN, NO_SIZE,
    ['time-vague', 'region-unspecified', word('')]),
  c('實例｜網友PO文', WED, '網友PO文：未來三天內南部會有規模6左右的地震，信不信由你', wed.within3, at(SOUTH, 30, 'south'),
    mag(6, 'lenient')),
  c('實例｜第三次預言', WED, '某某又說了，12月中旬台灣東部外海會有M7.0強震，已經是第三次預言了',
    w('dateRange', '2026-12-11', '2026-12-20', 10),
    at(EAST, 60, 'east'), mag(7, 'lenient'), ['region-offshore', 'repeat-mentioned']),
  c('實例｜聽說很大的地震', WED, '聽說宜蘭明天會有很大的地震，是真的嗎？', wed.tomorrow, at(['G']), NO_SIZE, [word('')]),
  c('實例｜快訊', WED, '快訊！某專家預測30天內花東地區恐發生規模6.5以上地震', wed.within30,
    at(HUADONG, 30, 'huadong'), mag(6.5, 'strict')),
  c('實例｜不要轉傳假訊息', WED, '有人說2026年11月20日台中會有大地震，大家不要轉傳假訊息', wed.nov20, at(['B']), NO_SIZE,
    [word('大地震')]),
  c('實例｜一直說的那個某某', WED, '一直說花蓮會有大地震的那個某某，這次說兩個禮拜內會有芮氏規模七以上', wed.within14,
    at(['U']), mag(7, 'strict'), ['repeat-mentioned']),
  c('實例｜日本網友', WED, '日本網友說下個月台灣會有大地震', wed.nextMonth, TAIWAN, NO_SIZE,
    [abroad('日本'), word('大地震')]),
  c('實例｜hashtag 與範圍', WED, '#地震預言 某老師：11/10~11/15 嘉義震度6弱，寧可信其有', wed.range10to15,
    at(['I', 'Q']), shindo(6), ['region-ambiguous']),
  c('實例｜夢到地震', WED, '我夢到下禮拜台南有感地震，好可怕😱', wed.nextWeek, at(['D']), shindo(1)),
  c('實例｜5 級以上', WED, '大家小心！！近日北北基可能會有5級以上地震', wed.within7, at(['A', 'F', 'C']),
    mag(5, 'strict'), ['time-vague', 'size-level-ambiguous']),
  c('實例｜震度可能達到 7 級', WED, '某某再次預言：十二月台灣會發生地牛翻身，震度可能達到7級', wed.december, TAIWAN,
    shindo(7), ['repeat-mentioned']),
  c('實例｜每天都有人說', WED, '每天都有人說地震要來了，這次說的是今晚花蓮規模5', wed.today, at(['U']),
    mag(5, 'lenient'), ['repeat-mentioned']),
  c('實例｜明年 1 月', WED, '網傳某老師預言：明年1月台南外海將有M6.8地震', w('month', '2027-01-01', '2027-01-31', 31),
    at(['D'], 60), mag(6.8, 'lenient'), ['region-offshore']),
  c('實例｜轉貼的引號', WED, '看到有人轉貼說「10天內會有6級地震」，不知道是哪裡', wed.within10, TAIWAN, mag(6, 'lenient'),
    ['region-unspecified', 'size-level-ambiguous']),
  c('實例｜群組在傳', WED, '群組在傳：這兩天中部會有強震，記得把貴重物品收好', wed.within7, at(CENTRAL, 30, 'central'),
    NO_SIZE, ['time-vague', word('強震')]),
  c('實例｜每週都說', WED, '某某每週都說會地震，這次說11/20花蓮震度4級以上', wed.nov20, at(['U']), shindo(4),
    ['repeat-mentioned']),
  c('實例｜寧可信其有', WED, '某老師說年底前高屏會有規模6.0以上的強震，寧可信其有不可信其無', wed.thisYear,
    at(['E', 'T']), mag(6, 'strict')),
  c('實例｜書櫃固定好', WED, '網友說後天會有地牛翻身，大家記得把書櫃固定好', wed.dayAfterTomorrow, TAIWAN, NO_SIZE,
    ['region-unspecified', word('地牛翻身')]),

  // ---- 使用者試玩回報（2026-11-05）：修正後的行為
  c('回報｜下一周、歐洲：只提到國外', WED, '下一周歐洲會有M5以上地震', wed.nextWeek, TAIWAN, mag(5, 'strict'),
    [abroad('歐洲'), 'region-foreign-only']),
  c('回報｜169天後、鄉鎮、小區域有感地震', WED, '169天後，卑南或池上會發生小區域有感地震',
    w('date', '2027-04-22', '2027-04-22', 1), at(['V']), shindo(1),
    [{ code: 'region-town', detail: '卑南→臺東縣、池上→臺東縣' }, { code: 'size-official-term', detail: '小區域有感地震' }]),
  c('回報｜胡言亂語：只提到國外、規模 9.9', WED, '胡言亂語，測試test，規模9.9地震毀滅日本', wed.unspecified, TAIWAN,
    mag(9.9, 'lenient'), ['time-unspecified', abroad('日本'), 'region-foreign-only']),
  c('回報｜很多互相矛盾的大小、地點', WED,
    '近期東部外海會有強震 中震 弱震接連發生 或是舊制7級 新制6弱 舊制6級 有可能是Mj4.8 有可能是ML5.2 南部 西部也會有',
    wed.vague, at([...EAST, ...SOUTH, 'C', 'A', 'F', 'H', 'O', 'J', 'K', 'B', 'N', 'M', 'P'], 60), shindo(7),
    [{ code: 'time-vague', detail: '近期' }, 'region-offshore', 'region-union', 'size-multiple']),
  c('回報｜地震學術語亂入', WED,
    '我是地震，我的手是Mw5級,腳是震度4級,頭是PGA1800，嘴是Ms-0.2 我要胡亂輸出地震學術語，擾亂你。逼逼逼，規模要加震度 哈哈哈 12345 54321 1級包含2級 M6包含M7',
    wed.unspecified, TAIWAN, mag(5, 'lenient'),
    ['time-unspecified', 'region-unspecified', { code: 'size-magnitude-type', detail: 'Mw' }, 'size-multiple',
      { code: 'size-unsupported-term', detail: 'PGA' }]),
  c('回報｜「台中地震」不是「中地震」', WED, '下週台中地震', wed.nextWeek, at(['B']), NO_SIZE, [word('')]),
  c('回報｜官方分級：弱震 = 震度 3', WED, '下週花蓮會有弱震', wed.nextWeek, at(['U']), shindo(3),
    [{ code: 'size-official-term', detail: '弱震' }]),
  c('回報｜官方分級：中地震 = 規模 5.0 以上', WED, '下週台灣會有中地震', wed.nextWeek, TAIWAN, mag(5, 'strict'),
    [{ code: 'size-official-term', detail: '中地震' }]),
  c('回報｜下下週', WED, '下下週花蓮規模6', w('dateRange', '2026-11-16', '2026-11-22', 7), at(['U']), mag(6, 'lenient')),

  // ---- 第二輪刁鑽輸入（2026-11-05）：地點
  c('探測｜國外地名後面的方位詞屬於國外', WED, '土耳其東部下週規模7', wed.nextWeek, TAIWAN, mag(7, 'lenient'),
    [abroad('土耳其'), 'region-foreign-only']),
  c('探測｜日本南部不是台灣南部', WED, '日本南部下週會有規模7地震', wed.nextWeek, TAIWAN, mag(7, 'lenient'),
    [abroad('日本'), 'region-foreign-only']),
  c('探測｜國外城市', WED, '洛杉磯下週會有規模7大地震', wed.nextWeek, TAIWAN, mag(7, 'lenient'),
    [abroad('洛杉磯'), 'region-foreign-only']),
  c('探測｜南澳洲不是宜蘭南澳', WED, '南澳洲下週規模6', wed.nextWeek, TAIWAN, mag(6, 'lenient'),
    [abroad('南澳洲'), 'region-foreign-only']),
  c('探測｜小琉球是屏東，不是國外的琉球', WED, '小琉球明天會有規模5地震', wed.tomorrow, at(['T']), mag(5, 'lenient'),
    [{ code: 'region-town', detail: '小琉球→屏東縣' }]),
  c('探測｜新北投是臺北市', WED, '新北投下週規模5', wed.nextWeek, at(['A']), mag(5, 'lenient'),
    [{ code: 'region-town', detail: '新北投→臺北市' }]),
  c('探測｜異體字：恒春', WED, '恒春明天規模6', wed.tomorrow, at(['T']), mag(6, 'lenient'),
    [{ code: 'region-town', detail: '恆春→屏東縣' }]),
  c('探測｜中東部不是中東', WED, '中東部下週規模6', wed.nextWeek, at(['K', 'B', 'N', 'M', 'P', 'G', 'U', 'V']),
    mag(6, 'lenient')),
  c('探測｜中西部', WED, '台灣中西部下週規模6', wed.nextWeek,
    at(['C', 'A', 'F', 'H', 'O', 'J', 'K', 'B', 'N', 'M', 'P', 'I', 'Q', 'D', 'E', 'T']), mag(6, 'lenient')),
  c('探測｜東南部海域', WED, '台灣東南部海域下週規模6', wed.nextWeek, at(['V', 'T'], 60), mag(6, 'lenient'),
    ['region-offshore']),
  c('探測｜東北部', WED, '東北部明天規模5', wed.tomorrow, at(['C', 'F', 'G']), mag(5, 'lenient')),
  c('探測｜西南部', WED, '西南部下週規模6', wed.nextWeek, at(['I', 'Q', 'D', 'E', 'T']), mag(6, 'lenient')),
  c('探測｜西北部', WED, '西北部下週規模5', wed.nextWeek, at(['C', 'A', 'F', 'H', 'O', 'J']), mag(5, 'lenient')),
  c('探測｜雙北', WED, '雙北下週規模6', wed.nextWeek, at(['A', 'F']), mag(6, 'lenient')),
  c('探測｜大臺北', WED, '大臺北明天規模5', wed.tomorrow, at(['A', 'F', 'C']), mag(5, 'lenient')),
  c('探測｜竹竹苗', WED, '竹竹苗下週規模5', wed.nextWeek, at(['O', 'J', 'K']), mag(5, 'lenient')),
  c('探測｜福建金門是台灣的金門', WED, '福建金門明天規模5', wed.tomorrow, at(['W']), mag(5, 'lenient')),
  c('探測｜路名裡的地名不算', WED, '延平北路下週會有規模5地震', wed.nextWeek, TAIWAN, mag(5, 'lenient'),
    ['region-unspecified']),
  c('探測｜玉山東側不是山東', WED, '玉山東側近期規模6', wed.vague, TAIWAN, mag(6, 'lenient'),
    [{ code: 'time-vague', detail: '近期' }, 'region-unspecified']),
  c('探測｜地震集中區域不是臺中市中區', WED, '地震集中區域在花蓮，下週規模6', wed.nextWeek, at(['U']), mag(6, 'lenient')),
  c('探測｜密集集中不是集集；「最近」在描述過去', WED, '最近地震很密集集中在花蓮，下週規模6', wed.nextWeek, at(['U']),
    mag(6, 'lenient')),
  c('探測｜世界和平不是國外', WED, '為了世界和平，我預言明天花蓮規模6', wed.tomorrow, at(['U']), mag(6, 'lenient')),

  // ---- 第二輪刁鑽輸入：時間
  c('探測｜72 小時內 = 3 天', WED, '72小時內花蓮會有規模6以上', wed.within3, at(['U']), mag(6, 'strict')),
  c('探測｜未來 48 小時 = 2 天', WED, '未來48小時台北有感地震', w('withinDays', '2026-11-04', '2026-11-05', 2), at(['A']),
    shindo(1)),
  c('探測｜48 小時後', WED, '48小時後花蓮規模6', w('date', '2026-11-06', '2026-11-06', 1), at(['U']), mag(6, 'lenient')),
  c('探測｜半個月內 = 15 天', WED, '半個月內花蓮會有規模6', w('withinDays', '2026-11-04', '2026-11-18', 15), at(['U']),
    mag(6, 'lenient')),
  c('探測｜半年後', WED, '半年後台北規模7', w('date', '2027-05-05', '2027-05-05', 1), at(['A']), mag(7, 'lenient')),
  c('探測｜星期五 = 最近的星期五', WED, '星期五花蓮會有規模6', w('date', '2026-11-06', '2026-11-06', 1), at(['U']),
    mag(6, 'lenient')),
  c('探測｜下禮拜三', WED, '下禮拜三台中規模5', w('date', '2026-11-11', '2026-11-11', 1), at(['B']), mag(5, 'lenient')),
  c('探測｜下禮拜一到禮拜五', WED, '下禮拜一到禮拜五台東會有有感地震', w('dateRange', '2026-11-09', '2026-11-13', 5),
    at(['V']), shindo(1)),
  c('探測｜「下週一定」不是下週一', WED, '上週三花蓮地震很大，下週一定還會有規模6', wed.nextWeek, at(['U']), mag(6, 'lenient')),
  c('探測｜下下個月', WED, '下下個月花蓮規模6', w('month', '2027-01-01', '2027-01-31', 31), at(['U']), mag(6, 'lenient')),
  c('探測｜今明兩天', WED, '今明兩天花蓮會有規模6', w('withinDays', '2026-11-04', '2026-11-05', 2), at(['U']),
    mag(6, 'lenient')),
  c('探測｜過兩天是口語的這幾天', WED, '過兩天花蓮會有規模6', wed.within7, at(['U']), mag(6, 'lenient'),
    [{ code: 'time-vague', detail: '過兩天' }]),
  c('探測｜過三天 = 三天後', WED, '過三天台北會地震', w('date', '2026-11-07', '2026-11-07', 1), at(['A']), NO_SIZE,
    [word('')]),
  c('探測｜再過 5 天', WED, '再過5天花蓮規模6', w('date', '2026-11-09', '2026-11-09', 1), at(['U']), mag(6, 'lenient')),
  c('探測｜「超過 3 天」不是時間', WED, '超過3天沒地震，明天花蓮規模6', wed.tomorrow, at(['U']), mag(6, 'lenient')),
  c('探測｜幾週內', WED, '幾週內花蓮會有規模6', wed.within30, at(['U']), mag(6, 'lenient'),
    [{ code: 'time-vague', detail: '幾週內' }]),
  c('探測｜數日內', WED, '數日內花蓮規模6', wed.within7, at(['U']), mag(6, 'lenient'),
    [{ code: 'time-vague', detail: '數日內' }]),
  c('探測｜「最近的斷層」不是時間', WED, '離台北最近的斷層明天會錯動，規模6', wed.tomorrow, at(['A']), mag(6, 'lenient')),
  c('探測｜「過後天氣」不是後天', WED, '地震過後天氣會變冷，下週花蓮規模6', wed.nextWeek, at(['U']), mag(6, 'lenient')),
  c('探測｜兩個日期、兩個規模', WED, '11/15或12/20花蓮會有規模6或規模7', wed.nov15, at(['U']), mag(6, 'lenient'),
    [{ code: 'time-multiple', detail: '11/15、12/20' }, { code: 'size-multiple', detail: '規模6、規模7' }]),

  // ---- 第二輪刁鑽輸入：大小（分級名稱、有感的誤判）
  c('探測｜微小地震只算一種大小', WED, '下週花蓮會有微小地震', wed.nextWeek, at(['U']), mag(1, 'strict'),
    [{ code: 'size-official-term', detail: '微小地震' }, 'size-below-min']),
  c('探測｜劇烈震動不是烈震', WED, '明天花蓮會劇烈震動', wed.tomorrow, at(['U']), NO_SIZE, [word('')]),
  c('探測｜強烈震動不是烈震', WED, '下週台北會強烈震動', wed.nextWeek, at(['A']), NO_SIZE, [word('')]),
  c('探測｜心中震撼不是中震', WED, '這個預言讓我心中震撼，明天花蓮會有地震', wed.tomorrow, at(['U']), NO_SIZE, [word('')]),
  c('探測｜輕震動不是輕震', WED, '手機輕震動提醒，明天花蓮會有地震', wed.tomorrow, at(['U']), NO_SIZE, [word('')]),
  c('探測｜大小地震不是小地震', WED, '大小地震不斷，下週花蓮', wed.nextWeek, at(['U']), NO_SIZE, [word('')]),
  c('探測｜其中地震不是中地震', WED, '其中地震最大的會在下週的花蓮', wed.nextWeek, at(['U']), NO_SIZE, [word('')]),
  c('探測｜強震撼不是強震', WED, '強震撼！下週花蓮會有地震', wed.nextWeek, at(['U']), NO_SIZE, [word('')]),
  c('探測｜「我有感覺」不是有感', WED, '我有感覺明天會地震', wed.tomorrow, TAIWAN, NO_SIZE, ['region-unspecified', word('')]),
  c('探測｜「有感而發」不是有感', WED, '有感而發，明天去台北玩', wed.tomorrow, at(['A']), NO_SIZE, [word('')]),
  c('探測｜產品型號不是規模', WED, 'Apple M4 晶片下個月發表', wed.nextMonth, TAIWAN, NO_SIZE,
    ['region-unspecified', word('')]),

  // ---- 第三輪：反向驗證代理找到的讀法（2026-11-06）
  // 時間：取地震說法前面最近的那一組；敘事裡的「今天」「今年」、過去事件的日期不算
  c('驗證｜群組轉傳的「今天」不是預言時間', WED, '今天在LINE群組看到：下週花蓮會有規模6以上', wed.nextWeek, at(['U']),
    mag(6, 'strict'), [{ code: 'time-multiple', detail: '今天、下週' }]),
  c('驗證｜「今年第3次」不是預言時間', WED, '某老師今年第3次預言：下週花蓮規模6', wed.nextWeek, at(['U']), mag(6, 'lenient'),
    [{ code: 'time-multiple', detail: '今年、下週' }]),
  c('驗證｜過去地震的日期不是預言時間', WED, '4/3花蓮大地震之後，下個月花蓮還會有規模6以上', wed.nextMonth, at(['U']),
    mag(6, 'strict'), [{ code: 'time-multiple', detail: '4/3、下個月' }]),
  c('驗證｜寫了年份的過去日期不採用', WED, '2024年4月3日花蓮大地震後，專家說下個月花蓮還會有規模6以上', wed.nextMonth,
    at(['U']), mag(6, 'strict')),
  c('驗證｜明天或下個月：同一組選項取第一個', WED, '明天或下個月，花蓮會有規模 6 或規模 7 的地震', wed.tomorrow,
    at(['U']), mag(6, 'lenient'),
    [{ code: 'time-multiple', detail: '明天、下個月' }, { code: 'size-multiple', detail: '規模 6、規模 7' }]),
  c('驗證｜「今天天氣很好」不是預言時間', WED, '今天天氣很好，下週五花蓮會有規模6', w('date', '2026-11-13', '2026-11-13', 1),
    at(['U']), mag(6, 'lenient'), [{ code: 'time-multiple', detail: '今天、下週五' }]),
  // 時間：範圍
  c('驗證｜今天起一週內', WED, '今天起一週內花蓮會有規模6以上', w('dateRange', '2026-11-04', '2026-11-10', 7), at(['U']),
    mag(6, 'strict')),
  c('驗證｜明天起一個月內', WED, '明天起一個月內花蓮會有規模6', w('dateRange', '2026-11-05', '2026-12-04', 30), at(['U']),
    mag(6, 'lenient')),
  c('驗證｜從今天到月底', WED, '從今天到月底花蓮會有規模6以上', w('dateRange', '2026-11-04', '2026-11-30', 27), at(['U']),
    mag(6, 'strict')),
  c('驗證｜明天到下週三', WED, '明天到下週三花蓮規模6', w('dateRange', '2026-11-05', '2026-11-11', 7), at(['U']),
    mag(6, 'lenient')),
  c('驗證｜這禮拜五到下禮拜一', WED, '這禮拜五到下禮拜一花蓮規模6', w('dateRange', '2026-11-06', '2026-11-09', 4), at(['U']),
    mag(6, 'lenient')),
  // 時間：星期幾
  c('驗證｜下週五級地震：五級是大小', WED, '下週五級地震', wed.nextWeek, TAIWAN, mag(5, 'lenient'),
    ['region-unspecified', 'size-level-ambiguous']),
  c('驗證｜下週一波：一波不是星期一', WED, '下週一波大地震要來了', wed.nextWeek, TAIWAN, NO_SIZE,
    ['region-unspecified', word('大地震')]),
  c('驗證｜下週三前', WED, '下週三前花蓮規模6以上', w('untilDate', '2026-11-04', '2026-11-11', 8), at(['U']), mag(6, 'strict')),
  c('驗證｜週末前 = 到週五', WED, '週末前台北規模5', w('untilDate', '2026-11-04', '2026-11-06', 3), at(['A']), mag(5, 'lenient')),
  c('驗證｜下個禮拜六日', WED, '下個禮拜六日台北會有規模5', w('dateRange', '2026-11-14', '2026-11-15', 2), at(['A']),
    mag(5, 'lenient')),
  c('驗證｜下週一、三、五', WED, '下週一、三、五都會有規模5', w('dateRange', '2026-11-09', '2026-11-13', 5), TAIWAN,
    mag(5, 'lenient'), ['region-unspecified']),
  // 時間：其他說法
  c('驗證｜機率 1/10 不是日期', WED, '專家說機率1/10，下週花蓮規模6', wed.nextWeek, at(['U']), mag(6, 'lenient')),
  c('驗證｜這三天', WED, '這三天花蓮規模6', wed.within3, at(['U']), mag(6, 'lenient')),
  c('驗證｜這兩週', WED, '這兩週花蓮規模6', wed.within14, at(['U']), mag(6, 'lenient')),
  c('驗證｜幾年內', WED, '幾年內台灣會有規模7', w('withinDays', '2026-11-04', '2029-11-02', 1095), TAIWAN,
    mag(7, 'lenient'), [{ code: 'time-vague', detail: '幾年內' }]),
  c('驗證｜元旦', WED, '元旦花蓮規模6', w('date', '2027-01-01', '2027-01-01', 1), at(['U']), mag(6, 'lenient')),
  c('驗證｜下旬', WED, '下旬宜蘭會有強震', w('dateRange', '2026-11-21', '2026-11-30', 10), at(['G']), NO_SIZE,
    [word('強震')]),
  c('驗證｜12 月上旬', WED, '12月上旬花蓮規模6', w('dateRange', '2026-12-01', '2026-12-10', 10), at(['U']),
    mag(6, 'lenient')),
  c('驗證｜去年 11 月是過去', WED, '去年11月花蓮規模6的地震好可怕', w('month', '2025-11-01', '2025-11-30', 30), at(['U']),
    mag(6, 'lenient'), ['time-past']),
  c('驗證｜去年的今天不是今天', WED, '去年的今天花蓮發生規模6地震', wed.unspecified, at(['U']), mag(6, 'lenient'),
    ['time-unspecified']),
  c('驗證｜過年前：認得、但還不會換算', WED, '過年前花蓮會有規模6以上', wed.unspecified, at(['U']), mag(6, 'strict'),
    ['time-unspecified', { code: 'time-unrecognized', detail: '過年' }]),
  c('驗證｜農曆日期不當成國曆', WED, '農曆七月鬼門開，花蓮規模6', wed.unspecified, at(['U']), mag(6, 'lenient'),
    ['time-unspecified', { code: 'time-unrecognized', detail: '農曆' }]),
  // 地點：常用詞不是地名
  c('驗證｜家裡魚池不是魚池鄉', WED, '家裡魚池的魚一直跳，下週會有規模6以上', wed.nextWeek, TAIWAN, mag(6, 'strict'),
    ['region-unspecified']),
  c('驗證｜準備淡水不是淡水區', WED, '地震包要準備淡水和乾糧，下週規模7', wed.nextWeek, TAIWAN, mag(7, 'lenient'),
    ['region-unspecified']),
  c('驗證｜我家後山不是花東', WED, '我家後山最近一直有怪聲，下週會有規模6', wed.nextWeek, TAIWAN, mag(6, 'lenient'),
    ['region-unspecified']),
  // 大小
  c('驗證｜50 年來最大不是規模 5', WED, '下週花蓮規模將是50年來最大的地震', wed.nextWeek, at(['U']), NO_SIZE, [word('')]),
  c('驗證｜≧ 是至少', WED, '下週花蓮規模≧6.5地震', wed.nextWeek, at(['U']), mag(6.5, 'strict')),
  c('驗證｜單獨的 5 強是震度', WED, '下週台北會有5強的搖晃', wed.nextWeek, at(['A']), shindo(5.5)),
  c('驗證｜不會有：說的是不會發生', WED, '下週花蓮不會有規模6以上的地震', wed.nextWeek, at(['U']), mag(6, 'strict'),
    [{ code: 'size-negated', detail: '不會' }]),
  c('驗證｜會不會是問句，不是否定', WED, '下週會不會有地震', wed.nextWeek, TAIWAN, NO_SIZE,
    ['region-unspecified', word('')]),
  c('驗證｜有感加薪不是有感地震', WED, '明年政府會推有感加薪3%', w('dateRange', '2027-01-01', '2027-12-31', 365), TAIWAN,
    NO_SIZE, ['region-unspecified', word('')]),
  c('驗證｜M2 MacBook 不是規模', WED, '我的M2 MacBook明天到貨', wed.tomorrow, TAIWAN, NO_SIZE,
    ['region-unspecified', word('')]),
];
