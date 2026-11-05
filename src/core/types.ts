/**
 * 共用契約。每個型別背後的規則寫在 docs/MODELS.md；改這裡就要同步改那份文件。
 *
 * 分層：
 *   data   — public/data/*.json 的形狀（由 tools/build_data.py 產生）
 *   claim  — 一則預言被解析後的結構（src/claim/ 產生、使用者可在確認卡上修改）
 *   result — 各模式的計算結果（src/modes/ 產生；只有數字與代碼，文字由 src/copy/ 負責）
 */

// ================================================================== data

/** catalog.json：中央氣象署地震目錄，ML ≥ 4.0，1995–2025，依時間排序的欄式資料。 */
export interface Catalog {
  version: number;
  /** unix 秒 */
  t: number[];
  lat: number[];
  lon: number[];
  /** 深度（公里） */
  depth: number[];
  /** 中央氣象署近震規模 ML */
  ml: number[];
  /**
   * 預先算好的「震央到縣市的距離」：第 i 組代表地震 event[i] 到縣市 county[i]（meta.counties.items 的索引）
   * 的距離 km[i] 公里（在縣市內為 0）。只收錄 maxKm 以內的組合。
   */
  near: { maxKm: number; event: number[]; county: number[]; km: number[] };
}

/** felt.json：中央氣象署有感地震彙整，全台任一地點的最大震度。 */
export interface FeltList {
  version: number;
  t: number[];
  /** 1–7；5 弱記為 5、5 強記為 5.5、6 弱記為 6、6 強記為 6.5 */
  intensity: number[];
  ml: number[];
}

export interface MapCounty {
  id: string;
  name: string;
  nameEn: string;
  /** 每個環是攤平的 [lon, lat, lon, lat, ...] */
  rings: number[][];
}

export interface MapData {
  version: number;
  counties: MapCounty[];
}

export interface Meta {
  version: number;
  period: { start: string; end: string; timezone: string; startUnix: number; endUnix: number };
  catalog: { count: number; minML: number; magnitudeType: string; source: string; url: string };
  felt: { count: number; note: string; source: string; url: string };
  counties: { items: { id: string; name: string }[]; source: string; url: string };
  licenses: string[];
}

export interface DataBundle {
  catalog: Catalog;
  felt: FeltList;
  map: MapData;
  meta: Meta;
}

// ================================================================== claim

/** 時間窗的來源類型（決定確認卡上怎麼顯示，以及能不能調整天數）。 */
export type TimeKind =
  | 'today'
  | 'tomorrow'
  | 'dayAfterTomorrow'
  | 'thisWeek'
  | 'nextWeek'
  | 'weekend'
  | 'thisMonth'
  | 'nextMonth'
  | 'month' // 「12 月」：指定月份
  | 'thisYear'
  | 'withinDays' // 「N 天內」「N 週內」「N 個月內」等，換算成天數
  | 'date' // 指定某一天
  | 'untilDate' // 「11/15 前」
  | 'dateRange' // 「11/10 到 11/15」
  | 'vague' // 「近期」「最近」「不久」：無法量化，暫用 30 天
  | 'unspecified'; // 完全沒說時間：暫用 30 天

export interface TimeWindow {
  kind: TimeKind;
  /** 'YYYY-MM-DD'（台灣日期），含當天 */
  start: string;
  /** 'YYYY-MM-DD'（台灣日期），含當天 */
  end: string;
  /** end − start + 1 */
  days: number;
}

export type GroupId = 'north' | 'central' | 'south' | 'east' | 'huadong';

export type RegionSpec =
  /** 台灣及近海：北緯 21–26 度、東經 119–123 度（含邊界） */
  | { kind: 'taiwan' }
  /** 一個或多個縣市（meta.counties.items 的 id），加上縣界外推 bufferKm 公里（0–60） */
  | { kind: 'counties'; ids: string[]; bufferKm: number; group?: GroupId };

/** strict：ML ≥ 值；lenient：ML ≥ 值 − 0.5（「M7」時 6.5 也算中，沿用每日報告規則） */
export type Tolerance = 'strict' | 'lenient';

