/**
 * 解析主流程（docs/MODELS.md 第 2 節）：前處理 → 時間、地點、大小各自比對 → 組成 Claim、旗標、span。
 *
 * 這裡不接住例外：測試直接呼叫 parseClaimStrict，內部錯誤才不會被 parse.ts 的保底結果藏起來。
 */
import type { Flag, ParseResult, Span } from '../core/types';
import { normalize } from './normalize';
import { findRegion } from './region';
import { findSize } from './size';
import { findTime } from './time';

/** 原文提到重複預言（規格 2.5；「周」已正規化成「週」） */
const REPEAT_RE = /又說|再次|再度|每週都|每天都|一直說|每次都|重複/;

const SLOT_ORDER: readonly Span['slot'][] = ['time', 'region', 'size', 'modifier'];

export function parseClaimStrict(text: string, issuedAt: string): ParseResult {
  const norm = normalize(text);
  const time = findTime(norm, text, issuedAt);
  const region = findRegion(norm, text);
  const size = findSize(norm, text);

  // 旗標順序與 FlagCode 的定義順序相同：時間、地點、大小、其他
  const flags: Flag[] = [...time.flags, ...region.flags, ...size.flags];
  if (REPEAT_RE.test(norm)) flags.push({ code: 'repeat-mentioned' });

  const spans = [...time.spans, ...region.spans, ...size.spans].sort(
    (a, b) => a.start - b.start || a.end - b.end || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
  );

  return {
    claim: { issuedAt, time: time.time, region: region.region, size: size.size },
    flags,
    spans,
  };
}
