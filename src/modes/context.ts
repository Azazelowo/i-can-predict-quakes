/**
 * 計算情境（ModeContext）：一份資料 + 這次計算期間的快取。
 *
 * 為什麼需要：computeAll 一次要算 1（原預言）+ 11（光譜）+ 49（矩陣）+ 最多 25（灌水成分）
 * 組「地區 × 大小 × 窗口」。很多組合重複（光譜的 ML ≥ 5.0 和矩陣的同一列、原預言和灌水成分的 from），
 * 所以把「地區遮罩」「符合條件的地震」「窗口命中」依鍵值快取在一個情境裡；
 * 情境只活在一次呼叫裡，不跨呼叫保留，避免記憶體無限成長或拿到過期結果。
 */
import { MIN_ML, TAIWAN_BOX } from '../core/constants';
import { localDay } from '../core/time';
import type {
  Claim,
  DataBundle,
  PeriodInfo,
  Qualifying,
  RegionSpec,
  SizeSpec,
  Tolerance,
} from '../core/types';
import { computeWindowHits, countOnes } from './window';

/** 有指定大小的 SizeSpec（規模或震度）。 */
export type SpecifiedSize = Exclude<SizeSpec, { kind: 'unspecified' }>;
/** 大小有指定的預言：M1、M2、M4c、M8 只對這種預言有意義。 */
export type SpecifiedClaim = Claim & { size: SpecifiedSize };

export function isSpecified(claim: Claim): claim is SpecifiedClaim {
  return claim.size.kind !== 'unspecified';
}

/** 資料期間 [startDay, endDay) 與年數 Y = (endDay − startDay) / 365.25（MODELS 1.1）。 */
export function periodOf(data: DataBundle): PeriodInfo {
  const startDay = localDay(data.meta.period.startUnix);
  const endDay = localDay(data.meta.period.endUnix);
  return { startDay, endDay, years: (endDay - startDay) / 365.25 };
}

/**
 * 窗口長度 T = max(1, min(days, endDay − startDay))（MODELS 第 3 節）。
 * 【規格未提】days 不是整數時先取整數部分（Math.trunc）；Claim 的 days = end − start + 1 一定是整數。
 */
export function windowLengthFor(days: number, period: PeriodInfo): number {
  if (!Number.isFinite(days)) throw new RangeError(`窗口天數必須是有限的數字：${days}`);
  const L = period.endDay - period.startDay;
  return Math.max(1, Math.min(Math.trunc(days), L));
}

/** 規模型的門檻：raw = 值（strict）或 值 − 0.5（lenient）；有效門檻 m* = max(4.0, raw)（MODELS 1.5）。 */
export function magnitudeThreshold(size: { value: number; tolerance: Tolerance }): {
  raw: number;
  effective: number;
} {
  const raw = size.tolerance === 'strict' ? size.value : size.value - 0.5;
  return { raw, effective: Math.max(MIN_ML, raw) };
}

/**
 * catalog 每筆地震是否在範圍內（MODELS 1.4）。
 * - taiwan：21 ≤ lat ≤ 26 且 119 ≤ lon ≤ 123（含邊界）
 * - counties：near 索引裡有（地震 i、選定縣市之一、km ≤ bufferKm）的組合
 * 【規格未提】未知的縣市代碼會丟出錯誤（不默默當成「從沒發生過」，以免顯示錯誤的 0%）。
 */
export function buildRegionMask(region: RegionSpec, data: DataBundle): Uint8Array {
  const { catalog } = data;
  const mask = new Uint8Array(catalog.t.length);
  if (region.kind === 'taiwan') {
    const { latMin, latMax, lonMin, lonMax } = TAIWAN_BOX;
    for (let i = 0; i < mask.length; i++) {
      const lat = catalog.lat[i]!;
      const lon = catalog.lon[i]!;
      if (lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax) mask[i] = 1;
    }
    return mask;
  }
  const items = data.meta.counties.items;
  const wanted = new Uint8Array(items.length);
  for (const id of region.ids) {
    const index = items.findIndex((c) => c.id === id);
    if (index < 0) throw new RangeError(`未知的縣市代碼：${id}`);
    wanted[index] = 1;
  }
  const { event, county, km } = catalog.near;
  const buffer = region.bufferKm;
  for (let j = 0; j < event.length; j++) {
    if (wanted[county[j]!] === 1 && km[j]! <= buffer) mask[event[j]!] = 1;
  }
  return mask;
}

/** 排序並去重（資料本來就依時間排序，通常只需要去重）。 */
function sortedUnique(values: number[]): number[] {
  let sorted = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! < values[i - 1]!) {
      sorted = false;
      break;
    }
  }
  if (!sorted) values.sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of values) if (out.length === 0 || out[out.length - 1] !== v) out.push(v);
  return out;
}

