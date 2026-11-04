/**
 * M4c 灌水成分：每個條件一組兩條橫條（原本 vs. 收緊後），共用 0–100% 的軸，右邊標倍數。
 */
import type { Factor } from '../../core/types';
import { M4 } from '../../copy/zh-TW';
import { formatPercent, formatPercentShort, formatRatio, formatRegion, formatSize } from '../format';
import { html, type SafeHtml } from '../html';
import { PERCENT_TICKS, barPath, fx, scale, srTable, svgRoot, tickAnchor } from './svg';

/** 收緊後的說法（短版）：只說某一天、只說花蓮縣（含縣界外 30 公里）… */
export function factorShortLabel(f: Factor): string {
  switch (f.dimension) {
    case 'time':
      return M4.factorShort.time;
    case 'region':
      return M4.factorShort.region(formatRegion(f.alt.region));
    case 'size':
      return M4.factorShort.size(formatSize(f.alt.size));
    case 'tolerance':
      return M4.factorShort.tolerance;
  }
}

function ratioText(f: Factor): string {
  return f.ratio === null ? '—' : `×${formatRatio(f.ratio)}`;
}

export function factorBarsChart(factors: readonly Factor[], width: number): SafeHtml {
  const axisH = 22;
  const rowH = 64;
  const ratioW = 52;
  const x0 = 2;
  const x1 = width - ratioW;
  const x = scale(0, 1, x0, x1);
  const height = axisH + factors.length * rowH + 4;

  const grid = PERCENT_TICKS.map(
    (t, i) => html`<line class="grid" x1="${fx(x(t))}" x2="${fx(x(t))}" y1="${axisH - 4}" y2="${fx(height - 4)}"/>
      <text class="tick" x="${fx(x(t))}" y="13" text-anchor="${tickAnchor(i, PERCENT_TICKS.length)}">${formatPercentShort(t)}</text>`,
  );

  const rows = factors.map((f, i) => {
    const top = axisH + i * rowH;
    const label = factorShortLabel(f);
    const fromW = Math.max(0, x(f.from) - x0);
    const toW = Math.max(0, x(f.to) - x0);
    const yFrom = top + 22;
    const yTo = top + 40;
    const barH = 13;
    // 數值放在橫條右端外側；橫條太長放不下時改放在橫條內側（深色橫條上用反白字）
    const valueLabel = (w: number, y: number, text: string, dark: boolean): SafeHtml => {
      const inside = x0 + w + 50 > x1;
      return html`<text class="small-label${inside && dark ? ' on-bar' : ''}" x="${fx(inside ? x0 + w - 6 : x0 + w + 6)}" y="${fx(y + 10.5)}" text-anchor="${inside ? 'end' : 'start'}">${text}</text>`;
    };
    return html`<g>
      <text class="row-label" x="${x0}" y="${fx(top + 14)}">${label}</text>
      <path class="bar-from" d="${barPath(x0, yFrom, Math.max(fromW, 2), barH)}"/>
      <path class="bar-to" d="${barPath(x0, yTo, Math.max(toW, f.to > 0 ? 2 : 0), barH)}"/>
      ${valueLabel(fromW, yFrom, formatPercent(f.from), false)}
      ${valueLabel(toW, yTo, formatPercent(f.to), true)}
      <text class="ratio-text" x="${fx(width - 2)}" y="${fx(yTo + 4)}" text-anchor="end">${ratioText(f)}</text>
    </g>`;
  });

  const legend = html`<ul class="chart-legend">
    <li><span class="legend-swatch" style="--swatch: var(--accent-soft); outline: 1px solid var(--accent)" aria-hidden="true"></span>${M4.legendFrom}</li>
    <li><span class="legend-swatch" style="--swatch: var(--accent)" aria-hidden="true"></span>${M4.legendTo}</li>
  </ul>`;
  const table = srTable(
    M4.factorsTableCaption,
    M4.factorsTableHead,
    factors.map((f) => [factorShortLabel(f), formatPercent(f.from), formatPercent(f.to), ratioText(f)]),
  );
  return html`${svgRoot(width, height, M4.factorsAria(String(factors.length)), html`${grid}${rows}`)}${legend}${table}`;
}
