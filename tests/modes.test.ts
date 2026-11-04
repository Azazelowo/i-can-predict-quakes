/**
 * 各模式的測試（docs/MODELS.md 第 3、4 節）。
 * - 真實資料：與可行性試算（DESIGN.md 3.1、3.2）一致
 * - 合成資料：每條規則（灌水成分、亂槍打鳥）都能逐格手算
 */
import { describe, expect, it } from 'vitest';
import { ANALOGIES, SPECTRUM } from '../src/core/constants';
import { dayToIso, isoToDay } from '../src/core/time';
import type { Claim, DataBundle, RegionSpec, SizeSpec } from '../src/core/types';
import {
  analogy,
  bayes,
  compare,
  computeAll,
  factors,
  information,
  level,
  matrix,
  periodInfo,
  poisson,
  poissonCountCI,
  qualifying,
  replay,
  shotgun,
  spectrum,
  windowHits,
} from '../src/modes';
import { nearestAnalogy } from '../src/modes/conversions';
import { shotgunCounts, yearRunCount } from '../src/modes/shotgun';
import { binomialPmf } from '../src/stats/binomial';
import { loadTestData } from './helpers/data';

// ------------------------------------------------------------------ 共用

const ISSUED = '2026-11-04';

function makeClaim(o: { days?: number; region?: RegionSpec; size?: SizeSpec } = {}): Claim {
  const days = o.days ?? 7;
  return {
    issuedAt: ISSUED,
    time: { kind: 'withinDays', start: ISSUED, end: dayToIso(isoToDay(ISSUED) + days - 1), days },
    region: o.region ?? { kind: 'taiwan' },
    size: o.size ?? { kind: 'magnitude', value: 5, tolerance: 'strict' },
  };
}

const mag = (value: number, tolerance: 'strict' | 'lenient' = 'strict'): SizeSpec => ({
  kind: 'magnitude',
  value,
  tolerance,
});
const int = (value: number): SizeSpec => ({ kind: 'intensity', value });
const counties = (ids: string[], bufferKm: number, group?: 'north'): RegionSpec =>
  group ? { kind: 'counties', ids, bufferKm, group } : { kind: 'counties', ids, bufferKm };
const UNSPECIFIED: SizeSpec = { kind: 'unspecified' };

// 合成資料：期間 = BASE_DAY 起 length 天
const DAY_S = 86400;
const BASE_DAY = isoToDay('2000-01-01');
const BASE_UNIX = BASE_DAY * DAY_S - 8 * 3600;

function synthetic(o: {
  length: number;
  quakes?: { day: number; ml: number; near?: [number, number][] }[];
  felt?: { day: number; intensity: number }[];
  counties?: string[];
}): DataBundle {
  const quakes = o.quakes ?? [];
  const felt = o.felt ?? [];
  const at = (day: number) => BASE_UNIX + day * DAY_S + 3600;
  const near = { maxKm: 60, event: [] as number[], county: [] as number[], km: [] as number[] };
  quakes.forEach((q, i) => {
    for (const [county, km] of q.near ?? []) {
      near.event.push(i);
      near.county.push(county);
      near.km.push(km);
    }
  });
  return {
    catalog: {
      version: 1,
      t: quakes.map((q) => at(q.day)),
      lat: quakes.map(() => 23.5),
      lon: quakes.map(() => 121),
      depth: quakes.map(() => 10),
      ml: quakes.map((q) => q.ml),
      near,
    },
    felt: { version: 1, t: felt.map((f) => at(f.day)), intensity: felt.map((f) => f.intensity), ml: felt.map(() => 4) },
    map: { version: 1, counties: [] },
    meta: {
      version: 1,
      period: {
        start: '2000-01-01',
        end: dayToIso(BASE_DAY + o.length - 1),
        timezone: 'Asia/Taipei',
        startUnix: BASE_UNIX,
        endUnix: BASE_UNIX + o.length * DAY_S,
      },
      catalog: { count: quakes.length, minML: 4, magnitudeType: 'ML', source: 'test', url: '' },
      felt: { count: felt.length, note: '', source: 'test', url: '' },
      counties: { items: (o.counties ?? []).map((id) => ({ id, name: id })), source: 'test', url: '' },
      licenses: [],
    },
  };
}

// ------------------------------------------------------------------ 真實資料

