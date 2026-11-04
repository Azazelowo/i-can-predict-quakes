/**
 * 各模式的計算函式（公開介面）。規格見 docs/MODELS.md 第 1、3 節與附錄 A、B。
 * 匯出的名稱與簽名不可變更：UI、測試、tools/golden.py 的對照都依此呼叫。
 *
 * 結構：
 *   context.ts      期間、窗口長度、地區遮罩、符合條件的地震，以及一次計算內的快取
 *   window.ts       窗口命中 h(d)、連續 n 個窗口的命中次數
 *   replay.ts       M1 歷史回放（含年區塊拔靴法、日曆熱圖）
 *   poisson.ts      M2 固定速率（Garwood 區間）
 *   sensitivity.ts  M4a 解讀光譜、M4b 敏感度矩陣
 *   factors.ts      M4c 灌水成分
 *   shotgun.ts      M8 亂槍打鳥
 *   bayes.ts        M10 要連中幾次才可信
 *   conversions.ts  M12 等級與類比、M13 資訊量、M14 模型比較
 *   compute.ts      computeAll（總覽主數字、旗標）
 * 通用統計（亂數、Poisson、二項、拔靴法）在 src/stats/。
 *
 * 每個單獨匯出的函式都建立自己的 ModeContext（快取只活在一次呼叫裡）；
 * computeAll 讓所有模式共用一個 ModeContext。
 */
import type {
  Analogy,
  BayesParams,
  BayesResult,
  Claim,
  CompareResult,
  DataBundle,
  Factor,
  HitRate,
  InformationResult,
  LevelId,
  MatrixResult,
  PeriodInfo,
  PoissonResult,
  Qualifying,
  RegionSpec,
  ReplayResult,
  Results,
  ShotgunResult,
  SizeSpec,
  SpectrumResult,
} from '../core/types';
import { garwoodInterval } from '../stats/poisson';
import { bayesOf } from './bayes';
import { computeAllWith } from './compute';
import { buildRegionMask, isSpecified, ModeContext, periodOf, windowLengthFor } from './context';
import { analogyOf, compareOf, informationOf, levelOf } from './conversions';
import { factorsOf } from './factors';
import { poissonOf } from './poisson';
import { replayOf } from './replay';
import { matrixOf, spectrumOf } from './sensitivity';
import { shotgunOf } from './shotgun';
import { computeWindowHits } from './window';

/** 資料期間（台灣日序）與年數 */
export function periodInfo(data: DataBundle): PeriodInfo {
  return periodOf(data);
}

/** catalog 每筆地震是否在範圍內（1 = 在範圍內）；地圖畫點也用它。未知的縣市代碼會丟出錯誤。 */
export function regionMask(region: RegionSpec, data: DataBundle): Uint8Array {
  return buildRegionMask(region, data);
}

/** 符合「地區 + 大小」的地震日（size 不可為 unspecified，否則丟出錯誤） */
export function qualifying(region: RegionSpec, size: SizeSpec, data: DataBundle): Qualifying {
  const q = new ModeContext(data).qualifying(region, size);
  return { ...q, days: [...q.days] };
}

/**
 * 每個起點 d（從 startDay 到 endDay − T）的窗口是否命中；索引 = d − startDay。
 * windowDays 和其他地方一樣先夾成 T = max(1, min(windowDays, endDay − startDay))。
 */
export function windowHits(days: readonly number[], period: PeriodInfo, windowDays: number): Uint8Array {
  const T = windowLengthFor(windowDays, period);
  return computeWindowHits(days, period.startDay, period.endDay - period.startDay, T);
}

/** 窗口命中率（M1 核心，不含區間）；windowDays 先夾在 1..L */
export function hitRate(region: RegionSpec, size: SizeSpec, windowDays: number, data: DataBundle): HitRate {
  const ctx = new ModeContext(data);
  const st = ctx.windowStats(region, size, ctx.windowLength(windowDays));
  return { p: st.p, hits: st.hitCount, windows: st.windows, nEvents: st.qualifying.nEvents };
}

/** Garwood 精確 95% 區間（Poisson 計數 n 的期望值 μ） */
export function poissonCountCI(n: number): [number, number] {
  return garwoodInterval(n);
}

/** M1 歷史回放（size 未指定時回傳 null） */
export function replay(claim: Claim, data: DataBundle): ReplayResult | null {
  return isSpecified(claim) ? replayOf(new ModeContext(data), claim) : null;
}

/** M2 固定速率（size 未指定時回傳 null） */
export function poisson(claim: Claim, data: DataBundle): PoissonResult | null {
  return isSpecified(claim) ? poissonOf(new ModeContext(data), claim) : null;
}

/** M4a 解讀光譜 */
export function spectrum(claim: Claim, data: DataBundle): SpectrumResult {
  return spectrumOf(new ModeContext(data), claim);
}

/** M4b 敏感度矩陣 */
export function matrix(claim: Claim, data: DataBundle): MatrixResult {
  return matrixOf(new ModeContext(data), claim);
}

/** M4c 灌水成分（size 未指定時為空陣列） */
export function factors(claim: Claim, data: DataBundle): Factor[] {
  return isSpecified(claim) ? factorsOf(new ModeContext(data), claim) : [];
}

/** M8 亂槍打鳥：p 是單次預言的命中率（通常是總覽主數字）。size 未指定時丟出錯誤。 */
export function shotgun(claim: Claim, data: DataBundle, p: number): ShotgunResult {
  if (!isSpecified(claim)) throw new RangeError('亂槍打鳥需要指定大小（規模或震度）');
  return shotgunOf(new ModeContext(data), claim, p);
}

/** M10 要連中幾次才可信 */
export function bayes(p0: number, params?: Partial<BayesParams>): BayesResult {
  return bayesOf(p0, params);
}

/** M12 算命師等級 */
export function level(p: number): LevelId {
  return levelOf(p);
}

/** M12 生活機率換算 */
export function analogy(p: number): Analogy {
  return analogyOf(p);
}

/** M13 資訊量 */
export function information(p: number): InformationResult {
  return informationOf(p);
}

/** M14 模型比較 */
export function compare(rep: ReplayResult, poi: PoissonResult): CompareResult {
  return compareOf(rep, poi);
}

/** 一次算完總覽需要的全部結果 */
export function computeAll(claim: Claim, data: DataBundle): Results {
  return computeAllWith(new ModeContext(data), claim);
}
