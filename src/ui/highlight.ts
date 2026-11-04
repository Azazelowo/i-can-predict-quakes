/**
 * 在原文上標出被解讀的片段（純函式）。
 * span 用 UTF-16 索引 [start, end)；重疊時依 time > region > size > modifier 的優先順序。
 */
import type { Span } from '../core/types';
import { CONFIRM } from '../copy/zh-TW';
import { html, type SafeHtml } from './html';

export type SpanSlot = Span['slot'];

/** 優先順序高的排前面 */
export const SLOT_ORDER: readonly SpanSlot[] = ['time', 'region', 'size', 'modifier'];

export interface Segment {
  text: string;
  slot: SpanSlot | null;
}

export function segmentText(text: string, spans: readonly Span[]): Segment[] {
  const owner: (SpanSlot | null)[] = new Array<SpanSlot | null>(text.length).fill(null);
  // 優先順序低的先寫，高的後寫覆蓋
  for (const slot of [...SLOT_ORDER].reverse()) {
    for (const span of spans) {
      if (span.slot !== slot) continue;
      const start = Math.max(0, Math.floor(span.start));
      const end = Math.min(text.length, Math.floor(span.end));
      for (let i = start; i < end; i++) owner[i] = slot;
    }
  }
  const segments: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const slot = owner[i] ?? null;
    let j = i + 1;
    while (j < text.length && (owner[j] ?? null) === slot) j++;
    segments.push({ text: text.slice(i, j), slot });
    i = j;
  }
  return segments;
}

/** 用到的欄位（依優先順序） */
export function slotsUsed(spans: readonly Span[]): SpanSlot[] {
  return SLOT_ORDER.filter((slot) => spans.some((s) => s.slot === slot && s.end > s.start));
}

/**
 * 原文 → HTML（每個欄位一種顏色的 <mark>）。所有文字都經過跳脫。
 * stale：使用者已經手動改過的欄位，標示改成虛線，表示原文的這段已經不是目前的設定。
 */
export function highlightHtml(text: string, spans: readonly Span[], stale: ReadonlySet<SpanSlot>): SafeHtml {
  return html`${segmentText(text, spans).map((seg) =>
    seg.slot === null
      ? seg.text
      : html`<mark class="hl hl-${seg.slot}${stale.has(seg.slot) ? ' hl-stale' : ''}" title="${CONFIRM.slotNames[seg.slot]}">${seg.text}</mark>`,
  )}`;
}