describe('真實資料：與可行性試算一致（MODELS 第 4 節）', () => {
  const data = loadTestData();

  it('資料期間 1995-01-01 到 2026-01-01（不含），11,323 天', () => {
    const period = periodInfo(data);
    expect(period.startDay).toBe(isoToDay('1995-01-01'));
    expect(period.endDay).toBe(isoToDay('2026-01-01'));
    expect(period.years).toBeCloseTo(31.0007, 4);
  });

  it('台灣及近海、ML ≥ 5.0 嚴格、7 天：M1 ≈ 41.2%、M2 ≈ 53.0%、n = 1,223', () => {
    const claim = makeClaim();
    const rep = replay(claim, data)!;
    const poi = poisson(claim, data)!;
    expect(rep.p).toBeCloseTo(0.412, 3);
    expect(poi.p).toBeCloseTo(0.53, 3);
    expect(poi.n).toBe(1223);
    expect(rep.nEvents).toBe(1223);
    expect(rep.windows).toBe(11323 - 7 + 1);
    expect(rep.hits).toBe(4657);
  });

  it('ML ≥ 6.0：5.9%、7.5%、n = 126', () => {
    const claim = makeClaim({ size: mag(6) });
    expect(replay(claim, data)!.p).toBeCloseTo(0.059, 3);
    expect(poisson(claim, data)!.p).toBeCloseTo(0.075, 3);
    expect(poisson(claim, data)!.n).toBe(126);
  });

  it('震度 ≥ 1（有感）：94.6%', () => {
    const rep = replay(makeClaim({ size: int(1) }), data)!;
    expect(rep.p).toBeCloseTo(0.946, 3);
    expect(rep.regionApplied).toBe(false);
    expect(rep.threshold).toBe(1);
  });
});

// ------------------------------------------------------------------ M1

describe('M1 歷史回放', () => {
  const data = loadTestData();
  const claim = makeClaim();
  const rep = replay(claim, data)!;

  it('byYear：31 個年份，加總等於全部窗口', () => {
    expect(rep.byYear.map((y) => y.year)).toEqual(Array.from({ length: 31 }, (_, i) => 1995 + i));
    expect(rep.byYear.reduce((s, y) => s + y.windows, 0)).toBe(rep.windows);
    expect(rep.byYear.reduce((s, y) => s + y.hits, 0)).toBe(rep.hits);
    expect(rep.byYear[0]).toMatchObject({ year: 1995, windows: 365 });
    expect(rep.byYear[1]).toMatchObject({ year: 1996, windows: 366 });
    // 最後一個起點是 2025-12-25（窗口到 12-31）
    expect(rep.byYear[30]).toMatchObject({ year: 2025, windows: 359 });
  });

  it('區間包含點估計，且每次呼叫結果相同', () => {
    expect(rep.ci95[0]).toBeLessThan(rep.p);
    expect(rep.ci95[1]).toBeGreaterThan(rep.p);
    expect(replay(claim, data)!.ci95).toEqual(rep.ci95);
  });

  it('日曆熱圖：第 s 格 = h(startDay + s·T)，不重疊，共 floor(L / T) 格', () => {
    const h = windowHits(qualifying({ kind: 'taiwan' }, mag(5), data).days, periodInfo(data), 7);
    expect(h.length).toBe(rep.windows);
    expect(rep.windowDays).toBe(7);
    expect(rep.slots).toHaveLength(Math.floor(11323 / 7));
    expect(rep.slots).toEqual(Array.from({ length: rep.slots.length }, (_, s) => h[s * 7]));
  });

  it('大小未指定時為 null', () => {
    expect(replay(makeClaim({ size: UNSPECIFIED }), data)).toBeNull();
    expect(poisson(makeClaim({ size: UNSPECIFIED }), data)).toBeNull();
  });

  it('窗口長度夾在 1..L', () => {
    const long = replay(makeClaim({ days: 50000 }), data)!;
    expect(long.windowDays).toBe(11323);
    expect(long.windows).toBe(1);
    expect(long.ci95).toEqual([1, 1]);
    expect(long.slots).toEqual([1]);
  });
});

describe('M1 日曆熱圖（合成資料）', () => {
  it('第 s 格 = h(startDay + s·T)', () => {
    // L = 10、T = 3：起點 0..7，格子取 0、3、6（第 3 格 9 + 3 > 10 不算）
    const data = synthetic({ length: 10, quakes: [{ day: 4, ml: 5 }] });
    const rep = replay(makeClaim({ days: 3 }), data)!;
    // 第 4 天在起點 2、3、4 的窗口裡
    expect(rep.slots).toEqual([0, 1, 0]);
    expect(rep.hits).toBe(3);
    expect(rep.windows).toBe(8);
  });
});

// ------------------------------------------------------------------ M2

describe('M2 固定速率', () => {
  const data = loadTestData();

  it('p = 1 − exp(−λT/365.25)，λ = n / Y，區間包含 p', () => {
    const poi = poisson(makeClaim({ days: 30, size: mag(5.5) }), data)!;
    const Y = periodInfo(data).years;
    expect(poi.years).toBe(Y);
    expect(poi.n).toBe(375);
    expect(poi.ratePerYear).toBe(375 / Y);
    expect(poi.p).toBeCloseTo(1 - Math.exp((-(375 / Y) * 30) / 365.25), 15);
    expect(poi.windowDays).toBe(30);
    const [muL, muU] = poissonCountCI(375);
    expect(poi.ci95[0]).toBeCloseTo(1 - Math.exp((-(muL / Y) * 30) / 365.25), 15);
    expect(poi.ci95[1]).toBeCloseTo(1 - Math.exp((-(muU / Y) * 30) / 365.25), 15);
    expect(poi.ci95[0]).toBeLessThan(poi.p);
    expect(poi.ci95[1]).toBeGreaterThan(poi.p);
  });

  it('n = 0：區間 [0, 用 μ_U = −ln 0.025 換算]', () => {
    const poi = poisson(makeClaim({ days: 1, region: counties(['Z'], 30), size: mag(7) }), data)!;
    const Y = periodInfo(data).years;
    expect(poi.n).toBe(0);
    expect(poi.p).toBe(0);
    expect(poi.ci95[0]).toBe(0);
    expect(poi.ci95[1]).toBeCloseTo(1 - Math.exp(Math.log(0.025) / Y / 365.25), 12);
  });
});

