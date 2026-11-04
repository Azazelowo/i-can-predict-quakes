/**
 * 確認卡上的修改 → 新的 Claim 片段。
 *
 * 時間窗一律交給解析器的 windowFor 計算（docs/MODELS.md 2.2 的規則只寫在一個地方），
 * 這裡只負責驗證使用者輸入、決定要傳哪些參數。
 */
import { windowFor } from '../claim/parse';
import { DEFAULT_BUFFER_KM, MAX_BUFFER_KM, MAX_WINDOW_DAYS } from '../core/constants';
import { COUNTIES, GROUPS } from '../core/regions';
import { isoToDay } from '../core/time';
import type { Claim, RegionSpec, SizeSpec, TimeKind, TimeWindow, Tolerance } from '../core/types';

// ================================================================ 時間

/** 確認卡的時間選項（其他類型只會出現在解析結果裡，選單會另外顯示「目前」那一項） */
export const TIME_PRESETS: readonly TimeKind[] = [
  'today',
  'tomorrow',
  'thisWeek',
  'nextWeek',
  'thisMonth',
  'nextMonth',
  'thisYear',
  'withinDays',
  'dateRange',
];

/** 由天數決定的類型：改發布日時沿用天數 */
const BY_DAYS: ReadonlySet<TimeKind> = new Set<TimeKind>(['withinDays', 'vague', 'unspecified']);
/** 由明確日期決定的類型：改發布日時沿用日期 */
const ABSOLUTE: ReadonlySet<TimeKind> = new Set<TimeKind>(['date', 'untilDate', 'dateRange', 'month']);

export type TimeError = 'days' | 'order' | 'tooLong' | 'invalid' | 'issued';
export type TimeEdit = { ok: true; time: TimeWindow; clamped: boolean } | { ok: false; error: TimeError };

export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  try {
    isoToDay(text);
    return true;
  } catch {
    return false;
  }
}

/** 天數型的類型顯示「N」欄位 */
export function usesDays(kind: TimeKind): boolean {
  return BY_DAYS.has(kind);
}

/** 日期型的類型顯示開始、結束日欄位 */
export function usesDates(kind: TimeKind): boolean {
  return ABSOLUTE.has(kind);
}

/** 依目前的時間窗，決定重算時要傳給 windowFor 的參數 */
export function windowOptions(time: TimeWindow): { days?: number; start?: string; end?: string } {
  if (BY_DAYS.has(time.kind)) return { days: time.days };
  if (ABSOLUTE.has(time.kind)) return { start: time.start, end: time.end };
  return {};
}

function build(kind: TimeKind, issuedAt: string, opts: { days?: number; start?: string; end?: string }): TimeEdit {
  let time: TimeWindow;
  try {
    time = windowFor(kind, issuedAt, opts);
  } catch {
    return { ok: false, error: 'invalid' };
  }
  if (!isIsoDate(time.start) || !isIsoDate(time.end)) return { ok: false, error: 'invalid' };
  if (isoToDay(time.end) < isoToDay(time.start)) return { ok: false, error: 'order' };
  return { ok: true, time, clamped: false };
}

/** 從選單選一種時間說法。N 天內沿用目前的天數、自訂起訖沿用目前的日期，切換時窗口不會突然跳掉。 */
export function chooseTimeKind(claim: Claim, kind: TimeKind): TimeEdit {
  if (kind === 'withinDays') {
    const days = Math.min(Math.max(1, claim.time.days), MAX_WINDOW_DAYS);
    return build('withinDays', claim.issuedAt, { days });
  }
  if (kind === 'dateRange') return build('dateRange', claim.issuedAt, { start: claim.time.start, end: claim.time.end });
  return build(kind, claim.issuedAt, {});
}

/** 輸入 N（N 天內）。超過上限時截斷並回報 clamped。 */
export function setDays(claim: Claim, raw: string): TimeEdit {
  const text = raw.trim();
  if (!/^\d{1,7}$/.test(text)) return { ok: false, error: 'days' };
  const n = Number(text);
  if (n < 1) return { ok: false, error: 'days' };
  const clamped = n > MAX_WINDOW_DAYS;
  const result = build('withinDays', claim.issuedAt, { days: clamped ? MAX_WINDOW_DAYS : n });
  return result.ok ? { ...result, clamped } : result;
}

