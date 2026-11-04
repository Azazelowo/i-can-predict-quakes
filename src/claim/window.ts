/**
 * 時間窗（docs/MODELS.md 2.2 的表格）。解析器與確認卡共用（parse.ts 以 windowFor 對外提供），
 * 所以「下週是哪幾天」這類規則只寫在這裡。
 *
 * 規格沒寫、我們的解讀（見 notes）：
 * - 天數型（withinDays、vague、unspecified）：days 未給或不是有限數時用 30；先四捨五入成整數再夾在 1–3650。
 * - 日期型（date、untilDate、dateRange、month）超過 3650 天時，結束日截到 start + 3649。
 * - 日期型的結束日早於開始日時「照樣回傳」（days ≤ 0），讓確認卡回報「順序錯誤」；解析器自己不會產生這種窗口。
 * - date 只給 start 或只給 end 時視為同一天；untilDate 只看 end（開始日一律是 issuedAt）；
 *   dateRange、month 兩個都要。缺少必要的日期時丟出錯誤（確認卡會接住並顯示「日期不正確」）。
 */
import { MAX_WINDOW_DAYS, VAGUE_WINDOW_DAYS } from '../core/constants';
import { dayToIso, firstDayOfMonth, isoToDay, monthDayOfDay, weekdayMon0, yearOfDay } from '../core/time';
import type { TimeKind, TimeWindow } from '../core/types';

export interface WindowOptions {
  days?: number;
  start?: string;
  end?: string;
}

/** 某年某月最後一天的日序（month 1–12，可超出範圍，與 firstDayOfMonth 相同）。 */
export function lastDayOfMonth(year: number, month: number): number {
  return firstDayOfMonth(year, month + 1) - 1;
}

export function makeWindow(kind: TimeKind, start: number, end: number): TimeWindow {
  return { kind, start: dayToIso(start), end: dayToIso(end), days: end - start + 1 };
}

/** 天數型的天數：未給或不是有限數時用 30，四捨五入成整數後夾在 1–3650。 */
export function clampDays(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return VAGUE_WINDOW_DAYS;
  return Math.min(Math.max(1, Math.round(days)), MAX_WINDOW_DAYS);
}

function absolute(kind: TimeKind, start: number, end: number): TimeWindow {
  const last = end - start + 1 > MAX_WINDOW_DAYS ? start + MAX_WINDOW_DAYS - 1 : end;
  return makeWindow(kind, start, last);
}

function required(value: string | undefined, kind: TimeKind, name: string): string {
  if (value === undefined) throw new Error(`windowFor：${kind} 需要 ${name}（YYYY-MM-DD）`);
  return value;
}

/** windowFor 的實作（簽名與文件見 parse.ts）。issuedAt 或日期格式不對時，isoToDay 會丟出錯誤。 */
export function computeWindow(kind: TimeKind, issuedAt: string, opts: WindowOptions = {}): TimeWindow {
  const d0 = isoToDay(issuedAt);
  const w0 = weekdayMon0(d0); // 0 = 週一 … 6 = 週日
  const year = yearOfDay(d0);
  const { month } = monthDayOfDay(d0);

  switch (kind) {
    case 'today':
      return makeWindow(kind, d0, d0);
    case 'tomorrow':
      return makeWindow(kind, d0 + 1, d0 + 1);
    case 'dayAfterTomorrow':
      return makeWindow(kind, d0 + 2, d0 + 2);
    case 'thisWeek':
      return makeWindow(kind, d0, d0 + 6 - w0);
    case 'nextWeek':
      return makeWindow(kind, d0 + 7 - w0, d0 + 13 - w0);
    case 'weekend':
      return w0 <= 5 ? makeWindow(kind, d0 + 5 - w0, d0 + 6 - w0) : makeWindow(kind, d0, d0);
    case 'thisMonth':
      return makeWindow(kind, d0, lastDayOfMonth(year, month));
    case 'nextMonth':
      return makeWindow(kind, firstDayOfMonth(year, month + 1), lastDayOfMonth(year, month + 1));
    case 'thisYear':
      return makeWindow(kind, d0, lastDayOfMonth(year, 12));
    case 'withinDays':
    case 'vague':
    case 'unspecified':
      return makeWindow(kind, d0, d0 + clampDays(opts.days) - 1);
    case 'date': {
      const start = required(opts.start ?? opts.end, kind, 'start');
      const end = required(opts.end ?? opts.start, kind, 'end');
      return absolute(kind, isoToDay(start), isoToDay(end));
    }
    case 'untilDate':
      return absolute(kind, d0, isoToDay(required(opts.end, kind, 'end')));
    case 'dateRange':
    case 'month':
      return absolute(
        kind,
        isoToDay(required(opts.start, kind, 'start')),
        isoToDay(required(opts.end, kind, 'end')),
      );
    default: {
      const never: never = kind;
      throw new Error(`windowFor：未知的時間類型 ${String(never)}`);
    }
  }
}
