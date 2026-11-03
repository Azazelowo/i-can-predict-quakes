/**
 * 各模式的計算函式。規格見 docs/MODELS.md 第 3 節。
 * （空殼：由模式實作取代；匯出的名稱與簽名不可變更，UI 與測試都依此呼叫）
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

const todo = (name: string): never => {
  throw new Error(`${name}: not implemented`);
};

/** 資料期間（台灣日序）與年數 */
export function periodInfo(data: DataBundle): PeriodInfo {
  void data;
  return todo('periodInfo');
}

/** catalog 每筆地震是否在範圍內（1 = 在範圍內）；地圖畫點也用它 */
export function regionMask(region: RegionSpec, data: DataBundle): Uint8Array {
  void region; void data;
  return todo('regionMask');
}

/** 符合「地區 + 大小」的地震日（size 不可為 unspecified） */
export function qualifying(region: RegionSpec, size: SizeSpec, data: DataBundle): Qualifying {
  void region; void size; void data;
  return todo('qualifying');
}

/** 每個起點 d（從 startDay 到 endDay − T）的窗口是否命中；索引 = d − startDay */
export function windowHits(days: readonly number[], period: PeriodInfo, windowDays: number): Uint8Array {
  void days; void period; void windowDays;
  return todo('windowHits');
}

/** 窗口命中率（M1 核心，不含區間） */
export function hitRate(region: RegionSpec, size: SizeSpec, windowDays: number, data: DataBundle): HitRate {
  void region; void size; void windowDays; void data;
  return todo('hitRate');
}

/** Garwood 精確 95% 區間（Poisson 計數 n 的期望值 μ） */
export function poissonCountCI(n: number): [number, number] {
  void n;
  return todo('poissonCountCI');
}

/** M1 歷史回放（size 未指定時回傳 null） */
export function replay(claim: Claim, data: DataBundle): ReplayResult | null {
  void claim; void data;
  return todo('replay');
}

/** M2 固定速率（size 未指定時回傳 null） */
export function poisson(claim: Claim, data: DataBundle): PoissonResult | null {
  void claim; void data;
  return todo('poisson');
}

/** M4a 解讀光譜 */
export function spectrum(claim: Claim, data: DataBundle): SpectrumResult {
  void claim; void data;
  return todo('spectrum');
}

/** M4b 敏感度矩陣 */
export function matrix(claim: Claim, data: DataBundle): MatrixResult {
  void claim; void data;
  return todo('matrix');
}

/** M4c 灌水成分 */
export function factors(claim: Claim, data: DataBundle): Factor[] {
  void claim; void data;
  return todo('factors');
}

/** M8 亂槍打鳥：p 是單次預言的命中率（通常是總覽主數字） */
export function shotgun(claim: Claim, data: DataBundle, p: number): ShotgunResult {
  void claim; void data; void p;
  return todo('shotgun');
}

/** M10 要連中幾次才可信 */
export function bayes(p0: number, params?: Partial<BayesParams>): BayesResult {
  void p0; void params;
  return todo('bayes');
}

/** M12 算命師等級 */
export function level(p: number): LevelId {
  void p;
  return todo('level');
}

/** M12 生活機率換算 */
export function analogy(p: number): Analogy {
  void p;
  return todo('analogy');
}

/** M13 資訊量 */
export function information(p: number): InformationResult {
  void p;
  return todo('information');
}

/** M14 模型比較 */
export function compare(rep: ReplayResult, poi: PoissonResult): CompareResult {
  void rep; void poi;
  return todo('compare');
}

/** 一次算完總覽需要的全部結果 */
export function computeAll(claim: Claim, data: DataBundle): Results {
  void claim; void data;
  return todo('computeAll');
}
