/**
 * 跨語言黃金檔比對（docs/MODELS.md 第 4 節「獨立實作比對」）。
 *
 * tools/golden.py 只依 docs/MODELS.md、用 Python 把計算獨立實作一次；這裡用網頁程式（src/modes）
 * 計算 tests/golden/claims.json 的同一批預言，逐欄和 tests/golden/expected.json 比對。
 * 兩邊不一致，代表其中一邊讀錯規格，或規格沒寫清楚。expected.json 的 interpretations
 * 列出 golden.py 在規格沒寫清楚之處所做的選擇，對照時先看那裡。
 *
 * 比對規則
 * - 代碼、字串、布林、null 與整數欄位（INTEGER_FIELDS）：完全相同。
 * - 浮點數：|實際 − 預期| ≤ 1e−9 × max(1, |預期|)。
 * - Garwood 與 Poisson 區間（二分法只收斂到約 1e−12）：容許 1e−8。
 * - mulberry32：位元層級相同（完全相等）。
 * - 預期值是字串 "Infinity" 時，實際值必須是 Infinity。
 * 失敗訊息會列出預言 id 與欄位路徑，例如「tw-m5-strict-7d › replay.ci95[0]: …」。
 *
 * 規則或資料改了：執行 `python tools/golden.py` 重新產生 expected.json，並確認差異是預期的。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BAYES_DEFAULTS } from '../src/core/constants';
import type { Claim, Results } from '../src/core/types';
import { analogy, bayes, computeAll, information, level, poissonCountCI } from '../src/modes';
import * as modes from '../src/modes';
import { loadTestData } from './helpers/data';

/**
 * src/modes 目前沒有匯出 mulberry32（tsc 確認）。之後若從 src/modes 匯出，下面的測試向量單元
 * 會自動啟用；沒匯出時略過，但每則預言的 replay.ci95（拔靴法用它抽樣）仍會間接驗證它。
 */
const exportedRng: unknown = (modes as unknown as Record<string, unknown>)['mulberry32'];
const mulberry32 = typeof exportedRng === 'function' ? (exportedRng as (seed: number) => () => number) : null;

// ------------------------------------------------------------------ 黃金檔的形狀

interface GoldenClaim {
  id: string;
  claim: Claim;
}

/** expected.json 的一則預言：id、claim，以及 project() 產生的各欄位。 */
interface GoldenRecord extends GoldenClaim {
  headline: { source: string };
  [field: string]: unknown;
}

interface GoldenFile {
  interpretations: string[];
  units: {
    mulberry32: { seed: number; values: number[] };
    garwood: { n: number; ci: [number, number] }[];
    bayesHitsNeeded: { p0: number; hitsNeeded: number | null }[];
    levelAnalogy: { p: number; level: string; analogy: string; bits: number | string }[];
  };
  claims: GoldenRecord[];
}

