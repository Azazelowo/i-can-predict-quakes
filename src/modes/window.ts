/**
 * 窗口命中 h(d) 與其衍生計數（docs/MODELS.md 1.7、M1、M8）。
 * 全部是純陣列運算：輸入日序，輸出 0／1 或整數計數，不碰資料檔。
 */

/**
 * h(d)，d ∈ [startDay, startDay + L − T]（索引 i = d − startDay，共 N = L − T + 1 個）：
 * 存在符合條件的地震日 e 使 d ≤ e < d + T 時為 1。
 *
 * 做法：先把期間內的地震日標成 1，再由後往前掃，記住「d 之後最近的地震日」，
 * 整體 O(L + 地震日數)。期間外的日子（e < startDay 或 e ≥ startDay + L）不可能落在任何窗口裡，直接略過。
 */
export function computeWindowHits(
  days: readonly number[],
  startDay: number,
  L: number,
  T: number,
): Uint8Array {
  const N = Math.max(0, L - T + 1);
  const hits = new Uint8Array(N);
  if (N === 0) return hits;
  const marked = new Uint8Array(L);
  for (const e of days) {
    const i = e - startDay;
    if (i >= 0 && i < L) marked[i] = 1;
  }
  let next = Number.POSITIVE_INFINITY; // 索引 ≥ i 的最近地震日
  for (let i = L - 1; i >= 0; i--) {
    if (marked[i] === 1) next = i;
    if (i < N && next < i + T) hits[i] = 1;
  }
  return hits;
}

/** 0／1 陣列的總和 */
export function countOnes(values: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < values.length; i++) n += values[i]!;
  return n;
}

/**
 * 連續、不重疊的 n 個窗口的命中次數：k(i) = Σ_{j=0}^{n−1} h[i + j·T]，
 * i = 0..N − (n−1)·T − 1（即起點 d ∈ [startDay, endDay − n·T]）。
 *
 * 做法：沿間隔 T 的累加 C[i] = h[i] + C[i − T]，則 k(i) = C[i + (n−1)T] − C[i − T]，
 * 每個 n 都是 O(N)，不必逐窗相加（T = 1 時一年份 n = 365）。全程整數運算，結果精確。
 */
export function runCounts(hits: Uint8Array, T: number, n: number): Int32Array {
  const N = hits.length;
  const span = (n - 1) * T;
  const M = N - span;
  if (n < 1 || M <= 0) return new Int32Array(0);
  const cum = new Int32Array(N);
  for (let i = 0; i < N; i++) cum[i] = hits[i]! + (i >= T ? cum[i - T]! : 0);
  const out = new Int32Array(M);
  for (let i = 0; i < M; i++) out[i] = cum[i + span]! - (i >= T ? cum[i - T]! : 0);
  return out;
}
