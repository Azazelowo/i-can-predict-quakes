/**
 * 數字與預言的顯示格式（純函式，可在 Node 測試）。
 * 文字模板都在 src/copy/zh-TW.ts；這裡只負責把數字變成字串、把結構變成句子。
 */
import { LEVELS } from '../core/constants';
import { countyById, groupById } from '../core/regions';
import { isoToDay, weekdayMon0 } from '../core/time';
import type { Analogy, Claim, LevelId, RegionSpec, SizeSpec, TimeWindow } from '../core/types';
import { ANALOGY_TEXT, LEVEL_TEXT, M12, OVERVIEW, REGION, SIZE, TIME, UNITS, WEEKDAYS } from '../copy/zh-TW';

const intFormat = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const fixedFormats = new Map<number, Intl.NumberFormat>();

// ================================================================ 數字

/**
 * 機率 → 百分比：一位小數（41.2%）；p = 1 → 100%；0 < p < 0.001 → < 0.1%；
 * 0.9995 ≤ p < 1 → > 99.9%；p = 0 → 0%。
 */
export function formatPercent(p: number): string {
  if (!Number.isFinite(p)) return '—';
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  if (p < 0.001) return '< 0.1%';
  if (p >= 0.9995) return '> 99.9%';
  return `${(p * 100).toFixed(1)}%`;
}

/** 區間：a～b */
export function formatPercentRange(low: number, high: number): string {
  return TIME.range(formatPercent(low), formatPercent(high));
}

