/**
 * M1 歷史回放【事實】（docs/MODELS.md 第 3 節）。
 *
 * 把過去每一天都當成「預言發布後窗口的第一天」，數有幾成的窗口真的發生。
 * 不需要任何模型假設，地震的群聚性也自動包含在內，所以網站的主數字用它。
 */
import { BOOTSTRAP } from '../core/constants';
import { firstDayOfMonth, yearOfDay } from '../core/time';
import type { PeriodInfo, ReplayResult } from '../core/types';
import { blockBootstrapRatio } from '../stats/bootstrap';
import type { ModeContext, SpecifiedClaim } from './context';

/**
 * 每個起點 d 歸到它所在的西元年（台灣日期），統計 hits_y 與 windows_y。
 * 起點是連續的一段日子，所以逐年切區段即可；只保留 windows_y > 0 的年份（依年份排序）。
 */
export function yearBlocks(
  hits: Uint8Array,
  period: PeriodInfo,
): { year: number; hits: number; windows: number }[] {
  const N = hits.length;
  const out: { year: number; hits: number; windows: number }[] = [];
  if (N === 0) return out;
  const firstStart = period.startDay;
  const lastStart = period.startDay + N - 1;
  for (let year = yearOfDay(firstStart); year <= yearOfDay(lastStart); year++) {
    const from = Math.max(firstStart, firstDayOfMonth(year, 1)) - firstStart;
    const to = Math.min(lastStart + 1, firstDayOfMonth(year + 1, 1)) - firstStart; // 不含
    let h = 0;
    for (let i = from; i < to; i++) h += hits[i]!;
    if (to > from) out.push({ year, hits: h, windows: to - from });
  }
  return out;
}

/**
 * 日曆熱圖：從 startDay 起每 T 天一格（不重疊），第 s 格 = h(startDay + s·T)，
 * 直到 startDay + (s+1)·T > endDay 為止，共 floor(L / T) 格。
 */
export function nonOverlappingSlots(hits: Uint8Array, L: number, T: number): number[] {
  const count = Math.floor(L / T);
  const slots: number[] = new Array<number>(count);
  for (let s = 0; s < count; s++) slots[s] = hits[s * T]!;
  return slots;
}

export function replayOf(ctx: ModeContext, claim: SpecifiedClaim): ReplayResult {
  const T = ctx.windowLength(claim.time.days);
  const st = ctx.windowStats(claim.region, claim.size, T);
  const byYear = yearBlocks(st.hits, ctx.period);
  // 每次呼叫都用固定種子重新建立亂數產生器：同一則預言永遠得到同一個區間
  const { ci95 } = blockBootstrapRatio(
    byYear.map((b) => b.hits),
    byYear.map((b) => b.windows),
    BOOTSTRAP.replicates,
    BOOTSTRAP.seed,
  );
  return {
    p: st.p,
    hits: st.hitCount,
    windows: st.windows,
    nEvents: st.qualifying.nEvents,
    ci95,
    byYear,
    slots: nonOverlappingSlots(st.hits, ctx.length, T),
    windowDays: T,
    threshold: st.qualifying.threshold,
    regionApplied: st.qualifying.regionApplied,
  };
}
