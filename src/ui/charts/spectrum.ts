/**
 * M4a 解讀光譜：11 種解讀各佔一列（點圖），共用一條 0–100% 的橫軸。
 *
 * 每一列都是按鈕（role="button"、可用 Tab 與 Enter／空白鍵操作），點了就改用那種解讀，
 * 所以這張圖的外層用 role="group" 而不是 role="img"（role="img" 會把裡面的按鈕藏起來）。
 * 一列一個標籤，標籤之間不會互相重疊；圓點是規模、菱形是震度（顏色以外的第二種編碼）。
 */
import type { Interpretation, SizeSpec } from '../../core/types';
import { M4, SPECTRUM_LABELS } from '../../copy/zh-TW';
import { formatPercent } from '../format';
import { html, type SafeHtml } from '../html';
import { PERCENT_TICKS, fx, scale, tickAnchor } from './svg';

export function sameSize(a: SizeSpec, b: SizeSpec): boolean {
  if (a.kind === 'magnitude' && b.kind === 'magnitude') return a.value === b.value && a.tolerance === b.tolerance;
  if (a.kind === 'intensity' && b.kind === 'intensity') return a.value === b.value;
  return a.kind === 'unspecified' && b.kind === 'unspecified';
}

function marker(kind: SizeSpec['kind'], x: number, y: number, r: number): SafeHtml {
  if (kind === 'intensity') {
    const d = r * 1.25;
    return html`<path class="spec-dot" d="M${fx(x)} ${fx(y - d)}L${fx(x + d)} ${fx(y)}L${fx(x)} ${fx(y + d)}L${fx(x - d)} ${fx(y)}Z"/>`;
  }
  return html`<circle class="spec-dot" cx="${fx(x)}" cy="${fx(y)}" r="${fx(r)}"/>`;
}

/** 圖例（HTML，會自動換行） */
export function spectrumLegend(): SafeHtml {
  return html`<ul class="chart-legend">
    <li><svg class="legend-mark" viewBox="0 0 12 12" aria-hidden="true"><circle class="spec-dot" cx="6" cy="6" r="4.5"/></svg>${M4.legendMagnitude}</li>
    <li><svg class="legend-mark" viewBox="0 0 12 12" aria-hidden="true"><path class="spec-dot" d="M6 0.5L11.5 6L6 11.5L0.5 6Z"/></svg>${M4.legendIntensity}</li>
  </ul>`;
}

export function spectrumChart(items: readonly Interpretation[], current: SizeSpec, width: number): SafeHtml {
  const wide = width >= 520;
  const rowH = wide ? 40 : 50;
  const axisH = 26;
  const labelW = wide ? 184 : 0;
  const padR = 14;
  const x0 = wide ? labelW + 10 : 10;
  const x1 = width - padR;
  const x = scale(0, 1, x0, x1);
  const height = axisH + items.length * rowH + 6;

  const grid = PERCENT_TICKS.map(
    (t, i) => html`<line class="grid" x1="${fx(x(t))}" x2="${fx(x(t))}" y1="${fx(axisH - 4)}" y2="${fx(height - 4)}"/>
      <text class="tick" x="${fx(x(t))}" y="14" text-anchor="${tickAnchor(i, PERCENT_TICKS.length)}">${formatPercent(t)}</text>`,
  );

  const rows = items.map((item, i) => {
    const top = axisH + i * rowH;
    const isCurrent = sameSize(item.size, current);
    const label = SPECTRUM_LABELS[item.id] ?? item.id;
    const value = formatPercent(item.p);
    const trackY = wide ? top + rowH / 2 : top + 34;
    const labelX = wide ? 8 : x0;
    const labelY = wide ? top + rowH / 2 + 4.5 : top + 16;
    const dotX = x(item.p);
    const valueRight = dotX > x1 - 56;
    const r = isCurrent ? 6.5 : 5;
    return html`<g class="spec-row${isCurrent ? ' is-current' : ''}" data-action="pick-spectrum" data-id="${item.id}" role="button" tabindex="0" aria-pressed="${isCurrent ? 'true' : 'false'}" aria-label="${M4.spectrumRowAria(label, value, isCurrent)}">
      <rect class="spec-hit" x="1" y="${fx(top + 1)}" width="${fx(width - 2)}" height="${fx(rowH - 2)}" rx="8"/>
      <text class="spec-label" x="${fx(labelX)}" y="${fx(labelY)}">${label}${isCurrent ? html`<tspan class="spec-current" dx="6">${M4.spectrumCurrent}</tspan>` : ''}</text>
      <line class="spec-track" x1="${fx(x0)}" x2="${fx(x1)}" y1="${fx(trackY)}" y2="${fx(trackY)}"/>
      <line class="spec-stem" x1="${fx(x0)}" x2="${fx(dotX)}" y1="${fx(trackY)}" y2="${fx(trackY)}"/>
      ${marker(item.size.kind, dotX, trackY, r)}
      <text class="spec-value" x="${fx(valueRight ? dotX - 11 : dotX + 11)}" y="${fx(trackY + 4)}" text-anchor="${valueRight ? 'end' : 'start'}">${value}</text>
    </g>`;
  });

  const ps = items.map((it) => it.p);
  const low = ps.length ? Math.min(...ps) : 0;
  const high = ps.length ? Math.max(...ps) : 0;
  return html`<svg class="chart-svg spectrum-chart" viewBox="0 0 ${fx(width)} ${fx(height)}" width="100%" role="group" aria-label="${M4.spectrumAria(String(items.length), formatPercent(low), formatPercent(high))}">
    ${grid}${rows}
  </svg>`;
}
