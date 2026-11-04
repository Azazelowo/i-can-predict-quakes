/**
 * Poisson 累積分布與 Garwood 精確區間（docs/MODELS.md 第 3 節 M2、附錄 B）。
 *
 * 為什麼在對數空間算：n 可以到上萬（震度 ≥ 1 約 1.6 萬筆），直接算 μ^i / i! 會溢位；
 * 先算每一項的對數再用 log-sum-exp 加總，任何 n 都穩定。
 */

/** 雙尾 95%：每一尾 2.5% */
const LOWER_TAIL = 0.025;
const UPPER_TAIL = 0.975;

/** 二分法的停止條件（規格：區間寬度 < 1e−12 × max(1, 上界)，或做滿 200 次） */
const BISECTION_REL_TOL = 1e-12;
const BISECTION_MAX_ITER = 200;

/** ln(i)，i = 0..k（第 0 格不用）。同一次二分法裡會反覆用到，先算好一次。 */
function logIntegers(k: number): Float64Array {
  const table = new Float64Array(Math.max(k, 0) + 1);
  for (let i = 1; i <= k; i++) table[i] = Math.log(i);
  return table;
}

/**
 * F(k; μ) = Σ_{i=0}^{k} exp(−μ + i·ln μ − ln i!)，依附錄 B 的遞迴：
 * logt_0 = −μ；logt_i = logt_{i−1} + ln μ − ln i；最後用 log-sum-exp 加總。
 * lnI 必須至少涵蓋 1..k；scratch 長度至少 k + 1（避免每次配置記憶體）。
 */
function cdfFromTable(k: number, mu: number, lnI: Float64Array, scratch: Float64Array): number {
  if (k < 0) return 0;
  if (mu === 0) return 1;
  const lnMu = Math.log(mu);
  let logt = -mu;
  let max = logt;
  scratch[0] = logt;
  for (let i = 1; i <= k; i++) {
    logt = logt + lnMu - lnI[i]!;
    scratch[i] = logt;
    if (logt > max) max = logt;
  }
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += Math.exp(scratch[i]! - max);
  return Math.exp(max + Math.log(sum));
}

/** Poisson 累積分布 F(k; μ) = P(X ≤ k)，X ~ Poisson(μ)。μ = 0 時為 1；k < 0 時為 0。 */
export function poissonCdf(k: number, mu: number): number {
  if (!Number.isInteger(k)) throw new RangeError(`k 必須是整數：${k}`);
  if (!(mu >= 0)) throw new RangeError(`μ 必須 ≥ 0：${mu}`);
  return cdfFromTable(k, mu, logIntegers(k), new Float64Array(Math.max(k, 0) + 1));
}

/**
 * 解 f(μ) = target，f 在 [lo, hi] 上遞減（Poisson CDF 對 μ 遞減）。
 * 回傳最後區間的中點【規格未指定回傳哪一端；區間寬度已 < 1e−12 相對誤差，任一端都等價】。
 */
export function bisectDecreasing(
  f: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
): number {
  for (let iter = 0; iter < BISECTION_MAX_ITER; iter++) {
    if (hi - lo < BISECTION_REL_TOL * Math.max(1, hi)) break;
    const mid = (lo + hi) / 2;
    if (f(mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Garwood (1936) 精確 95% 區間：觀察到 n 次時，Poisson 期望值 μ 的 [μ_L, μ_U]。
 * - μ_L：n = 0 時為 0；否則解 F(n − 1; μ) = 0.975（即 P(X ≥ n | μ) = 0.025）
 * - μ_U：解 F(n; μ) = 0.025
 * 二分法的初始區間 [0, n + 10·√(n+1) + 10]。
 */
export function garwoodInterval(n: number): [number, number] {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`事件數必須是非負整數：${n}`);
  const hi = n + 10 * Math.sqrt(n + 1) + 10;
  const lnI = logIntegers(n);
  const scratch = new Float64Array(n + 1);
  const lower =
    n === 0 ? 0 : bisectDecreasing((mu) => cdfFromTable(n - 1, mu, lnI, scratch), UPPER_TAIL, 0, hi);
  const upper = bisectDecreasing((mu) => cdfFromTable(n, mu, lnI, scratch), LOWER_TAIL, 0, hi);
  return [lower, upper];
}

/** 固定速率下，T 天內至少一次的機率：1 − exp(−λ · T / 365.25)，λ 為每年次數。 */
export function poissonAtLeastOne(ratePerYear: number, windowDays: number): number {
  return 1 - Math.exp((-ratePerYear * windowDays) / 365.25);
}
