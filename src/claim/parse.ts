import type { ParseResult, TimeKind, TimeWindow } from '../core/types';

/**
 * 規則式解析：把一句地震預言轉成 Claim。規格見 docs/MODELS.md 第 2 節「解析規則」。
 * （空殼：由解析器實作取代，簽名不可變更）
 */
export function parseClaim(text: string, issuedAt: string): ParseResult {
  void text;
  void issuedAt;
  throw new Error('parseClaim: not implemented');
}

/**
 * 依時間類型與發布日算出時間窗（docs/MODELS.md 2.2 的表格）。解析器與確認卡共用，規則只寫一次。
 * - today、tomorrow、dayAfterTomorrow、thisWeek、nextWeek、weekend、thisMonth、nextMonth、thisYear：只看 issuedAt。
 * - withinDays、vague、unspecified：[issuedAt, issuedAt + days − 1]，days = opts.days ?? 30，夾在 1–3650。
 * - date、untilDate、dateRange、month：用 opts.start、opts.end（'YYYY-MM-DD'，必填；untilDate 的 start 為 issuedAt）。
 * （空殼：由解析器實作取代，簽名不可變更）
 */
export function windowFor(
  kind: TimeKind,
  issuedAt: string,
  opts: { days?: number; start?: string; end?: string } = {},
): TimeWindow {
  void kind;
  void issuedAt;
  void opts;
  throw new Error('windowFor: not implemented');
}