/** 滑桿等使用者設定的機率：1% 以上一位小數，以下最多兩位（0.1%、0.25%）。 */
export function formatPercentSetting(p: number): string {
  const v = p * 100;
  if (v >= 1) return `${v.toFixed(1)}%`;
  return `${v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

/** 兩個機率的差，用「個百分點」表示，帶正負號（+11.8 個百分點）。 */
export function formatPoints(diff: number): string {
  if (!Number.isFinite(diff)) return '—';
  const abs = Math.abs(diff * 100).toFixed(1);
  const sign = abs === '0.0' ? '' : diff > 0 ? '+' : '−';
  return UNITS.points(`${sign}${abs}`);
}

/** 整數，加千分位（1,223）。 */
export function formatInt(n: number): string {
  return intFormat.format(Math.round(n));
}

/** 固定小數位數，加千分位。 */
export function formatFixed(x: number, digits: number): string {
  let f = fixedFormats.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    fixedFormats.set(digits, f);
  }
  return f.format(x);
}

/** 有效位數（不用科學記號）：0.0101、19、1,880。 */
export function formatSig(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '—';
  if (x === 0) return '0';
  const rounded = Number(x.toPrecision(digits));
  const magnitude = Math.floor(Math.log10(Math.abs(rounded)));
  const decimals = Math.max(0, digits - 1 - magnitude);
  return formatFixed(rounded, Math.min(decimals, 12));
}

/** 灌水倍數：小於 10 用一位小數，否則取整數。 */
export function formatRatio(r: number): string {
  if (!Number.isFinite(r)) return '∞';
  return r < 10 ? formatFixed(r, 1) : formatInt(r);
}

/** 資訊量（bits）：小於 10 兩位小數，否則一位。 */
export function formatBits(bits: number): string {
  if (!Number.isFinite(bits)) return '∞';
  return bits < 10 ? bits.toFixed(2) : bits.toFixed(1);
}

/** 平均次數：小於 1 兩位小數，否則一位。 */
export function formatCount(x: number): string {
  return x < 1 ? formatFixed(x, 2) : formatFixed(x, 1);
}

// ================================================================ 大小

/** 規模數值，固定一位小數（6.0、6.5）。 */
export function formatMagnitude(v: number): string {
  return v.toFixed(1);
}

/** 預言「說的」規模：整數不帶小數（說 6）、否則一位小數（說 6.5）。 */
export function formatMagnitudeSaid(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** 寬鬆判定的門檻：值 − 0.5（docs/MODELS.md 1.5） */
export function lenientThreshold(v: number): number {
  return Math.round((v - 0.5) * 10) / 10;
}

export function intensityName(v: number): string {
  return SIZE.intensityName(v);
}

export function formatSize(size: SizeSpec): string {
  switch (size.kind) {
    case 'magnitude':
      return size.tolerance === 'strict'
        ? SIZE.magnitudeStrict(formatMagnitude(size.value))
        : SIZE.magnitudeLenient(formatMagnitude(size.value), formatMagnitude(lenientThreshold(size.value)));
    case 'intensity':
      return SIZE.intensity(intensityName(size.value));
    case 'unspecified':
      return SIZE.unspecified;
  }
}

// ================================================================ 地點

export function countyNames(ids: readonly string[]): string {
  return ids.map((id) => countyById(id)?.name ?? id).join(REGION.joiner);
}

/**
 * taiwan → 台灣及近海；counties → 有 group 時用分區名稱，否則縣市名稱用「、」連接，
 * 後面接（含縣界外 N 公里）或（只算縣內）。
 */
export function formatRegion(region: RegionSpec): string {
  if (region.kind === 'taiwan') return REGION.taiwanName;
  const group = region.group ? groupById(region.group) : undefined;
  const names = group ? group.name : countyNames(region.ids);
  return region.bufferKm === 0 ? REGION.insideOnly(names) : REGION.withBuffer(names, formatInt(region.bufferKm));
}

// ================================================================ 時間

interface DateParts {
  y: number;
  m: number;
  d: number;
  weekday: string;
}

function dateParts(iso: string): DateParts | null {
  try {
    const day = isoToDay(iso);
    return {
      y: Number(iso.slice(0, 4)),
      m: Number(iso.slice(5, 7)),
      d: Number(iso.slice(8, 10)),
      weekday: WEEKDAYS[weekdayMon0(day)] ?? '',
    };
  } catch {
    return null;
  }
}

function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** 11/9（一）；和 refYear 不同年時加上年份：2027/1/5（二） */
export function formatDate(iso: string, refYear?: number): string {
  const p = dateParts(iso);
  if (!p) return iso;
  return refYear === undefined || p.y === refYear
    ? TIME.date(String(p.m), String(p.d), p.weekday)
    : TIME.dateWithYear(String(p.y), String(p.m), String(p.d), p.weekday);
}

/** 11/9；和 refYear 不同年時加上年份 */
export function formatDateCompact(iso: string, refYear?: number): string {
  const p = dateParts(iso);
  if (!p) return iso;
  return refYear === undefined || p.y === refYear
    ? TIME.dateCompact(String(p.m), String(p.d))
    : TIME.dateCompactWithYear(String(p.y), String(p.m), String(p.d));
}

/** 時間窗的名稱：下週、7 天內、12 月、11/15 前… */
export function timeLabel(time: TimeWindow, issuedAt: string): string {
  switch (time.kind) {
    case 'withinDays':
      return TIME.withinDays(formatInt(time.days));
    case 'month':
      return TIME.month(String(Number(time.start.slice(5, 7))));
    case 'untilDate':
      return TIME.until(formatDateCompact(time.end, yearOf(issuedAt)));
    default:
      return TIME.names[time.kind];
  }
}

function windowDates(time: TimeWindow, issuedAt: string, compact: boolean): string {
  const ref = yearOf(issuedAt);
  const f = compact ? formatDateCompact : formatDate;
  return time.start === time.end ? f(time.start, ref) : TIME.range(f(time.start, ref), f(time.end, ref));
}

/** 確認卡用：下週：11/9（一）～11/15（日），共 7 天 */
export function formatWindowSummary(time: TimeWindow, issuedAt: string): string {
  return TIME.summary(timeLabel(time, issuedAt), windowDates(time, issuedAt, false), formatInt(time.days));
}

/** 精簡版（分享、描述用）：下週（11/9～11/15） */
export function formatTimeShort(time: TimeWindow, issuedAt: string): string {
  return TIME.short(timeLabel(time, issuedAt), windowDates(time, issuedAt, true));
}

/** 預言的完整描述（不含原文）：下週（11/9～11/15）、台灣及近海、規模 5.0 以上 */
export function describeClaim(claim: Claim): string {
  return [formatTimeShort(claim.time, claim.issuedAt), formatRegion(claim.region), formatSize(claim.size)].join(
    REGION.joiner,
  );
}

// ================================================================ 等級與生活換算

export function levelName(id: LevelId): string {
  return LEVEL_TEXT[id].name;
}

export function levelMeaning(id: LevelId): string {
  return LEVEL_TEXT[id].meaning;
}

/** 等級的範圍文字，由 LEVELS 的下限產生（不手寫數字）。 */
export function levelRanges(): { id: LevelId; min: number; range: string }[] {
  return LEVELS.map((lv, i) => {
    const prev = i > 0 ? LEVELS[i - 1] : undefined;
    let range: string;
    if (!prev) range = M12.ladderAtLeast(formatPercentShort(lv.min));
    else if (lv.min <= 0) range = M12.ladderBelow(formatPercentShort(prev.min));
    else range = M12.ladderBetween(formatPercentShort(lv.min), formatPercentShort(prev.min));
    return { id: lv.id, min: lv.min, range };
  });
}

/** 門檻用的簡短百分比：整數不帶小數（90%、5%）。 */
export function formatPercentShort(p: number): string {
  const v = Math.round(p * 1000) / 10;
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}%`;
}

/** ≈ 擲骰子出現 1 或 2 點（1/3） */
export function analogyLine(a: Analogy): string {
  return OVERVIEW.analogy(analogyText(a.id), formatInt(a.num), formatInt(a.den));
}

export function analogyText(id: string): string {
  return ANALOGY_TEXT[id] ?? id;
}
