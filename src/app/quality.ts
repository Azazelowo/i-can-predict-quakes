/**
 * 解析結果的把關：哪些情況要先請使用者確認，不直接給一個數字（純函式，可在 Node 測試）。
 *
 * 為什麼：解析器一定會產生一個 Claim（沒說的部分用預設值補），所以就算輸入是亂打的、
 * 或說的是歐洲，也會算出一個看起來很精確的命中率。對一個講求「誠實」的網站，這比算錯還糟。
 *
 * - foreign-only：只提到國外（region-foreign-only）。台灣的資料算不出國外的命中率。
 * - not-quake：原文裡找不到任何和地震有關的字，多半是貼錯或在測試。
 * - conflicting：說法互相矛盾：3 種以上不同的大小，或同時有 2 種以上的大小和時間。
 *
 * 使用者按「照目前的設定算算看」，或在確認卡改了任何一項，就算確認過了（由 controller 處理）。
 */
import type { Flag, FlagCode, ParseResult } from '../core/types';

export type GateKind = 'foreign-only' | 'not-quake' | 'conflicting';

/**
 * 和地震有關的字：「震」涵蓋地震、強震、震度、震央；另外收地牛、搖晃、規模、芮氏、有感，
 * 以及「M 6」「Mw5」這類寫法（全形字母與數字也算）。
 */
const QUAKE_WORD_RE = /震|地牛|搖|晃|規模|芮氏|有感|[MmＭｍ]\s*[LlWwSsJjBbＬｌＷｗＳｓＪｊＢｂ]?\s*[0-9０-９]/;

/** 某個旗標的 detail 列了幾項（以「、」分隔）；沒有這個旗標時為 0 */
export function detailCount(flags: readonly Flag[], code: FlagCode): number {
  const flag = flags.find((f) => f.code === code);
  if (!flag) return 0;
  const detail = (flag.detail ?? '').trim();
  return detail ? detail.split('、').length : 1;
}

export function assessParse(text: string, parse: ParseResult): GateKind | null {
  if (parse.flags.some((f) => f.code === 'region-foreign-only')) return 'foreign-only';
  if (!QUAKE_WORD_RE.test(text)) return 'not-quake';
  const sizes = detailCount(parse.flags, 'size-multiple');
  const times = detailCount(parse.flags, 'time-multiple');
  if (sizes >= 3 || (sizes >= 2 && times >= 2)) return 'conflicting';
  return null;
}