export type SizeSpec =
  | { kind: 'magnitude'; value: number; tolerance: Tolerance }
  /** 全台任一地點最大震度 ≥ value（1、2、3、4、5、5.5、6、6.5、7） */
  | { kind: 'intensity'; value: number }
  /** 沒說多大：改看解讀光譜 */
  | { kind: 'unspecified' };

export interface Claim {
  /** 預言發布日 'YYYY-MM-DD' */
  issuedAt: string;
  time: TimeWindow;
  region: RegionSpec;
  size: SizeSpec;
}

export type FlagCode =
  // 時間
  | 'time-unspecified' // 沒說時間，暫用 30 天
  | 'time-vague' // 「近期」等，暫用 30 天
  | 'time-past' // 指定的日期已經過了（相對於發布日）
  | 'time-clamped' // 天數超過上限，已截斷
  | 'time-multiple' // 提到多個不同的時間（detail = 原文說法，以「、」連接），取最先出現的
  // 地點
  | 'region-unspecified' // 沒說地點，預設台灣及近海
  | 'region-out-of-scope' // 提到國外（detail = 地名）；目前只算台灣
  | 'region-foreign-only' // 只提到國外、沒有任何台灣地名：不能直接算（網頁會先請使用者確認）
  | 'region-offshore' // 提到外海／海域，外推距離改用 60 公里
  | 'region-ambiguous' // 「新竹」「嘉義」同時代表縣與市，兩者都算
  | 'region-town' // 提到鄉鎮，改用它所在的縣市（detail = 「池上→臺東縣」，以「、」連接）
  | 'region-union' // 提到多個地點，全部合在一起算（detail = 原文地名，以「、」連接）
  // 大小
  | 'size-unspecified' // 沒說多大（detail = 原文用詞，例如「大地震」）
  | 'size-level-ambiguous' // 「6 級地震」：不確定是規模還是震度，先當規模
  | 'size-below-min' // 規模門檻低於 4.0，以 4.0 計算（實際命中率只會更高）
  | 'size-intensity-region-ignored' // 震度只有全台最大值，地區設定不適用
  | 'size-multiple' // 提到多個不同的大小（detail = 原文說法，以「、」連接），取最先出現的數值
  | 'size-magnitude-type' // 規模種類不是 ML（detail = Mw、Ms、Mj、mb…），數值直接當 ML 門檻
  | 'size-official-term' // 用了中央氣象署的分級名稱（detail = 原文用詞，例如「中地震」「弱震」）
  | 'size-unsupported-term' // 提到本網站不計算的量（detail = PGA、PGV、加速度…）
  // 其他
  | 'repeat-mentioned'; // 原文提到重複預言（「又說」「每週都說」），請看亂槍打鳥模式

export interface Flag {
  code: FlagCode;
  detail?: string;
}

/** 原文中哪一段被解讀成哪個欄位，用來在確認卡上標示。 */
export interface Span {
  slot: 'time' | 'region' | 'size' | 'modifier';
  start: number;
  end: number;
}

export interface ParseResult {
  claim: Claim;
  flags: Flag[];
  spans: Span[];
}

// ================================================================== results

/** 資料期間：[startDay, endDay) 的台灣日序，years = (endDay − startDay) / 365.25 */
export interface PeriodInfo {
  startDay: number;
  endDay: number;
  years: number;
}

/** 符合條件的地震（規模型取自 catalog，震度型取自 felt）。 */
export interface Qualifying {
  /** 有符合條件地震的日序，排序且不重複 */
  days: number[];
  /** 符合條件的地震筆數（不是天數） */
  nEvents: number;
  /** 規模型的有效門檻 m*；震度型為震度值 */
  threshold: number;
  /** 地區設定是否有套用（震度型為 false） */
  regionApplied: boolean;
}

/** 單純的窗口命中率（M1 的核心，不含區間）。 */
export interface HitRate {
  p: number;
  hits: number;
  windows: number;
  nEvents: number;
}