// ------------------------------------------------------------------ M4a

describe('M4a 解讀光譜', () => {
  const data = loadTestData();

  it('與 DESIGN.md 3.2 的表一致，依 p 由大到小', () => {
    const result = spectrum(makeClaim({ size: UNSPECIFIED }), data);
    expect(result.windowDays).toBe(7);
    expect(result.items.map((i) => i.id)).toEqual([
      'felt', 'i3', 'm4.5', 'i4', 'm5', 'i5', 'm5.5', 'm6', 'i6', 'm6.5', 'm7',
    ]);
    const expected: Record<string, number> = {
      felt: 0.946, i3: 0.913, 'm4.5': 0.754, i4: 0.648, m5: 0.412, i5: 0.185,
      'm5.5': 0.16, m6: 0.059, i6: 0.026, 'm6.5': 0.016, m7: 0.004,
    };
    for (const item of result.items) expect(item.p).toBeCloseTo(expected[item.id]!, 3);
    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i]!.p).toBeLessThanOrEqual(result.items[i - 1]!.p);
    }
  });

  it('震度型不套地區；規模型套用預言的地區', () => {
    const result = spectrum(makeClaim({ region: counties(['U'], 30) }), data);
    for (const item of result.items) {
      expect(item.regionApplied).toBe(item.size.kind === 'magnitude');
    }
    const taiwan = spectrum(makeClaim(), data);
    const felt = (r: typeof result) => r.items.find((i) => i.id === 'felt')!;
    expect(felt(result).p).toBe(felt(taiwan).p);
    expect(result.items.find((i) => i.id === 'm5')!.nEvents).toBeLessThan(1223);
  });

  it('同值保持 SPECTRUM 的原順序（穩定排序）', () => {
    // 馬祖縣內從沒有 ML ≥ 4.5：六個規模解讀都是 0，依原順序排在最後
    const result = spectrum(makeClaim({ region: counties(['Z'], 0) }), data);
    expect(result.items.slice(-6).map((i) => i.id)).toEqual(['m4.5', 'm5', 'm5.5', 'm6', 'm6.5', 'm7']);
    expect(result.items.slice(-6).every((i) => i.p === 0)).toBe(true);
  });

  it('回傳的 size 是複本，不會改到常數', () => {
    const result = spectrum(makeClaim(), data);
    const item = result.items.find((i) => i.id === 'm5')!;
    (item.size as { value: number }).value = 9;
    expect(SPECTRUM.find((s) => s.id === 'm5')!.size).toEqual(mag(5));
  });
});

// ------------------------------------------------------------------ M4b

describe('M4b 敏感度矩陣', () => {
  const data = loadTestData();
  const base = matrix(makeClaim(), data);

  it('7 × 7，值是 M1 的 p̂', () => {
    expect(base.magnitudes).toEqual([4, 4.5, 5, 5.5, 6, 6.5, 7]);
    expect(base.windowDays).toEqual([1, 3, 7, 14, 30, 90, 365]);
    expect(base.p).toHaveLength(7);
    for (const row of base.p) expect(row).toHaveLength(7);
    expect(base.p[2]![2]).toBe(replay(makeClaim(), data)!.p);
    expect(base.p[3]![4]).toBe(replay(makeClaim({ days: 30, size: mag(5.5) }), data)!.p);
  });

  it('門檻越高越難中、窗口越長越容易中', () => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (i > 0) expect(base.p[i]![j]).toBeLessThanOrEqual(base.p[i - 1]![j]!);
        if (j > 0) expect(base.p[i]![j]).toBeGreaterThanOrEqual(base.p[i]![j - 1]!);
      }
    }
  });

  it('claimCell：有效門檻 m* 與 T 都在清單內才標示', () => {
    expect(base.claimCell).toEqual([2, 2]);
    expect(matrix(makeClaim({ days: 30, size: mag(7, 'lenient') }), data).claimCell).toEqual([5, 4]);
    expect(matrix(makeClaim({ days: 365, size: mag(3) }), data).claimCell).toEqual([0, 6]);
    expect(matrix(makeClaim({ size: mag(5.3) }), data).claimCell).toBeNull();
    expect(matrix(makeClaim({ days: 10 }), data).claimCell).toBeNull();
    expect(matrix(makeClaim({ size: int(4) }), data).claimCell).toBeNull();
    expect(matrix(makeClaim({ size: UNSPECIFIED }), data).claimCell).toBeNull();
  });

  it('地區用預言的地區', () => {
    const hualien = matrix(makeClaim({ region: counties(['U'], 30) }), data);
    expect(hualien.p[2]![2]).toBe(replay(makeClaim({ region: counties(['U'], 30) }), data)!.p);
    expect(hualien.p[2]![2]).toBeLessThan(base.p[2]![2]!);
  });
});

