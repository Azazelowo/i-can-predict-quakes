/**
 * 預言用的詞（size-unspecified 的原文用詞，例如「大地震」「強震」）有中央氣象署的定義時，
 * 解讀光譜上對應的項目 id（src/core/terms.ts 的 spectrumId）；沒有時為 null。總覽和 M4 共用。
 */
import type { AppState } from '../app/state';
import { officialTerm } from '../core/terms';

export function officialSpectrumId(state: AppState): string | null {
  const word = state.notes.size.find((f) => f.code === 'size-unspecified')?.detail ?? '';
  return officialTerm(word)?.spectrumId ?? null;
}