function regionKey(region: RegionSpec): string {
  // group 不影響範圍，不放進鍵值
  return region.kind === 'taiwan' ? 'taiwan' : `counties:${region.ids.join(',')}@${region.bufferKm}`;
}

/** 同一組「符合條件的地震」的鍵值：規模型只取決於地區與有效門檻，震度型與地區無關。 */
function qualifyingKey(region: RegionSpec, size: SpecifiedSize): string {
  return size.kind === 'magnitude'
    ? `m${magnitudeThreshold(size).effective}|${regionKey(region)}`
    : `i${size.value}`;
}

function requireSpecified(size: SizeSpec): SpecifiedSize {
  if (size.kind === 'unspecified') {
    throw new RangeError('大小未指定時沒有單一的「符合條件的地震」，請改看解讀光譜');
  }
  return size;
}

/** 一組「地區 × 大小 × 窗口」的窗口命中結果。 */
export interface WindowStats {
  qualifying: Qualifying;
  /** h(d)，索引 = d − startDay */
  hits: Uint8Array;
  hitCount: number;
  windows: number;
  /** M1 的 p̂ = Σ h / N */
  p: number;
}

export class ModeContext {
  readonly data: DataBundle;
  readonly period: PeriodInfo;
  /** L = endDay − startDay */
  readonly length: number;

  private readonly masks = new Map<string, Uint8Array>();
  private readonly quals = new Map<string, Qualifying>();
  private readonly stats = new Map<string, WindowStats>();
  private catalogDayCache: Int32Array | null = null;
  private feltDayCache: Int32Array | null = null;

  constructor(data: DataBundle) {
    this.data = data;
    this.period = periodOf(data);
    this.length = this.period.endDay - this.period.startDay;
    if (!(this.length >= 1)) throw new RangeError('資料期間至少要有 1 天');
  }

  windowLength(days: number): number {
    return windowLengthFor(days, this.period);
  }

  mask(region: RegionSpec): Uint8Array {
    const key = regionKey(region);
    let mask = this.masks.get(key);
    if (!mask) {
      mask = buildRegionMask(region, this.data);
      this.masks.set(key, mask);
    }
    return mask;
  }

  /** 符合條件的地震（MODELS 1.6）。回傳的物件是快取，呼叫端不可修改。 */
  qualifying(region: RegionSpec, size: SizeSpec): Qualifying {
    const specified = requireSpecified(size);
    const key = qualifyingKey(region, specified);
    let q = this.quals.get(key);
    if (!q) {
      q = this.computeQualifying(region, specified);
      this.quals.set(key, q);
    }
    return q;
  }

  /** 窗口長度 T（已夾在 1..L）下的窗口命中。回傳的物件是快取，呼叫端不可修改。 */
  windowStats(region: RegionSpec, size: SizeSpec, T: number): WindowStats {
    const key = `${qualifyingKey(region, requireSpecified(size))}#${T}`;
    let st = this.stats.get(key);
    if (!st) {
      const qualifying = this.qualifying(region, size);
      const hits = computeWindowHits(qualifying.days, this.period.startDay, this.length, T);
      const hitCount = countOnes(hits);
      st = { qualifying, hits, hitCount, windows: hits.length, p: hitCount / hits.length };
      this.stats.set(key, st);
    }
    return st;
  }

  private computeQualifying(region: RegionSpec, size: SpecifiedSize): Qualifying {
    if (size.kind === 'magnitude') {
      const threshold = magnitudeThreshold(size).effective;
      const mask = this.mask(region);
      const ml = this.data.catalog.ml;
      const eventDays = this.catalogDays();
      const days: number[] = [];
      for (let i = 0; i < ml.length; i++) {
        // 規格：ML ≥ m* 直接比較（資料一位小數、門檻是 0.5 的倍數或使用者輸入的一位小數）
        if (mask[i] === 1 && ml[i]! >= threshold) days.push(eventDays[i]!);
      }
      const nEvents = days.length;
      return { days: sortedUnique(days), nEvents, threshold, regionApplied: true };
    }
    // 震度型：全台最大震度，地區設定不適用
    const intensity = this.data.felt.intensity;
    const eventDays = this.feltDays();
    const days: number[] = [];
    for (let i = 0; i < intensity.length; i++) {
      if (intensity[i]! >= size.value) days.push(eventDays[i]!);
    }
    const nEvents = days.length;
    return { days: sortedUnique(days), nEvents, threshold: size.value, regionApplied: false };
  }

  private catalogDays(): Int32Array {
    this.catalogDayCache ??= Int32Array.from(this.data.catalog.t, localDay);
    return this.catalogDayCache;
  }

  private feltDays(): Int32Array {
    this.feltDayCache ??= Int32Array.from(this.data.felt.t, localDay);
    return this.feltDayCache;
  }
}
