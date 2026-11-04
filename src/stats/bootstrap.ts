/**
 * 區塊拔靴法（M1 歷史回放的 95% 區間，docs/MODELS.md 第 3 節）。
 *
 * 為什麼要分區塊：相鄰的窗口彼此重疊、地震又成群發生，逐日的命中並不獨立，
 * 直接用二項分布會得到過窄的區間。以「年」為區塊整塊重抽，保留年內的相關性。
 */
import { mulberry32 } from './random';

export interface BootstrapResult {
  /** [p*[floor(0.025·B)], p*[ceil(0.975·B) − 1]]（排序後、0 起算） */
  ci95: [number, number];
  /** 全部 B 個重抽結果，由小到大排序 */
  replicates: Float64Array;
}

/**
 * 每個區塊 i 有 hits[i] 與 windows[i]（windows[i] > 0）。重複 B 次：
 * 依序抽 K 次 i = floor(rng() × K)（可重複），p*_b = Σ hits_i / Σ windows_i。
 * 亂數產生器每次呼叫都用 seed 重新建立，所以結果可重現。
 */
export function blockBootstrapRatio(
  hits: readonly number[],
  windows: readonly number[],
  replicates: number,
  seed: number,
): BootstrapResult {
  const K = hits.length;
  if (K === 0 || windows.length !== K) {
    throw new RangeError('區塊拔靴法至少需要一個區塊，且 hits 與 windows 長度要相同');
  }
  if (!Number.isInteger(replicates) || replicates < 1) {
    throw new RangeError(`重抽次數必須是正整數：${replicates}`);
  }
  const rng = mulberry32(seed);
  const samples = new Float64Array(replicates);
  for (let b = 0; b < replicates; b++) {
    let sumHits = 0;
    let sumWindows = 0;
    for (let j = 0; j < K; j++) {
      const i = Math.floor(rng() * K);
      sumHits += hits[i]!;
      sumWindows += windows[i]!;
    }
    samples[b] = sumHits / sumWindows;
  }
  samples.sort(); // TypedArray#sort 是數值排序
  const lo = samples[Math.floor(0.025 * replicates)]!;
  const hi = samples[Math.ceil(0.975 * replicates) - 1]!;
  return { ci95: [lo, hi], replicates: samples };
}