/** M1 歷史回放 */
export interface ReplayResult extends HitRate {
  ci95: [number, number];
  byYear: { year: number; hits: number; windows: number }[];
  /** 不重疊窗口（從期間第一天起每 T 天一格）是否命中，給日曆熱圖用；第 s 格起點 = startDay + s·T */
  slots: number[];
  windowDays: number;
  threshold: number;
  regionApplied: boolean;
}

/** M2 固定速率（Poisson） */
export interface PoissonResult {
  n: number;
  years: number;
  ratePerYear: number;
  p: number;
  ci95: [number, number];
  windowDays: number;
}

/** M4a 解讀光譜的一項 */
export interface Interpretation {
  id: string;
  size: SizeSpec;
  p: number;
  nEvents: number;
  regionApplied: boolean;
}

export interface SpectrumResult {
  /** 依 p 由大到小排序 */
  items: Interpretation[];
  windowDays: number;
}

/** M4b 敏感度矩陣：p[i][j] = 規模 magnitudes[i]、窗口 windowDays[j] 的命中率 */
export interface MatrixResult {
  magnitudes: number[];
  windowDays: number[];
  p: number[][];
  claimCell: [number, number] | null;
}

/** M4c 灌水成分：把某一個維度收緊之後的對照 */
export interface Factor {
  dimension: 'time' | 'region' | 'size' | 'tolerance';
  /** 原預言的命中率 */
  from: number;
  /** 收緊後的命中率 */
  to: number;
  /** from / to；to = 0 時為 null（收緊後期間內從沒發生過） */
  ratio: number | null;
  /** 收緊後的預言 */
  alt: Claim;
}

/** M8 亂槍打鳥 */
export interface ShotgunRow {
  n: number;
  /** 假設各次獨立：1 − (1 − p)^n */
  independent: number;
  /** 歷史實際：連續 n 個不重疊窗口至少中一次的比例 */
  historical: number;
  expectedHits: number;
  historicalMeanHits: number;
}

export interface ShotgunResult {
  p: number;
  rows: ShotgunRow[];
  /** 一年份（n = max(1, floor(365 / T))）的命中次數分布，索引 k = 0..n */
  yearRun: { n: number; binomial: number[]; historical: number[] };
}

/** M10 要連中幾次才可信 */
export interface BayesParams {
  /** 一開始相信他有能力的機率 */
  prior: number;
  /** 想要達到的把握 */
  target: number;
  /** 假設真有能力的人，每次命中的機率 */
  skill: number;
}

export interface BayesResult extends BayesParams {
  p0: number;
  posteriorAfterOne: number;
  /** null = 再怎麼連中都無法和亂猜區分（skill ≤ p0） */
  hitsNeeded: number | null;
  curve: { k: number; posterior: number }[];
}

/** M12 算命師等級 */
export type LevelId = 'benefactor' | 'worry' | 'coin' | 'something' | 'rare' | 'oracle';

/** M12 生活機率換算 */
export interface Analogy {
  id: string;
  num: number;
  den: number;
  p: number;
}

/** M13 資訊量 */
export interface InformationResult {
  /** −log2(p)；p = 0 時為 Infinity */
  bits: number;
}

/** M14 模型比較 */
export interface CompareResult {
  empirical: number;
  empiricalCi: [number, number];
  poisson: number;
  poissonCi: [number, number];
  /** poisson − empirical */
  diff: number;
}

export type HeadlineSource = 'empirical' | 'poisson-upper' | 'spectrum';

export interface Results {
  claim: Claim;
  period: PeriodInfo;
  /** 計算時產生的提醒（例如門檻低於 4.0、震度不套地區） */
  flags: Flag[];
  headline: {
    /** 主數字；size 未指定時為 null（改看 range） */
    p: number | null;
    range: [number, number] | null;
    source: HeadlineSource;
  };
  replay: ReplayResult | null;
  poisson: PoissonResult | null;
  spectrum: SpectrumResult;
  matrix: MatrixResult;
  factors: Factor[];
  shotgun: ShotgunResult | null;
  bayes: BayesResult | null;
  level: LevelId | null;
  analogy: Analogy | null;
  information: InformationResult | null;
  compare: CompareResult | null;
}