/** 自訂起訖 */
export function setRange(start: string, end: string, claim: Claim): TimeEdit {
  if (!isIsoDate(start) || !isIsoDate(end)) return { ok: false, error: 'invalid' };
  const days = isoToDay(end) - isoToDay(start) + 1;
  if (days < 1) return { ok: false, error: 'order' };
  if (days > MAX_WINDOW_DAYS) return { ok: false, error: 'tooLong' };
  return build('dateRange', claim.issuedAt, { start, end });
}

/** 改預言發布日：相對的說法（下週、N 天內…）跟著移動，指定的日期維持不變。 */
export function setIssuedAt(claim: Claim, issuedAt: string): TimeEdit {
  if (!isIsoDate(issuedAt)) return { ok: false, error: 'invalid' };
  const result = build(claim.time.kind, issuedAt, windowOptions(claim.time));
  return result.ok ? result : { ok: false, error: 'issued' };
}

/** 旗標 time-past：指定的日期早於發布日 */
export function isPastWindow(time: TimeWindow, issuedAt: string): boolean {
  return ABSOLUTE.has(time.kind) && time.start < issuedAt;
}

// ================================================================ 地點

/** 地點選單的值：tw、g:<分區 id>、c:<縣市代碼>；多個縣市但不是分區時為 null（選單顯示「目前」） */
export function regionValue(region: RegionSpec): string | null {
  if (region.kind === 'taiwan') return 'tw';
  if (region.group) return `g:${region.group}`;
  if (region.ids.length === 1) return `c:${region.ids[0] ?? ''}`;
  return null;
}

/** 從選單選地點。縣市之間切換時沿用目前的外推距離；從台灣切過來時用預設值。 */
export function applyRegionValue(region: RegionSpec, value: string): RegionSpec | null {
  const bufferKm = region.kind === 'counties' ? region.bufferKm : DEFAULT_BUFFER_KM;
  if (value === 'tw') return { kind: 'taiwan' };
  if (value.startsWith('g:')) {
    const group = GROUPS.find((g) => g.id === value.slice(2));
    return group ? { kind: 'counties', ids: [...group.ids], bufferKm, group: group.id } : null;
  }
  if (value.startsWith('c:')) {
    const id = value.slice(2);
    return COUNTIES.some((c) => c.id === id) ? { kind: 'counties', ids: [id], bufferKm } : null;
  }
  return null;
}

export function applyBuffer(region: RegionSpec, km: number): RegionSpec {
  if (region.kind !== 'counties' || !Number.isFinite(km)) return region;
  return { ...region, bufferKm: Math.min(Math.max(0, Math.round(km)), MAX_BUFFER_KM) };
}

// ================================================================ 大小

/** 規模選項：4.0–8.0，每 0.5 一級 */
export const MAGNITUDE_CHOICES: readonly number[] = Array.from({ length: 9 }, (_, i) => 4 + i * 0.5);
/** 從「沒說」或「震度」切到規模時的預設 */
export const DEFAULT_MAGNITUDE = 5.0;
/** 切到震度時的預設 */
export const DEFAULT_INTENSITY = 4;

export function sizeOfKind(prev: SizeSpec, kind: SizeSpec['kind']): SizeSpec {
  if (kind === prev.kind) return prev;
  if (kind === 'magnitude') return { kind: 'magnitude', value: DEFAULT_MAGNITUDE, tolerance: 'strict' };
  if (kind === 'intensity') return { kind: 'intensity', value: DEFAULT_INTENSITY };
  return { kind: 'unspecified' };
}

export function sizeWithValue(prev: SizeSpec, value: number): SizeSpec {
  if (!Number.isFinite(value)) return prev;
  if (prev.kind === 'magnitude') return { kind: 'magnitude', value, tolerance: prev.tolerance };
  if (prev.kind === 'intensity') return { kind: 'intensity', value };
  return prev;
}

export function sizeWithTolerance(prev: SizeSpec, tolerance: Tolerance): SizeSpec {
  return prev.kind === 'magnitude' ? { kind: 'magnitude', value: prev.value, tolerance } : prev;
}
