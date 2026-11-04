/**
 * M12 算命師等級與生活換算【假設】、M13 資訊量【事實】、M14 模型比較（docs/MODELS.md 第 3 節）。
 * 只回傳代碼與數字；文字在 src/copy/。
 */
import { ANALOGIES, LEVELS } from '../core/constants';
import type {
  Analogy,
  CompareResult,
  InformationResult,
  LevelId,
  PoissonResult,
  ReplayResult,
} from '../core/types';
import { logit } from '../stats/logit';

/** logit 前把 p 夾在 [1e−9, 1 − 1e−9]，避免 p = 0 或 1 時變成 ±Infinity。 */
const ANALOGY_CLAMP = 1e-9;

/**
 * 由上往下找第一個 p ≥ 下限的等級。
 * 【規格未提】p 不是 [0, 1] 內的數（負數、NaN）時回傳最後一級（oracle）。
 */
export function levelOf(p: number): LevelId {
  for (const entry of LEVELS) if (p >= entry.min) return entry.id;
  return LEVELS[LEVELS.length - 1]!.id;
}

/**
 * 從清單中選 |logit(p) − logit(a.p)| 最小者，同距離取清單中較前者（嚴格小於才換）。
 * 清單當參數傳入是為了能單獨測試平手規則；網站一律用 ANALOGIES。
 * 【規格未提】p 是 NaN 時所有距離都是 NaN，視同平手，回傳第一項。
 */
export function nearestAnalogy(p: number, list: readonly Analogy[]): Analogy {
  const first = list[0];
  if (!first) throw new RangeError('類比清單不可為空');
  const clamped = Math.min(Math.max(p, ANALOGY_CLAMP), 1 - ANALOGY_CLAMP);
  const target = logit(clamped);
  let best = first;
  let bestDistance = Math.abs(target - logit(first.p));
  for (let i = 1; i < list.length; i++) {
    const candidate = list[i]!;
    const distance = Math.abs(target - logit(candidate.p));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return { ...best };
}

export function analogyOf(p: number): Analogy {
  return nearestAnalogy(p, ANALOGIES);
}

/** bits = −log2(p)；p = 0 時為 Infinity。加 0 是為了 p = 1 時回傳 +0 而不是 −0。 */
export function informationOf(p: number): InformationResult {
  return { bits: p === 0 ? Number.POSITIVE_INFINITY : -Math.log2(p) + 0 };
}

/** 並列 M1 與 M2（含區間），diff = p_M2 − p̂_M1。 */
export function compareOf(rep: ReplayResult, poi: PoissonResult): CompareResult {
  return {
    empirical: rep.p,
    empiricalCi: [rep.ci95[0], rep.ci95[1]],
    poisson: poi.p,
    poissonCi: [poi.ci95[0], poi.ci95[1]],
    diff: poi.p - rep.p,
  };
}
