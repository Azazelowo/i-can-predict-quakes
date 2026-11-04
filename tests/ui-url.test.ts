import { describe, expect, it } from 'vitest';
import { decodeClaim, encodeClaim } from '../src/app/url';
import type { Claim } from '../src/core/types';

const nextWeek = { kind: 'nextWeek' as const, start: '2026-11-09', end: '2026-11-15', days: 7 };

const claims: Record<string, Claim> = {
  taiwanStrict: {
    issuedAt: '2026-11-04',
    time: nextWeek,
    region: { kind: 'taiwan' },
    size: { kind: 'magnitude', value: 6, tolerance: 'strict' },
  },
  groupLenient: {
    issuedAt: '2026-11-04',
    time: { kind: 'withinDays', start: '2026-11-04', end: '2026-11-17', days: 14 },
    region: { kind: 'counties', ids: ['G', 'U', 'V'], bufferKm: 30, group: 'east' },
    size: { kind: 'magnitude', value: 6.5, tolerance: 'lenient' },
  },
  ambiguousCounties: {
    issuedAt: '2026-11-04',
    time: { kind: 'nextMonth', start: '2026-12-01', end: '2026-12-31', days: 31 },
    region: { kind: 'counties', ids: ['O', 'J'], bufferKm: 0 },
    size: { kind: 'intensity', value: 5.5 },
  },
  unspecified: {
    issuedAt: '2026-12-31',
    time: { kind: 'vague', start: '2026-12-31', end: '2027-01-29', days: 30 },
    region: { kind: 'counties', ids: ['U'], bufferKm: 60 },
    size: { kind: 'unspecified' },
  },
};

describe('網址 hash', () => {
  it.each(Object.entries(claims))('來回轉換不失真：%s', (_name, claim) => {
    expect(decodeClaim(encodeClaim(claim))).toEqual(claim);
    expect(decodeClaim(`#${encodeClaim(claim)}`)).toEqual(claim);
  });

  it('只含結構化的欄位，不可能夾帶原文', () => {
    for (const claim of Object.values(claims)) {
      expect(encodeClaim(claim)).toMatch(/^[A-Za-z0-9=&,.\-]+$/);
    }
  });

  const valid = encodeClaim(claims.taiwanStrict!);
  const swap = (from: string, to: string) => valid.replace(from, to);

  it.each([
    ['空字串', ''],
    ['亂碼', 'hello world'],
    ['版本不對', swap('v=1', 'v=2')],
    ['發布日不存在', swap('i=2026-11-04', 'i=2026-02-30')],
    ['時間類型不認得', swap('t=nextWeek', 't=someday')],
    ['結束早於開始', swap('e=2026-11-15', 'e=2026-11-01')],
    ['天數超過上限', swap('e=2026-11-15', 'e=2040-01-01')],
    ['大小格式錯誤', swap('z=m6s', 'z=m6x')],
    ['規模超出範圍', swap('z=m6s', 'z=m0s')],
    ['震度不在清單', swap('z=m6s', 'z=i4.5')],
    ['未知縣市', swap('r=tw', 'r=Y&b=30')],
    ['縣市重複', swap('r=tw', 'r=U,U&b=30')],
    ['外推超過 60 公里', swap('r=tw', 'r=U&b=61')],
    ['縣市缺外推距離', swap('r=tw', 'r=U')],
    ['台灣卻帶外推距離', swap('r=tw', 'r=tw&b=30')],
    ['分區與縣市不符', swap('r=tw', 'r=U&b=30&g=east')],
    ['參數重複', `${valid}&z=u`],
    ['太長', `${valid}&x=${'a'.repeat(600)}`],
  ])('不合法的 hash 一律忽略：%s', (_name, hash) => {
    expect(decodeClaim(hash)).toBeNull();
  });
});
