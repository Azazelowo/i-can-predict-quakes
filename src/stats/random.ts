/**
 * 可重現的亂數產生器：mulberry32（docs/MODELS.md 附錄 A）。
 *
 * 為什麼自己寫：Math.random() 無法設定種子，拔靴法的區間每次重新整理都會跳動，
 * 也無法和 tools/golden.py 的獨立實作逐位比對。mulberry32 只用 32 位元整數運算，
 * 任何語言都能做出完全相同的序列。
 */

/** 回傳一個產生 [0, 1) 均勻亂數的函式；同一個種子永遠得到同一個序列。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    let t = (a = (a + 0x6d2b79f5) >>> 0); // 32-bit unsigned addition
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
