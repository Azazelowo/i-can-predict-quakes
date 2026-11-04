/**
 * 統計工具與窗口命中的單元測試（docs/MODELS.md 1.7、第 3 節 M1／M2、附錄 A／B）。
 * 窗口命中用手工建立的小型資料，答案可以逐格手算。
 */
import { describe, expect, it } from 'vitest';
import { dayToIso, isoToDay } from '../src/core/time';
import type { Claim, DataBundle, PeriodInfo, RegionSpec } from '../src/core/types';
import { hitRate, periodInfo, poissonCountCI, qualifying, regionMask, replay, windowHits } from '../src/modes';
import { binomialPmf, logFactorials } from '../src/stats/binomial';
import { blockBootstrapRatio } from '../src/stats/bootstrap';
import { logit, sigmoid } from '../src/stats/logit';
import { garwoodInterval, poissonAtLeastOne, poissonCdf } from '../src/stats/poisson';
import { mulberry32 } from '../src/stats/random';

// ------------------------------------------------------------------ 合成資料

const DAY_S = 86400;
const BASE_DAY = isoToDay('2000-01-01');
/** 2000-01-01 00:00 台灣時間的 unix 秒 */
const BASE_UNIX = BASE_DAY * DAY_S - 8 * 3600;

interface SynthQuake {
  /** 距離期間第一天的天數 */
  day: number;
  /** 台灣時間當天的第幾秒（預設凌晨 1 點） */
  sec?: number;
  ml?: number;
  lat?: number;
  lon?: number;
  /** [縣市索引, 距離 km] */
  near?: [number, number][];
}

interface SynthFelt {
  day: number;
  sec?: number;
  intensity: number;
}

/** 期間 = BASE_DAY 起 length 天的合成 DataBundle。 */
function synthetic(o: {
  length: number;
  quakes?: SynthQuake[];
  felt?: SynthFelt[];
  counties?: string[];
}): DataBundle {
  const quakes = o.quakes ?? [];
  const felt = o.felt ?? [];
  const at = (day: number, sec = 3600) => BASE_UNIX + day * DAY_S + sec;
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
      t: quakes.map((q) => at(q.day, q.sec)),
      lat: quakes.map((q) => q.lat ?? 23.5),
      lon: quakes.map((q) => q.lon ?? 121),
      depth: quakes.map(() => 10),
      ml: quakes.map((q) => q.ml ?? 5),
      near,
    },
    felt: {
      version: 1,
      t: felt.map((f) => at(f.day, f.sec)),
      intensity: felt.map((f) => f.intensity),
      ml: felt.map(() => 4),
    },
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

const M5 = { kind: 'magnitude', value: 5, tolerance: 'strict' } as const;
const TAIWAN = { kind: 'taiwan' } as const;

/** 0／1 陣列轉成一般陣列，方便比對 */
const bits = (a: Uint8Array) => Array.from(a);

// ------------------------------------------------------------------ 亂數

describe('mulberry32（附錄 A）', () => {
  it('種子 20261104 的前 5 個值與測試向量相符（12 位小數）', () => {
    const rng = mulberry32(20261104);
    for (const expected of ['0.686575185275', '0.025461189216', '0.660663346294', '0.854467261815', '0.441696755122']) {
      expect(rng().toFixed(12)).toBe(expected);
    }
  });

  it('同一個種子得到同一個序列，值都在 [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(43)()).not.toBe(mulberry32(42)());
  });
});

// ------------------------------------------------------------------ Poisson