function readGolden<T>(name: string): T {
  const path = fileURLToPath(new URL(`./golden/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

// ------------------------------------------------------------------ 比對

const FLOAT_TOL = 1e-9;
const INTERVAL_TOL = 1e-8;
const MAX_REPORTED = 40;

/** 這些欄位（或其陣列元素）一律是整數，必須完全相同。 */
const INTEGER_FIELDS = new Set([
  'startDay',
  'endDay',
  'T',
  'days',
  'hits',
  'windows',
  'nEvents',
  'n',
  'year',
  'windowDays',
  'slotsLength',
  'slotsSum',
  'slotsHead',
  'claimCell',
  'hitsNeeded',
  'curveLength',
]);

type Tolerance = (path: string) => number;

/** Garwood 與 Poisson 的區間值（含 poisson-upper 主數字）用較寬的容許誤差。 */
function isIntervalPath(path: string): boolean {
  return /^(poisson\.ci95|compare\.poissonCi|garwood)\[/.test(path);
}

/** 路徑最後一個欄位名稱：'replay.byYear[3].hits' → 'hits'。 */
function lastField(path: string): string {
  const parts = path.replace(/\[[^\]]*\]/g, '').split('.');
  return parts[parts.length - 1] ?? '';
}

function joinPath(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function show(x: unknown): string {
  if (x === undefined) return 'undefined';
  if (typeof x === 'number') return Object.is(x, -0) ? '-0' : String(x);
  const s = JSON.stringify(x);
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

/**
 * 逐欄比對 expected（JSON）與 actual，把不一致寫進 out（每項含欄位路徑）。
 * 物件：expected 的每個欄位都要比；actual 多出來的欄位（值不是 undefined）也算不一致。
 */
function diff(expected: unknown, actual: unknown, path: string, tol: Tolerance, out: string[]): void {
  if (expected === 'Infinity' || expected === '-Infinity') {
    const want = expected === 'Infinity' ? Infinity : -Infinity;
    if (actual !== want) out.push(`${path}: 預期 ${expected}，實際 ${show(actual)}`);
    return;
  }
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || Number.isNaN(actual)) {
      out.push(`${path}: 預期 ${show(expected)}，實際 ${show(actual)}`);
      return;
    }
    const ok = INTEGER_FIELDS.has(lastField(path))
      ? actual === expected
      : actual === expected || Math.abs(actual - expected) <= tol(path) * Math.max(1, Math.abs(expected));
    if (!ok) out.push(`${path}: 預期 ${show(expected)}，實際 ${show(actual)}（差 ${show(actual - expected)}）`);
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      out.push(`${path}: 預期陣列 ${show(expected)}，實際 ${show(actual)}`);
      return;
    }
    if (actual.length !== expected.length) {
      out.push(`${path}.length: 預期 ${expected.length}，實際 ${actual.length}`);
    }
    const n = Math.min(actual.length, expected.length);
    for (let i = 0; i < n; i++) diff(expected[i], actual[i], `${path}[${i}]`, tol, out);
    return;
  }
  if (isRecord(expected)) {
    if (!isRecord(actual)) {
      out.push(`${path}: 預期物件 ${show(expected)}，實際 ${show(actual)}`);
      return;
    }
    for (const [key, value] of Object.entries(expected)) diff(value, actual[key], joinPath(path, key), tol, out);
    for (const [key, value] of Object.entries(actual)) {
      if (!(key in expected) && value !== undefined) {
        out.push(`${joinPath(path, key)}: 預期沒有這個欄位，實際 ${show(value)}`);
      }
    }
    return;
  }
  // 字串、布林、null
  if (actual !== expected) out.push(`${path}: 預期 ${show(expected)}，實際 ${show(actual)}`);
}

/**
 * 沒有不一致就通過；有的話，失敗訊息本身逐行列出「預言 id › 欄位路徑: 預期…，實際…」
 * （太多時只列前 MAX_REPORTED 項）。訊息放在 expect 的第二個參數，任何 reporter 都看得到。
 */
function expectNoDiff(id: string, out: string[]): void {
  const lines = out.slice(0, MAX_REPORTED).map((line) => `${id} › ${line}`);
  if (out.length > MAX_REPORTED) lines.push(`${id} › …另外還有 ${out.length - MAX_REPORTED} 個欄位不一致`);
  expect(out.length, `和 tools/golden.py 不一致的欄位：\n${lines.join('\n')}\n`).toBe(0);
}

/** 把網頁程式的 Results 轉成 expected.json 的形狀（欄位定義見 tools/golden.py 的 compute_claim）。 */
function project(r: Results): Record<string, unknown> {
  const { replay, poisson, shotgun, bayes: b, compare } = r;
  return {
    period: { startDay: r.period.startDay, endDay: r.period.endDay, years: r.period.years },
    T: r.spectrum.windowDays,
    headline: { p: r.headline.p, range: r.headline.range, source: r.headline.source },
    flags: r.flags.map((f) => f.code),
    replay: replay && {
      p: replay.p,
      hits: replay.hits,
      windows: replay.windows,
      nEvents: replay.nEvents,
      threshold: replay.threshold,
      regionApplied: replay.regionApplied,
      windowDays: replay.windowDays,
      ci95: replay.ci95,
      byYear: replay.byYear.map((y) => ({ year: y.year, hits: y.hits, windows: y.windows })),
      slotsLength: replay.slots.length,
      slotsSum: replay.slots.reduce((sum, x) => sum + x, 0),
      slotsHead: replay.slots.slice(0, 64),
    },
    poisson: poisson && {
      n: poisson.n,
      years: poisson.years,
      ratePerYear: poisson.ratePerYear,
      p: poisson.p,
      ci95: poisson.ci95,
      windowDays: poisson.windowDays,
    },
    spectrum: r.spectrum.items.map((it) => ({
      id: it.id,
      p: it.p,
      nEvents: it.nEvents,
      regionApplied: it.regionApplied,
    })),
    matrix: {
      magnitudes: r.matrix.magnitudes,
      windowDays: r.matrix.windowDays,
      p: r.matrix.p,
      claimCell: r.matrix.claimCell,
    },
    factors: r.factors.map((f) => ({ dimension: f.dimension, from: f.from, to: f.to, ratio: f.ratio, alt: f.alt })),
    shotgun: shotgun && {
      p: shotgun.p,
      rows: shotgun.rows.map((row) => ({
        n: row.n,
        independent: row.independent,
        historical: row.historical,
        expectedHits: row.expectedHits,
        historicalMeanHits: row.historicalMeanHits,
      })),
      yearRun: { n: shotgun.yearRun.n, binomial: shotgun.yearRun.binomial, historical: shotgun.yearRun.historical },
    },
    bayes: b && {
      prior: b.prior,
      target: b.target,
      skill: b.skill,
      p0: b.p0,
      posteriorAfterOne: b.posteriorAfterOne,
      hitsNeeded: b.hitsNeeded,
      curveLength: b.curve.length,
      curveLast: b.curve[b.curve.length - 1]?.posterior ?? null,
    },
    level: r.level,
    analogy: r.analogy ? r.analogy.id : null,
    information: r.information ? r.information.bits : null,
    compare: compare && {
      empirical: compare.empirical,
      empiricalCi: compare.empiricalCi,
      poisson: compare.poisson,
      poissonCi: compare.poissonCi,
      diff: compare.diff,
    },
  };
}

// ------------------------------------------------------------------ 測試

const golden = readGolden<GoldenFile>('expected.json');
const inputs = readGolden<GoldenClaim[]>('claims.json');

describe('golden：輸入', () => {
  it('expected.json 是由目前的 claims.json 產生的（否則請執行 python tools/golden.py）', () => {
    const out: string[] = [];
    diff(
      inputs.map((c) => c.id),
      golden.claims.map((g) => g.id),
      'ids',
      () => 0,
      out,
    );
    golden.claims.forEach((g, i) => diff(inputs[i]?.claim, g.claim, `claims[${g.id}].claim`, () => 0, out));
    expectNoDiff('claims.json', out);
  });
});

describe('golden：公式單元（MODELS.md 附錄）', () => {
  it.skipIf(mulberry32 === null)('mulberry32 測試向量：位元層級相同（src/modes 有匯出時才執行）', () => {
    const { seed, values } = golden.units.mulberry32;
    const rng = (mulberry32 as (seed: number) => () => number)(seed);
    const out: string[] = [];
    diff(
      values,
      values.map(() => rng()),
      'mulberry32.values',
      () => 0,
      out,
    );
    expectNoDiff('units', out);
  });

  it('Garwood 區間', () => {
    const out: string[] = [];
    for (const { n, ci } of golden.units.garwood) {
      diff(ci, poissonCountCI(n), `garwood[n=${n}]`, () => INTERVAL_TOL, out);
    }
    expectNoDiff('units', out);
  });

  it('M10 所需次數（預設參數）', () => {
    const out: string[] = [];
    for (const { p0, hitsNeeded } of golden.units.bayesHitsNeeded) {
      diff(hitsNeeded, bayes(p0, { ...BAYES_DEFAULTS }).hitsNeeded, `bayesHitsNeeded[p0=${p0}].hitsNeeded`, () => 0, out);
    }
    expectNoDiff('units', out);
  });

  it('M12 等級、類比與 M13 資訊量', () => {
    const out: string[] = [];
    for (const u of golden.units.levelAnalogy) {
      const path = `levelAnalogy[p=${u.p}]`;
      diff(u.level, level(u.p), `${path}.level`, () => 0, out);
      diff(u.analogy, analogy(u.p).id, `${path}.analogy`, () => 0, out);
      diff(u.bits, information(u.p).bits, `${path}.bits`, () => FLOAT_TOL, out);
    }
    expectNoDiff('units', out);
  });
});

describe('golden：每則預言都和 tools/golden.py 一致', () => {
  const data = loadTestData();
  for (const record of golden.claims) {
    it(record.id, () => {
      const { id, claim, ...fields } = record;
      const poissonUpper = record.headline.source === 'poisson-upper';
      const tol: Tolerance = (path) =>
        isIntervalPath(path) || (poissonUpper && path === 'headline.p') ? INTERVAL_TOL : FLOAT_TOL;
      const out: string[] = [];
      diff(fields, project(computeAll(claim, data)), '', tol, out);
      expectNoDiff(id, out);
    });
  }
});
