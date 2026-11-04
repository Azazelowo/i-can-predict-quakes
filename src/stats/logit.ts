/** 機率與對數勝算（logit）互換。M10 的貝氏更新、M12 的類比都在 logit 尺度上做。 */

/** logit(p) = ln(p / (1 − p))；p = 0 → −Infinity，p = 1 → Infinity。 */
export function logit(p: number): number {
  return Math.log(p / (1 - p));
}

/** logit 的反函數 1 / (1 + e^(−x))；分兩支計算，x 很大或很小時都不會溢位成 NaN。 */
export function sigmoid(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}
