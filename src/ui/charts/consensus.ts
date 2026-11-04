/**
 * 模型共識條：M1 歷史回放與 M2 固定速率，畫在同一條 0–100% 的軸上，附 95% 區間的鬚線。
 * M1 用實心圓、M2 用空心菱形（顏色以外的第二種編碼）。
 */
import type { CompareResult } from '../../core/types';
import { CHART } from '../../copy/zh-TW';
import { formatPercent, formatPercentRange, formatPercentShort } from '../format';
import { html, type SafeHtml } from '../html';
import { PERCENT_TICKS, fx, scale, srTable, svgRoot, textWidth, tickAnchor } from './svg';

interface Row {
  label: string;
  p: number;
  ci: [number, number];
  kind: 'm1' | 'm2';
}

function marker(kind: Row['kind'], x: number, y: number): SafeHtml {
  if (kind === 'm2') {
    const d = 7;
    return html`<path class="dot-m2" d="M${fx(x)} ${fx(y - d)}L${fx(x + d)} ${fx(y)}L${fx(x)} ${fx(y + d)}L${fx(x - d)} ${fx(y)}Z"/>`;
  }
  return html`<circle class="dot-m1" cx="${fx(x)}" cy="${fx(y)}" r="6.5"/>`;
}

export function consensusChart(cmp: CompareResult, width: number): SafeHtml {
  const rows: Row[] = [
    { label: CHART.m1Label, p: cmp.empirical, ci: cmp.empiricalCi, kind: 'm1' },
    { label: CHART.m2Label, p: cmp.poisson, ci: cmp.poissonCi, kind: 'm2' },
  ];
  const wide = width >= 520;
  const labelW = wide ? 112 : 0;
  const rowH = wide ? 44 : 56;
  const axisH = 22;
  const x0 = labelW + 10;
  const x1 = width - 12;
  const x = scale(0, 1, x0, x1);
  const height = axisH + rows.length * rowH + 4;

  const grid = PERCENT_TICKS.map(
    (t, i) => html`<line class="grid" x1="${fx(x(t))}" x2="${fx(x(t))}" y1="${fx(axisH - 4)}" y2="${fx(height - 4)}"/>
      <text class="tick" x="${fx(x(t))}" y="13" text-anchor="${tickAnchor(i, PERCENT_TICKS.length)}">${formatPercentShort(t)}</text>`,
  );

  const body = rows.map((row, i) => {
    const top = axisH + i * rowH;
    const y = wide ? top + rowH / 2 : top + 36;
    const lo = x(row.ci[0]);
    const hi = x(row.ci[1]);
    const px = x(row.p);
    const text = `${formatPercent(row.p)}（${formatPercentRange(row.ci[0], row.ci[1])}）`;
    const tw = textWidth(text, 12);
    // 窄版：標籤在左上、數值在右上。寬版：數值放鬚線右邊，放不下改左邊，再不行放在點的上方。
    let textX: number;
    let textY = y + 4.5;
    let anchor: 'start' | 'end' | 'middle';
    if (!wide) {
      textX = x1;
      textY = top + 15;
      anchor = 'end';
    } else if (hi + 10 + tw <= width - 2) {
      textX = hi + 10;
      anchor = 'start';
    } else if (lo - 10 - tw >= x0) {
      textX = lo - 10;
      anchor = 'end';
    } else {
      textX = Math.min(Math.max(px, x0 + tw / 2), x1 - tw / 2);
      textY = y - 11;
      anchor = 'middle';
    }
    const labelY = wide ? y + 4.5 : top + 15;
    return html`<g>
      <text class="row-label" x="${wide ? 4 : x0}" y="${fx(labelY)}">${row.label}</text>
      <line class="track-line" x1="${fx(x0)}" x2="${fx(x1)}" y1="${fx(y)}" y2="${fx(y)}"/>
      <line class="whisker${row.kind === 'm2' ? ' whisker-m2' : ''}" x1="${fx(lo)}" x2="${fx(hi)}" y1="${fx(y)}" y2="${fx(y)}"/>
      <line class="whisker${row.kind === 'm2' ? ' whisker-m2' : ''}" x1="${fx(lo)}" x2="${fx(lo)}" y1="${fx(y - 6)}" y2="${fx(y + 6)}"/>
      <line class="whisker${row.kind === 'm2' ? ' whisker-m2' : ''}" x1="${fx(hi)}" x2="${fx(hi)}" y1="${fx(y - 6)}" y2="${fx(y + 6)}"/>
      ${marker(row.kind, px, y)}
      <text class="value" x="${fx(textX)}" y="${fx(textY)}" text-anchor="${anchor}">${text}</text>
    </g>`;
  });

  const aria = CHART.consensusAria(
    formatPercent(cmp.empirical),
    formatPercentRange(cmp.empiricalCi[0], cmp.empiricalCi[1]),
    formatPercent(cmp.poisson),
    formatPercentRange(cmp.poissonCi[0], cmp.poissonCi[1]),
  );
  const table = srTable(
    CHART.consensusTableCaption,
    CHART.consensusTableHead,
    rows.map((r) => [r.label, formatPercent(r.p), formatPercentRange(r.ci[0], r.ci[1])]),
  );
  return html`${svgRoot(width, height, aria, html`${grid}${body}`)}${table}`;
}