describe('Poisson CDF（附錄 B）', () => {
  it('與直接加總一致', () => {
    const mu = 2.5;
    let term = Math.exp(-mu);
    let sum = 0;
    for (let k = 0; k <= 8; k++) {
      if (k > 0) term *= mu / k;
      sum += term;
      expect(poissonCdf(k, mu)).toBeCloseTo(sum, 14);
    }
    expect(poissonCdf(0, 3)).toBeCloseTo(Math.exp(-3), 15);
  });

  it('邊界：μ = 0 時為 1，k < 0 時為 0', () => {
    expect(poissonCdf(0, 0)).toBe(1);
    expect(poissonCdf(10, 0)).toBe(1);
    expect(poissonCdf(-1, 2)).toBe(0);
  });

  it('大 μ 在對數空間計算不溢位', () => {
    const f = poissonCdf(20000, 20000);
    expect(Number.isFinite(f)).toBe(true);
    expect(f).toBeGreaterThan(0.5);
    expect(f).toBeLessThan(0.51);
    expect(poissonCdf(20000, 21000)).toBeLessThan(1e-9);
  });

  it('對 μ 遞減', () => {
    let prev = 1;
    for (let mu = 0.5; mu < 30; mu += 0.5) {
      const f = poissonCdf(7, mu);
      expect(f).toBeLessThan(prev);
      prev = f;
    }
  });
});

describe('Garwood 精確區間（附錄 B）', () => {
  const table: [number, number, number][] = [
    [0, 0, 3.688879],
    [1, 0.025318, 5.571643],
    [5, 1.623486, 11.668332],
    [10, 4.795389, 18.390356],
  ];

  it.each(table)('n = %i：μ_L ≈ %f、μ_U ≈ %f（誤差 < 1e−5）', (n, lower, upper) => {
    const [l, u] = poissonCountCI(n);
    expect(Math.abs(l - lower)).toBeLessThan(1e-5);
    expect(Math.abs(u - upper)).toBeLessThan(1e-5);
  });

  it('n = 0：下限為 0，上限 = −ln 0.025', () => {
    const [l, u] = garwoodInterval(0);
    expect(l).toBe(0);
    expect(Math.abs(u + Math.log(0.025))).toBeLessThan(1e-10);
  });

  it('解出的端點滿足定義方程式', () => {
    for (const n of [1, 3, 37, 126, 1223]) {
      const [l, u] = garwoodInterval(n);
      expect(poissonCdf(n - 1, l)).toBeCloseTo(0.975, 10);
      expect(poissonCdf(n, u)).toBeCloseTo(0.025, 10);
      expect(l).toBeLessThan(n);
      expect(u).toBeGreaterThan(n);
    }
  });

  it('上萬筆時仍然穩定（震度 ≥ 1 約 1.6 萬筆）', () => {
    const n = 16495;
    const [l, u] = garwoodInterval(n);
    expect(l).toBeGreaterThan(n - 3 * Math.sqrt(n));
    expect(u).toBeLessThan(n + 3 * Math.sqrt(n));
    expect(u - l).toBeGreaterThan(3.5 * Math.sqrt(n)); // ≈ 2 × 1.96 √n
  });

  it('拒絕非整數或負數', () => {
    expect(() => garwoodInterval(-1)).toThrow();
    expect(() => garwoodInterval(1.5)).toThrow();
  });

  it('至少一次的機率 1 − exp(−λT/365.25)', () => {
    expect(poissonAtLeastOne(0, 7)).toBe(0);
    expect(poissonAtLeastOne(365.25, 1)).toBeCloseTo(1 - Math.exp(-1), 15);
  });
});

// ------------------------------------------------------------------ 二項分布、logit

