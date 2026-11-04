/**
 * 二項分布（M8 亂槍打鳥的「一年份」分布）。
 *
 * 為什麼在對數空間算：n 最多 365（T = 1 天時的一年份），C(365, 182) ≈ 10^108，
 * 直接乘會失去精度；改成 ln C(n,k) + k·ln p + (n−k)·ln(1−p) 再取 exp。
 */

/** ln(i!)，i = 0..n（逐項累加 ln j）。 */
export function logFactorials(n: number): Float64Array {
  const table = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) table[i] = table[i - 1]! + Math.log(i);
  return table;
}

/**
 * Binomial(n, p) 的機率質量，索引 k = 0..n。
 * 約定 0 · ln 0 = 0，所以 p = 0 或 1 時也正確（全部機率集中在 k = 0 或 k = n）。
 * ln(1 − p) 用 log1p(−p)，p 很小時比 log(1 − p) 精確。
 */
export function binomialPmf(n: number, p: number): number[] {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`次數必須是非負整數：${n}`);
  const lf = logFactorials(n);
  const lnP = Math.log(p);
  const lnQ = Math.log1p(-p);
  const out: number[] = new Array<number>(n + 1);
  for (let k = 0; k <= n; k++) {
    let logPmf = lf[n]! - lf[k]! - lf[n - k]!;
    if (k > 0) logPmf += k * lnP;
    if (n - k > 0) logPmf += (n - k) * lnQ;
    out[k] = Math.exp(logPmf);
  }
  return out;
}
