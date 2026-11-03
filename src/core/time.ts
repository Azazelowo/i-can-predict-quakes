/**
 * 台灣時間（Asia/Taipei，UTC+8，1979 年後沒有日光節約）的日期換算。
 *
 * 「日序」(day index) = 1970-01-01 起算的台灣曆日編號。所有窗口計算都用日序，
 * 這樣「下週一到週日」就是兩個整數之間的區間，不必處理時區。
 */

const SECONDS_PER_DAY = 86400;
const MS_PER_DAY = 86400000;
const TAIPEI_OFFSET_S = 8 * 3600;

/** unix 秒 → 台灣日序。 */
export function localDay(unix: number): number {
  return Math.floor((unix + TAIPEI_OFFSET_S) / SECONDS_PER_DAY);
}

/** 'YYYY-MM-DD'（台灣日期）→ 日序。格式不對時丟出錯誤。 */
export function isoToDay(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`日期格式應為 YYYY-MM-DD：${iso}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new Error(`不存在的日期：${iso}`);
  }
  return Math.floor(ms / MS_PER_DAY);
}

/** 日序 → 'YYYY-MM-DD'。 */
export function dayToIso(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 星期：0 = 週一 … 6 = 週日（1970-01-01 是週四）。 */
export function weekdayMon0(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

/** 日序所在的西元年。 */
export function yearOfDay(day: number): number {
  return new Date(day * MS_PER_DAY).getUTCFullYear();
}

/** 日序所在的月份（1–12）與日（1–31）。 */
export function monthDayOfDay(day: number): { month: number; date: number } {
  const d = new Date(day * MS_PER_DAY);
  return { month: d.getUTCMonth() + 1, date: d.getUTCDate() };
}

/** 某年某月 1 日的日序（month 1–12，可超出範圍，例如 13 = 隔年 1 月）。 */
export function firstDayOfMonth(year: number, month: number): number {
  return Math.floor(Date.UTC(year, month - 1, 1) / MS_PER_DAY);
}

/** 今天的台灣日期 'YYYY-MM-DD'。 */
export function todayIso(nowMs: number = Date.now()): string {
  return dayToIso(localDay(Math.floor(nowMs / 1000)));
}