describe('二項分布（對數空間）', () => {
  it('小 n 與直接公式一致', () => {
    const pmf = binomialPmf(4, 0.3);
    [0.2401, 0.4116, 0.2646, 0.0756, 0.0081].forEach((v, k) => expect(pmf[k]).toBeCloseTo(v, 14));
  });

  it('總和為 1（n = 365 也不溢位）', () => {
    // ln(i!) 逐項累加的捨入誤差讓 n = 365 時相對誤差約 1e−12，遠小於與 golden 比對的 1e−9
    for (const [n, p] of [[52, 0.4115], [365, 0.08], [365, 0.95]] as const) {
      const sum = binomialPmf(n, p).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it('p = 0、p = 1 時全部集中在一端', () => {
    expect(binomialPmf(3, 0)).toEqual([1, 0, 0, 0]);
    expect(binomialPmf(3, 1)).toEqual([0, 0, 0, 1]);
    expect(binomialPmf(0, 0.5)).toEqual([1]);
  });

  it('ln(i!)', () => {
    const lf = logFactorials(5);
    expect(lf[0]).toBe(0);
    expect(lf[5]).toBeCloseTo(Math.log(120), 14);
  });
});

describe('logit／sigmoid', () => {
  it('互為反函數，極端值不會變成 NaN', () => {
    for (const p of [1e-6, 0.01, 0.3, 0.5, 0.9, 0.999]) expect(sigmoid(logit(p))).toBeCloseTo(p, 14);
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(1000)).toBe(1);
    expect(sigmoid(-1000)).toBe(0);
    expect(logit(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(logit(1)).toBe(Number.POSITIVE_INFINITY);
  });
});

// ------------------------------------------------------------------ 拔靴法

describe('年區塊拔靴法', () => {
  const hits = [3, 0, 10, 7, 1];
  const windows = [365, 366, 365, 365, 200];

  it('同樣的輸入得到完全相同的結果', () => {
    const a = blockBootstrapRatio(hits, windows, 1000, 20261104);
    const b = blockBootstrapRatio(hits, windows, 1000, 20261104);
    expect(Array.from(a.replicates)).toEqual(Array.from(b.replicates));
    expect(a.ci95).toEqual(b.ci95);
    expect(blockBootstrapRatio(hits, windows, 1000, 1).ci95).not.toEqual(a.ci95);
  });

  it('抽樣順序：每次重抽依序抽 K 個區塊 i = floor(rng() × K)', () => {
    const rng = mulberry32(7);
    const K = hits.length;
    const expected: number[] = [];
    for (let b = 0; b < 5; b++) {
      let h = 0;
      let w = 0;
      for (let j = 0; j < K; j++) {
        const i = Math.floor(rng() * K);
        h += hits[i]!;
        w += windows[i]!;
      }
      expected.push(h / w);
    }
    expected.sort((x, y) => x - y);
    expect(Array.from(blockBootstrapRatio(hits, windows, 5, 7).replicates)).toEqual(expected);
  });

  it('區間取排序後的第 floor(0.025·B) 與 ceil(0.975·B) − 1 個（B = 1000 → 25、974）', () => {
    const { ci95, replicates } = blockBootstrapRatio(hits, windows, 1000, 20261104);
    expect(ci95[0]).toBe(replicates[25]);
    expect(ci95[1]).toBe(replicates[974]);
    for (let i = 1; i < replicates.length; i++) expect(replicates[i]!).toBeGreaterThanOrEqual(replicates[i - 1]!);
  });

  it('每年都一樣時區間退化成一點', () => {
    expect(blockBootstrapRatio([5, 5, 5], [10, 10, 10], 1000, 1).ci95).toEqual([0.5, 0.5]);
  });

  it('replay() 每次呼叫都重新設定種子', () => {
    const data = synthetic({
      length: 3 * 365,
      quakes: [5, 40, 41, 300, 420, 800, 801, 1000].map((day) => ({ day })),
    });
    const claim: Claim = {
      issuedAt: '2026-11-04',
      time: { kind: 'withinDays', start: '2026-11-04', end: '2026-11-10', days: 7 },
      region: TAIWAN,
      size: M5,
    };
    const first = replay(claim, data)!;
    const second = replay(claim, data)!;
    expect(second.ci95).toEqual(first.ci95);
    expect(first.byYear.map((y) => y.year)).toEqual([2000, 2001, 2002]);
    expect(first.ci95[0]).toBeLessThanOrEqual(first.p);
    expect(first.ci95[1]).toBeGreaterThanOrEqual(first.p);
  });
});

// ------------------------------------------------------------------ 窗口命中

describe('windowHits（MODELS 1.7）', () => {
  // 期間 [100, 110)，L = 10
  const period: PeriodInfo = { startDay: 100, endDay: 110, years: 10 / 365.25 };

  it('窗口 [d, d + T) 含頭不含尾：起點 d 的窗口包含第 d 到 d + T − 1 天', () => {
    // T = 3，起點 100..107（N = 8）
    expect(bits(windowHits([105], period, 3))).toEqual([0, 0, 0, 1, 1, 1, 0, 0]);
    // 地震在 d + T 那天不算：第 103 天只落在起點 101、102、103 的窗口
    expect(bits(windowHits([103], period, 3))).toEqual([0, 1, 1, 1, 0, 0, 0, 0]);
  });

  it('期間第一天與最後一天的地震', () => {
    expect(bits(windowHits([100], period, 3))).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(bits(windowHits([109], period, 3))).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it('期間外的地震不算', () => {
    expect(bits(windowHits([99, 110, 200], period, 3))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('T = 1 時就是「那天有沒有地震」', () => {
    expect(bits(windowHits([100, 104, 109], period, 1))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('T = L 時只有一個窗口', () => {
    expect(bits(windowHits([107], period, 10))).toEqual([1]);
    expect(bits(windowHits([], period, 10))).toEqual([0]);
  });

  it('T 夾在 1..L：超過 L 視為 L，小於 1 視為 1', () => {
    expect(bits(windowHits([107], period, 50))).toEqual([1]);
    expect(bits(windowHits([104], period, 0))).toEqual(bits(windowHits([104], period, 1)));
  });

  it('沒排序、重複的日子不影響結果', () => {
    expect(bits(windowHits([105, 101, 105, 101], period, 2))).toEqual(bits(windowHits([101, 105], period, 2)));
  });
});

describe('hitRate／qualifying（合成資料）', () => {
  it('空的目錄：p = 0、沒有地震', () => {
    const data = synthetic({ length: 30 });
    expect(hitRate(TAIWAN, M5, 7, data)).toEqual({ p: 0, hits: 0, windows: 24, nEvents: 0 });
    expect(qualifying(TAIWAN, M5, data)).toEqual({ days: [], nEvents: 0, threshold: 5, regionApplied: true });
  });

  it('台灣時間換日：23:59:59 算當天，隔天 00:00 已在期間外', () => {
    const data = synthetic({ length: 10, quakes: [{ day: 9, sec: DAY_S - 1 }, { day: 10, sec: 0 }] });
    const q = qualifying(TAIWAN, M5, data);
    expect(q.days).toEqual([BASE_DAY + 9, BASE_DAY + 10]);
    expect(q.nEvents).toBe(2);
    // 只有第 9 天在期間內 → T = 1 的 10 個窗口中只中最後一個
    expect(hitRate(TAIWAN, M5, 1, data)).toEqual({ p: 0.1, hits: 1, windows: 10, nEvents: 2 });
  });

  it('同一天兩筆：nEvents 算筆數，days 去重', () => {
    const data = synthetic({ length: 10, quakes: [{ day: 3 }, { day: 3, sec: 50000 }, { day: 6 }] });
    const q = qualifying(TAIWAN, M5, data);
    expect(q.nEvents).toBe(3);
    expect(q.days).toEqual([BASE_DAY + 3, BASE_DAY + 6]);
    expect(hitRate(TAIWAN, M5, 10, data)).toEqual({ p: 1, hits: 1, windows: 1, nEvents: 3 });
  });

  it('台灣及近海的矩形含邊界', () => {
    const data = synthetic({
      length: 10,
      quakes: [
        { day: 0, lat: 21, lon: 119 },
        { day: 1, lat: 26, lon: 123 },
        { day: 2, lat: 20.999, lon: 121 },
        { day: 3, lat: 23, lon: 123.001 },
      ],
    });
    expect(Array.from(regionMask(TAIWAN, data))).toEqual([1, 1, 0, 0]);
    expect(qualifying(TAIWAN, M5, data).nEvents).toBe(2);
  });

  it('縣市：near 裡 km ≤ 外推距離（含等號），id 先換成索引', () => {
    const data = synthetic({
      length: 10,
      counties: ['Z', 'U', 'V'],
      quakes: [
        { day: 0, near: [[1, 0]] }, // 花蓮縣內
        { day: 1, near: [[1, 30]] }, // 花蓮外推剛好 30 公里
        { day: 2, near: [[1, 30.1], [2, 0]] }, // 臺東縣內、花蓮 30.1 公里
        { day: 3 }, // 不在任何縣市 60 公里內
      ],
    });
    const mask = (ids: string[], bufferKm: number) => Array.from(regionMask({ kind: 'counties', ids, bufferKm }, data));
    expect(mask(['U'], 0)).toEqual([1, 0, 0, 0]);
    expect(mask(['U'], 30)).toEqual([1, 1, 0, 0]);
    expect(mask(['U'], 60)).toEqual([1, 1, 1, 0]);
    expect(mask(['V'], 0)).toEqual([0, 0, 1, 0]);
    expect(mask(['U', 'V'], 0)).toEqual([1, 0, 1, 0]);
    expect(mask(['Z'], 60)).toEqual([0, 0, 0, 0]);
    expect(() => regionMask({ kind: 'counties', ids: ['Y'], bufferKm: 0 }, data)).toThrow();
  });

  it('規模門檻：嚴格、寬鬆（−0.5）、低於 4.0 以 4.0 計算', () => {
    const data = synthetic({
      length: 10,
      quakes: [{ day: 0, ml: 3.9 }, { day: 1, ml: 4.0 }, { day: 2, ml: 4.5 }, { day: 3, ml: 6.4 }, { day: 4, ml: 6.5 }],
    });
    const q = (value: number, tolerance: 'strict' | 'lenient') =>
      qualifying(TAIWAN, { kind: 'magnitude', value, tolerance }, data);
    expect(q(7, 'strict')).toMatchObject({ nEvents: 0, threshold: 7 });
    expect(q(7, 'lenient')).toMatchObject({ nEvents: 1, threshold: 6.5 });
    expect(q(4.5, 'lenient')).toMatchObject({ nEvents: 4, threshold: 4 });
    expect(q(3, 'strict')).toMatchObject({ nEvents: 4, threshold: 4 }); // 3.9 不算
  });

  it('震度型：不套地區、門檻就是震度值', () => {
    const data = synthetic({
      length: 10,
      counties: ['U'],
      felt: [{ day: 1, intensity: 0 }, { day: 2, intensity: 4 }, { day: 5, intensity: 5.5 }],
    });
    const intensity = (value: number) => ({ kind: 'intensity', value }) as const;
    const county: RegionSpec = { kind: 'counties', ids: ['U'], bufferKm: 0 };
    expect(qualifying(county, intensity(4), data)).toEqual({
      days: [BASE_DAY + 2, BASE_DAY + 5],
      nEvents: 2,
      threshold: 4,
      regionApplied: false,
    });
    expect(qualifying(county, intensity(5.5), data).nEvents).toBe(1);
    expect(qualifying(TAIWAN, intensity(1), data).nEvents).toBe(2); // 震度 0 不算有感
    expect(hitRate(county, intensity(4), 3, data)).toEqual({ p: 6 / 8, hits: 6, windows: 8, nEvents: 2 });
  });

  it('大小未指定時丟出錯誤', () => {
    const data = synthetic({ length: 10 });
    expect(() => qualifying(TAIWAN, { kind: 'unspecified' }, data)).toThrow();
    expect(() => hitRate(TAIWAN, { kind: 'unspecified' }, 7, data)).toThrow();
  });

  it('periodInfo 由 meta.period 決定', () => {
    expect(periodInfo(synthetic({ length: 30 }))).toEqual({
      startDay: BASE_DAY,
      endDay: BASE_DAY + 30,
      years: 30 / 365.25,
    });
  });
});