// ------------------------------------------------------------------ M4c

/**
 * 灌水成分的合成世界（L = 30 天，T = 3 → 28 個窗口；縣市 A、B、C）：
 *   q0 第 2 天  ML 5.0  A 縣內
 *   q1 第 10 天 ML 6.0  B 外推 20 公里
 *   q2 第 20 天 ML 5.0  C 外推 40 公里（超過 30）
 *   q3 第 25 天 ML 6.0  B 縣內、A 外推 25 公里
 * 每個地震日讓 3 個起點命中（不重疊），所以 p = 3 × 地震日數 / 28。
 * 有感：第 5 天震度 6.5、第 15 天震度 7、第 22 天震度 3。
 */
const world = synthetic({
  length: 30,
  counties: ['A', 'B', 'C'],
  quakes: [
    { day: 2, ml: 5, near: [[0, 0]] },
    { day: 10, ml: 6, near: [[1, 20]] },
    { day: 20, ml: 5, near: [[2, 40]] },
    { day: 25, ml: 6, near: [[1, 0], [0, 25]] },
  ],
  felt: [
    { day: 5, intensity: 6.5 },
    { day: 15, intensity: 7 },
    { day: 22, intensity: 3 },
  ],
});
const T3 = { days: 3 };

describe('M4c 灌水成分（合成資料）', () => {
  it('四個維度的收緊方式；同倍數依 time、region、size 排序', () => {
    const claim = makeClaim({ ...T3 });
    const result = factors(claim, world);
    expect(result.map((f) => f.dimension)).toEqual(['time', 'region', 'size']);
    for (const f of result) expect(f.from).toBe(12 / 28);

    const [time, region, size] = result;
    // time：只說某一天
    expect(time!.alt.time).toEqual({ kind: 'date', start: ISSUED, end: ISSUED, days: 1 });
    expect(time!.to).toBe(4 / 30);
    expect(time!.ratio).toBe(12 / 28 / (4 / 30));
    // region：A、B 都是 6/28，同值取 meta.counties.items 中較前的 A；外推 30 公里
    expect(region!.alt.region).toEqual({ kind: 'counties', ids: ['A'], bufferKm: 30 });
    expect(region!.to).toBe(6 / 28);
    expect(region!.ratio).toBe(2);
    // size：值 + 1.0，判定方式不變
    expect(size!.alt.size).toEqual(mag(6));
    expect(size!.ratio).toBe(2);
    // 只改一個維度
    expect(region!.alt.time).toEqual(claim.time);
    expect(size!.alt.region).toEqual(claim.region);
  });

  it('只保留 to < from；收緊後從沒發生過時 ratio = null 且排最前面', () => {
    // ML ≥ 6：地區收緊後 B 仍是 6/28 = from → 不列入
    const result = factors(makeClaim({ ...T3, size: mag(6) }), world);
    expect(result.map((f) => f.dimension)).toEqual(['size', 'time']);
    expect(result[0]!.to).toBe(0);
    expect(result[0]!.ratio).toBeNull();
    expect(result[1]!.ratio).toBe(6 / 28 / (2 / 30));
  });

  it('寬鬆判定：tolerance 改為嚴格；兩個 null 依維度順序', () => {
    // M6.5 寬鬆 → m* = 6.0；size → 7.5 寬鬆（m* 7.0）、tolerance → 6.5 嚴格，都從沒發生過
    const result = factors(makeClaim({ ...T3, size: mag(6.5, 'lenient') }), world);
    expect(result.map((f) => f.dimension)).toEqual(['size', 'tolerance', 'time']);
    expect(result[0]!.alt.size).toEqual(mag(7.5, 'lenient'));
    expect(result[1]!.alt.size).toEqual(mag(6.5, 'strict'));
    expect(result[0]!.ratio).toBeNull();
    expect(result[1]!.ratio).toBeNull();
  });

  it('多個縣市：取成員中最高的單一縣市（同值取 ids 中較前者），外推不變、不帶 group', () => {
    const claim = makeClaim({ ...T3, region: counties(['B', 'A'], 30, 'north') });
    const result = factors(claim, world);
    const region = result.find((f) => f.dimension === 'region')!;
    expect(region.from).toBe(9 / 28);
    expect(region.to).toBe(6 / 28);
    expect(region.alt.region).toEqual({ kind: 'counties', ids: ['B'], bufferKm: 30 });
    // 其他維度保留原本的 group
    expect(result.find((f) => f.dimension === 'time')!.alt.region).toEqual(claim.region);
    // region 與 size 同倍數 1.5，region 在前
    expect(result.map((f) => f.dimension)).toEqual(['time', 'region', 'size']);
  });

  it('單一縣市：外推改為 0；本來就沒差時不列入；外推已是 0 時不適用', () => {
    const b = factors(makeClaim({ ...T3, region: counties(['B'], 30) }), world);
    const region = b.find((f) => f.dimension === 'region')!;
    expect(region.alt.region).toEqual({ kind: 'counties', ids: ['B'], bufferKm: 0 });
    expect(region.from).toBe(6 / 28);
    expect(region.to).toBe(3 / 28);

    const sameAfter = factors(makeClaim({ ...T3, region: counties(['A'], 10) }), world);
    expect(sameAfter.some((f) => f.dimension === 'region')).toBe(false);
    const zero = factors(makeClaim({ ...T3, region: counties(['A'], 0) }), world);
    expect(zero.some((f) => f.dimension === 'region')).toBe(false);
  });

  it('震度型：值 + 1（超過 7 不適用），不做地區', () => {
    const six = factors(makeClaim({ ...T3, region: counties(['A'], 30), size: int(6) }), world);
    expect(six.map((f) => f.dimension)).toEqual(['time', 'size']);
    expect(six[1]!.alt.size).toEqual(int(7));
    expect(six[1]!.ratio).toBe(2);
    const sixHalf = factors(makeClaim({ ...T3, size: int(6.5) }), world);
    expect(sixHalf.map((f) => f.dimension)).toEqual(['time']);
  });

  it('規模值 + 1.0 > 9 時不適用；= 9 時適用', () => {
    const big = synthetic({ length: 30, quakes: [{ day: 5, ml: 8.6 }] });
    expect(factors(makeClaim({ ...T3, size: mag(8.5) }), big).map((f) => f.dimension)).toEqual(['time']);
    const nine = factors(makeClaim({ ...T3, size: mag(8) }), big);
    expect(nine.map((f) => f.dimension)).toEqual(['size', 'time']);
    expect(nine[0]!.alt.size).toEqual(mag(9));
    expect(nine[0]!.ratio).toBeNull();
  });

  it('T = 1 時不做 time；大小沒說時為空陣列', () => {
    expect(factors(makeClaim({ days: 1 }), world).some((f) => f.dimension === 'time')).toBe(false);
    expect(factors(makeClaim({ size: UNSPECIFIED }), world)).toEqual([]);
  });

  it('alt 是新的物件，修改它不會改到原預言', () => {
    const claim = makeClaim({ ...T3, region: counties(['B', 'A'], 30, 'north') });
    const snapshot = structuredClone(claim);
    for (const f of factors(claim, world)) {
      f.alt.time.days = 999;
      if (f.alt.region.kind === 'counties') f.alt.region.ids.push('C');
    }
    expect(claim).toEqual(snapshot);
  });

  it('真實資料：台灣 ML ≥ 5.0、7 天', () => {
    const data = loadTestData();
    const result = factors(makeClaim(), data);
    const from = replay(makeClaim(), data)!.p;
    expect(result.map((f) => f.dimension)).toEqual(['size', 'time', 'region']);
    for (const f of result) {
      expect(f.from).toBe(from);
      expect(f.to).toBeLessThan(from);
      expect(f.ratio).toBeCloseTo(from / f.to, 12);
    }
    // 22 縣市各自外推 30 公里，ML ≥ 5 最常發生的是花蓮
    expect(result[2]!.alt.region).toEqual({ kind: 'counties', ids: ['U'], bufferKm: 30 });
  });
});

