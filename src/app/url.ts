/**
 * 網址 hash ↔ Claim（純函式，可在 Node 測試）。
 *
 * 只放結構化的 Claim，永遠不放原文（原文可能有人名，AGENTS.md 規則 3）。
 * 格式（版本 1），參數順序固定：
 *
 *   #v=1&i=2026-11-04&t=nextWeek&s=2026-11-09&e=2026-11-15&r=U,V&b=30&g=huadong&z=m6l
 *
 *   v  版本（目前是 1）
 *   i  預言發布日 issuedAt（YYYY-MM-DD）
 *   t  時間類型 TimeKind
 *   s  時間窗開始日、e 結束日（含頭尾；天數 = e − s + 1，最多 MAX_WINDOW_DAYS）
 *   r  地區：tw = 台灣及近海；否則為縣市代碼，以逗號分隔
 *   b  縣界外推公里數（整數 0–MAX_BUFFER_KM；r 為縣市時必填）
 *   g  分區 id（選填；必須和 r 是同一組縣市）
 *   z  大小：u = 沒說；m<值><s|l> = 規模（s 嚴格、l 寬鬆），例如 m6l、m6.5s；i<值> = 震度，例如 i4、i5.5
 *
 * 解碼時逐項驗證，任何一項不合法就回傳 null（呼叫端忽略這個 hash）。
 */
import { INTENSITY_VALUES, MAX_BUFFER_KM, MAX_WINDOW_DAYS } from '../core/constants';
import { COUNTIES, GROUPS } from '../core/regions';
import { isoToDay } from '../core/time';
import type { Claim, GroupId, RegionSpec, SizeSpec, TimeKind } from '../core/types';

export const HASH_VERSION = 1;

/** 太長的 hash 一定不是我們產生的（22 個縣市全選也只有一百多個字元） */
const MAX_HASH_LENGTH = 512;

const TIME_KINDS: readonly TimeKind[] = [
  'today',
  'tomorrow',
  'dayAfterTomorrow',
  'thisWeek',
  'nextWeek',
  'weekend',
  'thisMonth',
  'nextMonth',
  'month',
  'thisYear',
  'withinDays',
  'date',
  'untilDate',
  'dateRange',
  'vague',
  'unspecified',
];

const KNOWN_KEYS = ['v', 'i', 't', 's', 'e', 'r', 'b', 'g', 'z'] as const;

/** 數值的精簡寫法：6 → "6"，6.5 → "6.5"（最多一位小數） */
function compactNumber(v: number): string {
  return String(Math.round(v * 10) / 10);
}

export function encodeSize(size: SizeSpec): string {
  switch (size.kind) {
    case 'magnitude':
      return `m${compactNumber(size.value)}${size.tolerance === 'strict' ? 's' : 'l'}`;
    case 'intensity':
      return `i${compactNumber(size.value)}`;
    case 'unspecified':
      return 'u';
  }
}

/** Claim → hash（不含開頭的 #） */
export function encodeClaim(claim: Claim): string {
  const parts = [
    `v=${HASH_VERSION}`,
    `i=${claim.issuedAt}`,
    `t=${claim.time.kind}`,
    `s=${claim.time.start}`,
    `e=${claim.time.end}`,
  ];
  if (claim.region.kind === 'taiwan') {
    parts.push('r=tw');
  } else {
    parts.push(`r=${claim.region.ids.join(',')}`, `b=${compactNumber(claim.region.bufferKm)}`);
    if (claim.region.group) parts.push(`g=${claim.region.group}`);
  }
  parts.push(`z=${encodeSize(claim.size)}`);
  return parts.join('&');
}

function dayOf(iso: string | null): number | null {
  if (iso === null || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const year = Number(iso.slice(0, 4));
  if (year < 1900 || year > 2200) return null;
  try {
    return isoToDay(iso);
  } catch {
    return null;
  }
}

function decodeRegion(r: string | null, b: string | null, g: string | null): RegionSpec | null {
  if (r === null) return null;
  if (r === 'tw') return b === null && g === null ? { kind: 'taiwan' } : null;
  const ids = r.split(',');
  if (ids.length === 0 || ids.length > COUNTIES.length) return null;
  if (new Set(ids).size !== ids.length) return null;
  if (!ids.every((id) => COUNTIES.some((c) => c.id === id))) return null;
  if (b === null || !/^\d{1,2}$/.test(b)) return null;
  const bufferKm = Number(b);
  if (bufferKm > MAX_BUFFER_KM) return null;
  if (g === null) return { kind: 'counties', ids, bufferKm };
  const group = GROUPS.find((x) => x.id === g);
  if (!group) return null;
  const sameSet = group.ids.length === ids.length && group.ids.every((id) => ids.includes(id));
  if (!sameSet) return null;
  const groupId: GroupId = group.id;
  return { kind: 'counties', ids, bufferKm, group: groupId };
}

export function decodeSize(z: string | null): SizeSpec | null {
  if (z === null) return null;
  if (z === 'u') return { kind: 'unspecified' };
  const mag = /^m(\d(?:\.\d)?)([sl])$/.exec(z);
  if (mag) {
    const value = Number(mag[1]);
    if (!(value >= 1 && value <= 9.9)) return null;
    return { kind: 'magnitude', value, tolerance: mag[2] === 's' ? 'strict' : 'lenient' };
  }
  const inten = /^i(\d(?:\.5)?)$/.exec(z);
  if (inten) {
    const value = Number(inten[1]);
    // 解析器可能讀到「震度 0 級」（docs/MODELS.md 2.4：v ∈ 0–7），所以 0 也接受
    if (value !== 0 && !(INTENSITY_VALUES as readonly number[]).includes(value)) return null;
    return { kind: 'intensity', value };
  }
  return null;
}

/** hash（可含開頭的 #）→ Claim；不合法時回傳 null。 */
export function decodeClaim(hash: string): Claim | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (text.length === 0 || text.length > MAX_HASH_LENGTH) return null;

  const params = new URLSearchParams(text);
  for (const key of KNOWN_KEYS) {
    if (params.getAll(key).length > 1) return null;
  }
  if (params.get('v') !== String(HASH_VERSION)) return null;

  const issuedAt = params.get('i');
  if (dayOf(issuedAt) === null || issuedAt === null) return null;

  const kind = params.get('t');
  if (kind === null || !(TIME_KINDS as readonly string[]).includes(kind)) return null;
  const start = params.get('s');
  const end = params.get('e');
  const startDay = dayOf(start);
  const endDay = dayOf(end);
  if (start === null || end === null || startDay === null || endDay === null) return null;
  if (endDay < startDay) return null;
  const days = endDay - startDay + 1;
  if (days > MAX_WINDOW_DAYS) return null;

  const region = decodeRegion(params.get('r'), params.get('b'), params.get('g'));
  if (!region) return null;
  const size = decodeSize(params.get('z'));
  if (!size) return null;

  return {
    issuedAt,
    time: { kind: kind as TimeKind, start, end, days },
    region,
    size,
  };
}
