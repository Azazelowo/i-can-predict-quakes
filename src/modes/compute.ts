/**
 * computeAll：一次算完總覽需要的全部結果（docs/MODELS.md 第 3 節「總覽主數字」）。
 *
 * 所有模式共用同一個 ModeContext，所以光譜、矩陣、灌水成分重複用到的
 * 「地區 × 大小」只算一次。
 */
import { MIN_ML } from '../core/constants';
import type { Claim, Flag, FlagCode, Results } from '../core/types';
import { bayesOf } from './bayes';
import { isSpecified, magnitudeThreshold, ModeContext } from './context';
import { analogyOf, compareOf, informationOf, levelOf } from './conversions';
import { factorsOf } from './factors';
import { poissonOf } from './poisson';
import { replayOf } from './replay';
import { matrixOf, spectrumOf } from './sensitivity';
import { shotgunOf } from './shotgun';

/**
 * 計算時的旗標（依此順序、不重複）：
 * 1. size-below-min：規模型的門檻（值或值 − 0.5）低於 4.0、被夾到 4.0
 * 2. size-intensity-region-ignored：震度型且地區不是 taiwan
 */
export function resultFlags(claim: Claim): Flag[] {
  const codes: FlagCode[] = [];
  if (claim.size.kind === 'magnitude' && magnitudeThreshold(claim.size).raw < MIN_ML) {
    codes.push('size-below-min');
  }
  if (claim.size.kind === 'intensity' && claim.region.kind !== 'taiwan') {
    codes.push('size-intensity-region-ignored');
  }
  return [...new Set(codes)].map((code) => ({ code }));
}

export function computeAllWith(ctx: ModeContext, claim: Claim): Results {
  const flags = resultFlags(claim);
  const spectrum = spectrumOf(ctx, claim);
  const matrix = matrixOf(ctx, claim);

  if (!isSpecified(claim)) {
    // 大小沒說：不給單一數字，給光譜的範圍；依賴主數字的模式都是 null
    const ps = spectrum.items.map((item) => item.p);
    return {
      claim,
      period: { ...ctx.period },
      flags,
      headline: { p: null, range: [Math.min(...ps), Math.max(...ps)], source: 'spectrum' },
      replay: null,
      poisson: null,
      spectrum,
      matrix,
      factors: [],
      shotgun: null,
      bayes: null,
      level: null,
      analogy: null,
      information: null,
      compare: null,
    };
  }

  const replay = replayOf(ctx, claim);
  const poisson = poissonOf(ctx, claim);
  // 期間內發生過 → M1 的 p̂；從沒發生過 → M2 的 95% 上限（n = 0 時 μ_U = −ln 0.025）
  const empirical = replay.nEvents > 0;
  const p = empirical ? replay.p : poisson.ci95[1];
  return {
    claim,
    period: { ...ctx.period },
    flags,
    // 【規格未提】有單一主數字時 range 為 null（區間請看 replay.ci95 / poisson.ci95）
    headline: { p, range: null, source: empirical ? 'empirical' : 'poisson-upper' },
    replay,
    poisson,
    spectrum,
    matrix,
    factors: factorsOf(ctx, claim),
    shotgun: shotgunOf(ctx, claim, p),
    bayes: bayesOf(p),
    level: levelOf(p),
    analogy: analogyOf(p),
    information: informationOf(p),
    compare: compareOf(replay, poisson),
  };
}