// ------------------------------------------------------------------ M8

describe('M8 亂槍打鳥', () => {
  it('比較的次數：{1, 4, 12, 52} 中 n·T ≤ L，加上一年份', () => {
    const L = 11323;
    expect(shotgunCounts(7, L)).toEqual([1, 4, 12, 52]);
    expect(shotgunCounts(30, L)).toEqual([1, 4, 12, 52]);
    expect(shotgunCounts(1, L)).toEqual([1, 4, 12, 52, 365]);
    expect(shotgunCounts(3, L)).toEqual([1, 4, 12, 52, 121]);
    expect(shotgunCounts(365, L)).toEqual([1, 4, 12]);
    expect(shotgunCounts(3650, L)).toEqual([1]);
    expect(shotgunCounts(L, L)).toEqual([1]);
    expect(yearRunCount(7, L)).toBe(52);
    expect(yearRunCount(1, L)).toBe(365);
    expect(yearRunCount(400, L)).toBe(1);
    // 一年份超過資料期間：改用 floor(L / T)
    expect(shotgunCounts(2, 20)).toEqual([1, 4]);
    expect(yearRunCount(2, 20)).toBe(10);
  });

  it('獨立假設 vs 歷史實際（合成資料，逐格手算）', () => {
    // L = 20、T = 2：第 0、15 天有地震 → h = 1 的起點是 0、14、15
    const data = synthetic({ length: 20, quakes: [{ day: 0, ml: 5 }, { day: 15, ml: 5 }] });
    const claim = makeClaim({ days: 2 });
    const p = 0.3;
    const result = shotgun(claim, data, p);
    expect(result.p).toBe(p);
    expect(result.rows.map((r) => r.n)).toEqual([1, 4]);

    const h = Array.from(windowHits([BASE_DAY, BASE_DAY + 15], periodInfo(data), 2));
    expect(h.flatMap((v, i) => (v ? [i] : []))).toEqual([0, 14, 15]);
    const k = (n: number) =>
      Array.from({ length: 20 - n * 2 + 1 }, (_, d) => {
        let s = 0;
        for (let j = 0; j < n; j++) s += h[d + j * 2]!;
        return s;
      });

    for (const row of result.rows) {
      const ks = k(row.n);
      expect(row.independent).toBeCloseTo(1 - (1 - p) ** row.n, 15);
      expect(row.expectedHits).toBeCloseTo(row.n * p, 15);
      expect(row.historical).toBe(ks.filter((v) => v >= 1).length / ks.length);
      expect(row.historicalMeanHits).toBe(ks.reduce((a, b) => a + b, 0) / ks.length);
    }
    // n = 1 的歷史實際就是 M1；n = 4 手算：起點 0、8–12 至少中一次
    expect(result.rows[0]!.historical).toBe(3 / 19);
    expect(result.rows[1]!.historical).toBe(6 / 13);

    // 一年份：n_year = 182 超過期間 → n = floor(20 / 2) = 10，只有起點 0，命中 h0 + h14 = 2 次
    expect(result.yearRun.n).toBe(10);
    expect(result.yearRun.historical).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result.yearRun.binomial).toEqual(binomialPmf(10, p));
    expect(result.yearRun.binomial.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('真實資料：n = 1 的歷史實際 = M1；一年份分布加總為 1', () => {
    const data = loadTestData();
    const claim = makeClaim({ size: mag(6) });
    const rep = replay(claim, data)!;
    const result = shotgun(claim, data, rep.p);
    expect(result.rows.map((r) => r.n)).toEqual([1, 4, 12, 52]);
    expect(result.rows[0]!.historical).toBe(rep.p);
    expect(result.rows[0]!.historicalMeanHits).toBe(rep.p);
    for (const row of result.rows) {
      expect(row.independent).toBeCloseTo(1 - (1 - rep.p) ** row.n, 15);
      expect(row.historical).toBeGreaterThan(0);
      expect(row.historical).toBeLessThanOrEqual(1);
    }
    expect(result.yearRun.n).toBe(52);
    expect(result.yearRun.historical).toHaveLength(53);
    expect(result.yearRun.historical.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('大小沒說時丟出錯誤', () => {
    expect(() => shotgun(makeClaim({ size: UNSPECIFIED }), world, 0.5)).toThrow();
  });
});

// ------------------------------------------------------------------ M10

describe('M10 要連中幾次才可信', () => {
  it.each([
    [0.946, 136],
    [0.754, 27],
    [0.412, 9],
    [0.059, 3],
    [0.004, 2],
  ])('p0 = %f → %i 次（DESIGN.md 6.2 的範例）', (p0, n) => {
    const result = bayes(p0);
    expect(result.hitsNeeded).toBe(n);
    // 剛好達到目標：連中 n 次 ≥ 95%，n − 1 次還不到
    expect(result.curve[n]!.posterior).toBeGreaterThanOrEqual(0.95);
    expect(result.curve[n - 1]!.posterior).toBeLessThan(0.95);
  });

  it('預設值與參數', () => {
    const result = bayes(0.412);
    expect(result).toMatchObject({ prior: 0.01, target: 0.95, skill: 1, p0: 0.412 });
    expect(result.posteriorAfterOne).toBeCloseTo(0.01 / (0.01 + 0.99 * 0.412), 15);
    expect(result.curve[0]).toEqual({ k: 0, posterior: 0.01 });
    expect(result.curve[1]!.posterior).toBeCloseTo(result.posteriorAfterOne, 15);
    expect(bayes(0.412, { prior: undefined }).prior).toBe(0.01);
    expect(bayes(0.412, { prior: 0.1, skill: 0.8 })).toMatchObject({ prior: 0.1, skill: 0.8, target: 0.95 });
  });

  it('p0 = 0：猜中一次就夠，後驗為 1', () => {
    const result = bayes(0);
    expect(result.hitsNeeded).toBe(1);
    expect(result.posteriorAfterOne).toBe(1);
    expect(result.curve).toHaveLength(11);
    expect(result.curve[0]!.posterior).toBe(0.01);
    expect(result.curve.slice(1).every((c) => c.posterior === 1)).toBe(true);
  });

  it('skill ≤ p0：再怎麼連中都無法和亂猜區分 → null', () => {
    expect(bayes(0.5, { skill: 0.5 }).hitsNeeded).toBeNull();
    expect(bayes(1).hitsNeeded).toBeNull();
    const worse = bayes(0.9, { skill: 0.8 });
    expect(worse.hitsNeeded).toBeNull();
    expect(worse.curve).toHaveLength(11);
    for (let k = 1; k < worse.curve.length; k++) {
      expect(worse.curve[k]!.posterior).toBeLessThan(worse.curve[k - 1]!.posterior);
    }
  });

  it('prior ≥ target → 0（優先於其他特例）', () => {
    expect(bayes(0.5, { prior: 0.95 }).hitsNeeded).toBe(0);
    expect(bayes(0.5, { prior: 0.99 }).hitsNeeded).toBe(0);
    expect(bayes(0, { prior: 0.96 }).hitsNeeded).toBe(0);
    expect(bayes(0.9, { prior: 0.96, skill: 0.5 }).hitsNeeded).toBe(0);
  });

  it('曲線長度 K + 1，K = min(max(hitsNeeded + 2, 10), 200)', () => {
    expect(bayes(0.946).curve).toHaveLength(139);
    expect(bayes(0.412).curve).toHaveLength(12);
    expect(bayes(0.059).curve).toHaveLength(11);
    const capped = bayes(0.9999);
    expect(capped.hitsNeeded).toBeGreaterThan(200);
    expect(capped.curve).toHaveLength(201);
    expect(capped.curve.map((c) => c.k)).toEqual(Array.from({ length: 201 }, (_, k) => k));
  });

  it('x 剛好是整數時不因浮點誤差多算一次（ceil(x − 1e−9)）', () => {
    // ln(1881) / ln(1 / p0) = 2 → p0 = 1881^(−1/2)
    expect(bayes(1 / Math.sqrt(1881)).hitsNeeded).toBe(2);
  });
});

// ------------------------------------------------------------------ M12–M14

describe('M12 算命師等級', () => {
  it.each([
    [1, 'benefactor'],
    [0.9, 'benefactor'],
    [0.8999, 'worry'],
    [0.5, 'worry'],
    [0.4999, 'coin'],
    [0.2, 'coin'],
    [0.05, 'something'],
    [0.0499, 'rare'],
    [0.01, 'rare'],
    [0.0099, 'oracle'],
    [0, 'oracle'],
  ])('p = %f → %s', (p, id) => {
    expect(level(p)).toBe(id);
  });
});

describe('M12 生活換算', () => {
  it('logit 距離最近的精確機率', () => {
    expect(analogy(0.5).id).toBe('coin');
    expect(analogy(1 / 6).id).toBe('six');
    expect(analogy(0.412).id).toBe('one-or-two');
    expect(analogy(0.946).id).toBe('not-double-six');
    expect(analogy(0.003).id).toBe('birthday');
  });

  it('p 先夾在 [1e−9, 1 − 1e−9]：p = 0 時不會因為距離都是 Infinity 而選到第一項', () => {
    expect(analogy(0).id).toBe('twenty-heads');
    expect(analogy(1e-15).id).toBe('twenty-heads');
    expect(analogy(1).id).toBe('not-ten-heads');
  });

  it('同距離取清單中較前者', () => {
    const list = [
      { id: 'a', num: 1, den: 4, p: 0.25 },
      { id: 'b', num: 1, den: 4, p: 0.25 },
      { id: 'c', num: 1, den: 2, p: 0.5 },
    ];
    expect(nearestAnalogy(0.2, list).id).toBe('a');
    expect(nearestAnalogy(0.2, [list[1]!, list[0]!, list[2]!]).id).toBe('b');
    expect(nearestAnalogy(0.5, list).id).toBe('c');
  });

  it('回傳複本，不會改到常數', () => {
    const a = analogy(0.5);
    a.p = 0;
    expect(ANALOGIES.find((x) => x.id === 'coin')!.p).toBe(0.5);
  });
});

describe('M13 資訊量', () => {
  it('bits = −log2(p)', () => {
    expect(information(0).bits).toBe(Number.POSITIVE_INFINITY);
    expect(information(1).bits).toBe(0);
    expect(information(0.5).bits).toBe(1);
    expect(information(0.25).bits).toBe(2);
    expect(information(0.946).bits).toBeCloseTo(0.08, 2);
    expect(information(0.004).bits).toBeCloseTo(7.97, 2);
  });
});

describe('M14 模型比較', () => {
  it('並列 M1、M2，diff = p_M2 − p̂_M1', () => {
    const data = loadTestData();
    const claim = makeClaim();
    const rep = replay(claim, data)!;
    const poi = poisson(claim, data)!;
    const result = compare(rep, poi);
    expect(result).toEqual({
      empirical: rep.p,
      empiricalCi: rep.ci95,
      poisson: poi.p,
      poissonCi: poi.ci95,
      diff: poi.p - rep.p,
    });
    expect(result.diff).toBeGreaterThan(0); // 短窗口：群聚讓實際比例低於 Poisson
  });
});

// ------------------------------------------------------------------ computeAll

describe('computeAll', () => {
  const data = loadTestData();

  it('有發生過 → 主數字用 M1（empirical）；各模式與單獨呼叫一致', () => {
    const claim = makeClaim();
    const snapshot = structuredClone(claim);
    const r = computeAll(claim, data);
    const rep = replay(claim, data)!;
    expect(r.headline).toEqual({ p: rep.p, range: null, source: 'empirical' });
    expect(r.claim).toBe(claim);
    expect(claim).toEqual(snapshot);
    expect(r.period).toEqual(periodInfo(data));
    expect(r.flags).toEqual([]);
    expect(r.replay).toEqual(rep);
    expect(r.poisson).toEqual(poisson(claim, data));
    expect(r.spectrum).toEqual(spectrum(claim, data));
    expect(r.matrix).toEqual(matrix(claim, data));
    expect(r.factors).toEqual(factors(claim, data));
    expect(r.shotgun).toEqual(shotgun(claim, data, rep.p));
    expect(r.bayes).toEqual(bayes(rep.p));
    expect(r.bayes!.hitsNeeded).toBe(9);
    expect(r.level).toBe('coin');
    expect(r.analogy).toEqual(analogy(rep.p));
    expect(r.information).toEqual(information(rep.p));
    expect(r.compare).toEqual(compare(rep, r.poisson!));
  });

  it('從沒發生過 → M2 的 95% 上限（poisson-upper）：離島縣、ML 7.0、1 天', () => {
    const claim = makeClaim({ days: 1, region: counties(['Z'], 30), size: mag(7) });
    const r = computeAll(claim, data);
    const Y = periodInfo(data).years;
    expect(r.replay!.nEvents).toBe(0);
    expect(r.replay!.p).toBe(0);
    expect(r.headline.source).toBe('poisson-upper');
    expect(r.headline.range).toBeNull();
    expect(r.headline.p).toBe(r.poisson!.ci95[1]);
    expect(r.headline.p!).toBeCloseTo(1 - Math.exp(Math.log(0.025) / Y / 365.25), 12);
    expect(r.level).toBe('oracle');
    expect(r.shotgun!.p).toBe(r.headline.p);
    expect(r.bayes!.p0).toBe(r.headline.p);
    expect(r.factors).toEqual([]); // from = 0，收緊後不可能更低
  });

  it('大小沒說 → 光譜範圍（spectrum），其餘依賴主數字的欄位為 null', () => {
    const claim = makeClaim({ size: UNSPECIFIED });
    const r = computeAll(claim, data);
    const ps = r.spectrum.items.map((i) => i.p);
    expect(r.headline).toEqual({ p: null, range: [Math.min(...ps), Math.max(...ps)], source: 'spectrum' });
    expect(r.headline.range![0]).toBeCloseTo(0.004, 3);
    expect(r.headline.range![1]).toBeCloseTo(0.946, 3);
    expect(r.factors).toEqual([]);
    for (const key of ['replay', 'poisson', 'shotgun', 'bayes', 'level', 'analogy', 'information', 'compare'] as const) {
      expect(r[key]).toBeNull();
    }
    expect(r.matrix.claimCell).toBeNull();
    expect(r.flags).toEqual([]);
  });

  it('旗標：門檻被夾到 4.0（size-below-min）', () => {
    expect(computeAll(makeClaim({ size: mag(3) }), data).flags).toEqual([{ code: 'size-below-min' }]);
    expect(computeAll(makeClaim({ size: mag(4.3, 'lenient') }), data).flags).toEqual([{ code: 'size-below-min' }]);
    expect(computeAll(makeClaim({ size: mag(4.5, 'lenient') }), data).flags).toEqual([]);
    expect(computeAll(makeClaim({ size: mag(4) }), data).flags).toEqual([]);
  });

  it('旗標：震度型且地區不是台灣（size-intensity-region-ignored）', () => {
    const r = computeAll(makeClaim({ region: counties(['U'], 30), size: int(4) }), data);
    expect(r.flags).toEqual([{ code: 'size-intensity-region-ignored' }]);
    expect(r.replay!.regionApplied).toBe(false);
    expect(computeAll(makeClaim({ size: int(4) }), data).flags).toEqual([]);
  });

  it('效能：真實資料每次 computeAll 遠低於 1 秒（目標 < 150 ms）', () => {
    const claims = [
      makeClaim(),
      makeClaim({ days: 30, region: counties(['U', 'V'], 30), size: mag(6, 'lenient') }),
      makeClaim({ size: UNSPECIFIED }),
      makeClaim({ size: int(1) }),
    ];
    computeAll(claims[0]!, data); // 暖機
    for (const claim of claims) {
      const t0 = performance.now();
      computeAll(claim, data);
      expect(performance.now() - t0).toBeLessThan(1000);
    }
  });
});
