import type { ParseResult } from '../core/types';

/**
 * 規則式解析：把一句地震預言轉成 Claim。規格見 docs/MODELS.md 第 2 節「解析規則」。
 * （空殼：由解析器實作取代，簽名不可變更）
 */
export function parseClaim(text: string, issuedAt: string): ParseResult {
  void text;
  void issuedAt;
  throw new Error('parseClaim: not implemented');
}
