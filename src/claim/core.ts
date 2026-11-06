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

/** 地震說法（沒有採用到大小時，用第一個地震用詞的位置決定時間；規格 2.2） */
const QUAKE_WORD_RE = /地震|地牛|強震|規模|震度|有感|搖晃|會搖|會晃/;

/** 原文提到重複預言（規格 2.5；「周」已正規化成「週」） */
const REPEAT_RE = /又說|再次|再度|每週都|每天都|一直說|每次都|重複/;

const SLOT_ORDER: readonly Span['slot'][] = ['time', 'region', 'size', 'modifier'];

export function parseClaimStrict(text: string, issuedAt: string): ParseResult {
  const norm = normalize(text);
  const size = findSize(norm, text);
  const region = findRegion(norm, text);
  // 時間取「地震說法」前面最近的那一個：先找採用的大小，沒有就找第一個地震用詞
  const sizeSpan = size.spans.find((s) => s.slot === 'size');
  const quakeWord = QUAKE_WORD_RE.exec(norm);
  const anchor = sizeSpan?.start ?? quakeWord?.index ?? null;
  const time = findTime(norm, text, issuedAt, anchor);

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
