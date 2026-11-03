/**
 * 計算用的固定參數。每個值的理由寫在 docs/MODELS.md；tools/golden.py 也使用相同的值。
 */
import type { Analogy, LevelId, SizeSpec } from './types';

/** 台灣及近海：北緯 21–26 度、東經 119–123 度（含邊界），與試算、B3 基準模型相同 */
export const TAIWAN_BOX = { latMin: 21, latMax: 26, lonMin: 119, lonMax: 123 } as const;

/** 資料只收 ML ≥ 4.0；更低的門檻以 4.0 計算 */
export const MIN_ML = 4.0;

/** 縣界外推距離：上限（= catalog.near.maxKm）、單一縣市或分區的預設、提到外海時的值 */
export const MAX_BUFFER_KM = 60;
export const DEFAULT_BUFFER_KM = 30;
export const OFFSHORE_BUFFER_KM = 60;
export const BUFFER_CHOICES_KM = [0, 10, 20, 30, 40, 50, 60] as const;

/** 時間窗：模糊或沒說時間時的暫用天數；天數上限 */
export const VAGUE_WINDOW_DAYS = 30;
export const MAX_WINDOW_DAYS = 3650;

/** M1 年區塊拔靴法 */
export const BOOTSTRAP = { replicates: 1000, seed: 20261104 } as const;

/** 震度可選的值（5.5 = 5 強、6.5 = 6 強） */
export const INTENSITY_VALUES = [1, 2, 3, 4, 5, 5.5, 6, 6.5, 7] as const;

/** M4a 解讀光譜：固定 11 種解讀。規模用嚴格判定；震度一律是全台最大震度。 */
export const SPECTRUM: readonly { id: string; size: SizeSpec }[] = [
  { id: 'felt', size: { kind: 'intensity', value: 1 } },
  { id: 'i3', size: { kind: 'intensity', value: 3 } },
  { id: 'i4', size: { kind: 'intensity', value: 4 } },
  { id: 'i5', size: { kind: 'intensity', value: 5 } },
  { id: 'i6', size: { kind: 'intensity', value: 6 } },
  { id: 'm4.5', size: { kind: 'magnitude', value: 4.5, tolerance: 'strict' } },
  { id: 'm5', size: { kind: 'magnitude', value: 5.0, tolerance: 'strict' } },
  { id: 'm5.5', size: { kind: 'magnitude', value: 5.5, tolerance: 'strict' } },
  { id: 'm6', size: { kind: 'magnitude', value: 6.0, tolerance: 'strict' } },
  { id: 'm6.5', size: { kind: 'magnitude', value: 6.5, tolerance: 'strict' } },
  { id: 'm7', size: { kind: 'magnitude', value: 7.0, tolerance: 'strict' } },
];

/** M4b 敏感度矩陣的兩個軸 */
export const MATRIX_MAGNITUDES = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0] as const;
export const MATRIX_WINDOWS = [1, 3, 7, 14, 30, 90, 365] as const;

/** M8 亂槍打鳥：比較的預言次數（另外加上「一年份」） */
export const SHOTGUN_NS = [1, 4, 12, 52] as const;

/** M10 預設：先驗 1%、目標 95% 把握、真有能力的人每次都中 */
export const BAYES_DEFAULTS = { prior: 0.01, target: 0.95, skill: 1.0 } as const;

/** M12 算命師等級：p ≥ min 就是該等級（由上往下找第一個符合的） */
export const LEVELS: readonly { id: LevelId; min: number }[] = [
  { id: 'benefactor', min: 0.9 },
  { id: 'worry', min: 0.5 },
  { id: 'coin', min: 0.2 },
  { id: 'something', min: 0.05 },
  { id: 'rare', min: 0.01 },
  { id: 'oracle', min: 0 },
];

/** M12 生活機率換算：全部是精確機率（文字在 src/copy/zh-TW.ts） */
export const ANALOGIES: readonly Analogy[] = [
  { id: 'not-ten-heads', num: 1023, den: 1024, p: 1023 / 1024 },
  { id: 'not-spade-ace', num: 51, den: 52, p: 51 / 52 },
  { id: 'not-double-six', num: 35, den: 36, p: 35 / 36 },
  { id: 'not-six', num: 5, den: 6, p: 5 / 6 },
  { id: 'one-head-in-two', num: 3, den: 4, p: 3 / 4 },
  { id: 'one-to-four', num: 2, den: 3, p: 2 / 3 },
  { id: 'coin', num: 1, den: 2, p: 1 / 2 },
  { id: 'one-or-two', num: 1, den: 3, p: 1 / 3 },
  { id: 'heart', num: 1, den: 4, p: 1 / 4 },
  { id: 'six', num: 1, den: 6, p: 1 / 6 },
  { id: 'birth-month', num: 1, den: 12, p: 1 / 12 },
  { id: 'double-six', num: 1, den: 36, p: 1 / 36 },
  { id: 'card', num: 1, den: 52, p: 1 / 52 },
  { id: 'birthday', num: 1, den: 365, p: 1 / 365 },
  { id: 'ten-heads', num: 1, den: 1024, p: 1 / 1024 },
  { id: 'twenty-heads', num: 1, den: 1048576, p: 1 / 1048576 },
];
