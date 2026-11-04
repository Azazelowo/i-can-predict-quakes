import type { ParseResult, TimeKind, TimeWindow } from '../core/types';
import { parseClaimStrict } from './core';
import { computeWindow } from './window';

/**
 * 規則式解析：把一句地震預言轉成 Claim。規格見 docs/MODELS.md 第 2 節「解析規則」。
 *
 * 任何字串都不會丟出錯誤（issuedAt 必須是合法的 YYYY-MM-DD）。萬一解析器內部出錯，
 * 回傳「什麼都沒說」的保底結果（時間、地點、大小都未指定），使用者仍可在確認卡上自己填。
 * 所有 span 都是原文的 UTF-16 索引 [start, end)。
 */
export function parseClaim(text: string, issuedAt: string): ParseResult {
  const input = typeof text === 'string' ? text : '';
  try {
    return parseClaimStrict(input, issuedAt);
  } catch {
    return {
      claim: {
        issuedAt,
        time: computeWindow('unspecified', issuedAt),
        region: { kind: 'taiwan' },
        size: { kind: 'unspecified' },
      },
      flags: [
        { code: 'time-unspecified' },
        { code: 'region-unspecified' },
        { code: 'size-unspecified', detail: '' },
      ],
      spans: [],
    };
  }
}

/**
 * 依時間類型與發布日算出時間窗（docs/MODELS.md 2.2 的表格）。解析器與確認卡共用，規則只寫一次。
 * - today、tomorrow、dayAfterTomorrow、thisWeek、nextWeek、weekend、thisMonth、nextMonth、thisYear：只看 issuedAt。
 * - withinDays、vague、unspecified：[issuedAt, issuedAt + days − 1]，days = opts.days ?? 30，夾在 1–3650。
 * - date、untilDate、dateRange、month：用 opts.start、opts.end（'YYYY-MM-DD'，必填；untilDate 的 start 為 issuedAt）。
 *
 * 細節（src/claim/window.ts）：日期型超過 3650 天時截斷結束日；結束日早於開始日時照樣回傳（days ≤ 0），
 * 由呼叫端回報順序錯誤；缺少必要的日期或日期格式不對時丟出錯誤。
 */
export function windowFor(
  kind: TimeKind,
  issuedAt: string,
  opts: { days?: number; start?: string; end?: string } = {},
): TimeWindow {
  return computeWindow(kind, issuedAt, opts);
}
