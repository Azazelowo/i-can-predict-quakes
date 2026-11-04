/**
 * M4a 解讀光譜、M4b 敏感度矩陣【事實】（docs/MODELS.md 第 3 節）。
 *
 * 同一句話換個解讀，M1 的 p̂ 可以差兩百多倍；這兩個模式把「換個說法」攤開來比。
 */
import { MATRIX_MAGNITUDES, MATRIX_WINDOWS, SPECTRUM } from '../core/constants';
import type { Claim, Interpretation, MatrixResult, SpectrumResult } from '../core/types';
import { magnitudeThreshold, type ModeContext } from './context';

/**
 * 固定 11 種解讀（SPECTRUM），每項都用 M1 的 p̂（同一個 T）。
 * 震度型一律是全台最大震度（regionApplied = false）；規模型套用預言的地區。
 * 依 p 由大到小排序，同值保持 SPECTRUM 的原順序（Array#sort 是穩定排序）。
 */
export function spectrumOf(ctx: ModeContext, claim: Claim): SpectrumResult {
  const T = ctx.windowLength(claim.time.days);
  const items: Interpretation[] = SPECTRUM.map(({ id, size }) => {
    const st = ctx.windowStats(claim.region, size, T);
    return {
      id,
      size: { ...size },
      p: st.p,
      nEvents: st.qualifying.nEvents,
      regionApplied: st.qualifying.regionApplied,
    };
  });
  items.sort((a, b) => b.p - a.p);
  return { items, windowDays: T };
}

/**
 * 規模（嚴格）× 窗口的 M1 p̂，地區用預言的地區。
 * claimCell：預言是規模型、有效門檻 m* 與 T 都在清單內時為 [i, j]，否則 null。
 * 【規格未提】欄位標籤是 MATRIX_WINDOWS 本身；計算時窗口和其他地方一樣夾在 1..L
 * （真實資料 L = 11,323 天，不會發生；只影響期間短於 365 天的測試資料）。
 */
export function matrixOf(ctx: ModeContext, claim: Claim): MatrixResult {
  const magnitudes: number[] = [...MATRIX_MAGNITUDES];
  const windowDays: number[] = [...MATRIX_WINDOWS];
  const p = magnitudes.map((value) =>
    windowDays.map(
      (w) =>
        ctx.windowStats(claim.region, { kind: 'magnitude', value, tolerance: 'strict' }, ctx.windowLength(w))
          .p,
    ),
  );
  let claimCell: [number, number] | null = null;
  if (claim.size.kind === 'magnitude') {
    const i = magnitudes.indexOf(magnitudeThreshold(claim.size).effective);
    const j = windowDays.indexOf(ctx.windowLength(claim.time.days));
    if (i >= 0 && j >= 0) claimCell = [i, j];
  }
  return { magnitudes, windowDays, p, claimCell };
}
