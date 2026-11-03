import { describe, expect, it } from 'vitest';
import {
  dayToIso,
  firstDayOfMonth,
  isoToDay,
  localDay,
  monthDayOfDay,
  todayIso,
  weekdayMon0,
  yearOfDay,
} from '../src/core/time';

describe('台灣日序', () => {
  it('台灣午夜換日，不是 UTC 午夜', () => {
    // 2026-11-04T00:00+08:00 = 2026-11-03T16:00Z
    const midnight = Date.UTC(2026, 10, 3, 16, 0, 0) / 1000;
    expect(dayToIso(localDay(midnight))).toBe('2026-11-04');
    expect(dayToIso(localDay(midnight - 1))).toBe('2026-11-03');
  });

  it('ISO 與日序互換', () => {
    for (const iso of ['1995-01-01', '2000-02-29', '2024-12-31', '2026-01-01']) {
      expect(dayToIso(isoToDay(iso))).toBe(iso);
    }
    expect(isoToDay('2026-01-01') - isoToDay('1995-01-01')).toBe(11323);
  });

  it('拒絕不存在的日期', () => {
    expect(() => isoToDay('2026-02-30')).toThrow();
    expect(() => isoToDay('2026/11/04')).toThrow();
  });

  it('星期以週一為 0', () => {
    expect(weekdayMon0(isoToDay('1970-01-01'))).toBe(3); // 週四
    expect(weekdayMon0(isoToDay('2026-11-04'))).toBe(2); // 週三
    expect(weekdayMon0(isoToDay('2026-11-09'))).toBe(0); // 週一
    expect(weekdayMon0(isoToDay('2026-11-15'))).toBe(6); // 週日
  });

  it('年、月、日', () => {
    const d = isoToDay('2024-02-29');
    expect(yearOfDay(d)).toBe(2024);
    expect(monthDayOfDay(d)).toEqual({ month: 2, date: 29 });
    expect(dayToIso(firstDayOfMonth(2026, 13))).toBe('2027-01-01');
  });

  it('今天以台灣時間計', () => {
    expect(todayIso(Date.UTC(2026, 10, 3, 16, 30))).toBe('2026-11-04');
  });
});
