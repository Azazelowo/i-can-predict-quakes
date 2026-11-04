/**
 * M8 亂槍打鳥【事實＋模型】（docs/MODELS.md 第 3 節）。
 *
 * 同一個人一直發同樣的預言，至少中一次的機率。並列兩種算法：
 * - 假設各次獨立【模型】：1 − (1 − p)^n
 * - 歷史實際【事實】：連續 n 個不重疊窗口，在過去 31 年裡至少中一次的比例
 * 地震成群發生，所以歷史實際通常低於獨立假設（中的時候常常是同一串地震）。
 */
import { SHOTGUN_NS } from '../core/constants';
import type { ShotgunResult, ShotgunRow } from '../core/types';
import { binomialPmf } from '../stats/binomial';
import type { ModeContext, SpecifiedClaim } from './context';
import { runCounts } from './window';

/** 「一年份」的次數 n_year = max(1, floor(365 / T)) */
export function yearCount(T: number): number {
  return Math.max(1, Math.floor(365 / T));
}

/** 比較的次數：SHOTGUN_NS 中 n·T ≤ L 者，加上 n_year（若 n_year·T ≤ L），排序去重。 */
export function shotgunCounts(T: number, L: number): number[] {
  const ns: number[] = SHOTGUN_NS.filter((n) => n * T <= L);
  const nYear = yearCount(T);
  if (nYear * T <= L) ns.push(nYear);
  return [...new Set(ns)].sort((a, b) => a - b);
}

/** yearRun 的次數：n_year；若 n_year·T > L 則改用 floor(L / T)。 */
export function yearRunCount(T: number, L: number): number {
  const nYear = yearCount(T);
  return nYear * T <= L ? nYear : Math.floor(L / T);
}

export function shotgunOf(ctx: ModeContext, claim: SpecifiedClaim, p: number): ShotgunResult {
  const T = ctx.windowLength(claim.time.days);
  const L = ctx.length;
  const { hits } = ctx.windowStats(claim.region, claim.size, T);

  const rows: ShotgunRow[] = shotgunCounts(T, L).map((n) => {
    const k = runCounts(hits, T, n);
    let atLeastOne = 0;
    let total = 0;
    for (let i = 0; i < k.length; i++) {
      if (k[i]! >= 1) atLeastOne++;
      total += k[i]!;
    }
    return {
      n,
      independent: 1 - (1 - p) ** n,
      historical: atLeastOne / k.length,
      expectedHits: n * p,
      historicalMeanHits: total / k.length,
    };
  });

  const n = yearRunCount(T, L);
  const k = runCounts(hits, T, n);
  const counts = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < k.length; i++) {
    const j = k[i]!;
    counts[j] = (counts[j] ?? 0) + 1;
  }
  return {
    p,
    rows,
    yearRun: { n, binomial: binomialPmf(n, p), historical: counts.map((c) => c / k.length) },
  };
}
