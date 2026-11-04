/**
 * M2 固定速率（Poisson）【模型】（docs/MODELS.md 第 3 節）。
 *
 * 假設地震以平均速率、彼此獨立地發生：λ = n / Y，p = 1 − exp(−λ · T / 365.25)。
 * 地震其實成群發生，所以短窗口時 M2 通常高於 M1；並列兩者就是為了呈現這個差距。
 */
import type { PoissonResult } from '../core/types';
import { garwoodInterval, poissonAtLeastOne } from '../stats/poisson';
import type { ModeContext, SpecifiedClaim } from './context';

export function poissonOf(ctx: ModeContext, claim: SpecifiedClaim): PoissonResult {
  const T = ctx.windowLength(claim.time.days);
  const n = ctx.qualifying(claim.region, claim.size).nEvents;
  const years = ctx.period.years;
  const ratePerYear = n / years;
  // μ 的 Garwood 精確區間 → λ 區間 = μ / Y → 再代入 p
  const [muLower, muUpper] = garwoodInterval(n);
  return {
    n,
    years,
    ratePerYear,
    p: poissonAtLeastOne(ratePerYear, T),
    ci95: [poissonAtLeastOne(muLower / years, T), poissonAtLeastOne(muUpper / years, T)],
    windowDays: T,
  };
}
