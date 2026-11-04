/**
 * M2：固定速率模型下，窗口內發生 0、1、2…次的機率（Poisson 分布）。
 * 第一欄「0 次」就是「沒中」的機率；其餘加起來就是 M2 的命中率。最後一欄合併「K 次以上」。
 */
import type { PoissonResult } from '../../core/types';
import { M2 } from '../../copy/zh-TW';
import { formatInt, formatPercent, formatSig } from '../format';
import { html, type SafeHtml } from '../html';
import { columnPath, fx, srTable, svgRoot } from './svg';

/** P(X = k)，X ~ Poisson(μ)，在對數空間計算 */
export function poissonPmf(k: number, mu: number): number {
  if (mu === 0) return k === 0 ? 1 : 0;
  let logFact = 0;
  for (let i = 2; i <= k; i++) logFact += Math.log(i);
  return Math.exp(-mu + k * Math.log(mu) - logFact);
}

/** 欄位：0..K−1 各一欄，最後一欄是「K 次以上」 */
export function pmfColumns(mu: number): { label: string; full: string; p: number; zero: boolean }[] {
  const K = Math.min(16, Math.max(5, Math.ceil(mu + 3 * Math.sqrt(mu)) + 1));
  const cols: { label: string; full: string; p: number; zero: boolean }[] = [];
  let sum = 0;
  for (let k = 0; k < K; k++) {
    const p = poissonPmf(k, mu);
    sum += p;
    cols.push({ label: String(k), full: String(k), p, zero: k === 0 });
  }
  cols.push({ label: M2.tickAtLeast(String(K)), full: M2.countAtLeast(String(K)), p: Math.max(0, 1 - sum), zero: false });
  return cols;
}

export function poissonPmfChart(poi: PoissonResult, width: number): SafeHtml {
  const mu = (poi.ratePerYear * poi.windowDays) / 365.25;
  const cols = pmfColumns(mu);
  const top = 20;
  const plotH = 130;
  const bottom = 34;
  const height = top + plotH + bottom;
  const band = width / cols.length;
  const barW = Math.max(2, band * 0.68);
  const maxP = Math.max(...cols.map((c) => c.p), 1e-12);
  const labelEvery = band >= 22 ? 1 : band >= 12 ? 2 : 4;
  const showAllValues = band >= 40;
  const maxIndex = cols.findIndex((c) => c.p === maxP);

  const parts = cols.map((c, i) => {
    const x = i * band + (band - barW) / 2;
    const h = (c.p / maxP) * plotH;
    const base = top + plotH;
    const showValue = showAllValues || i === 0 || i === maxIndex;
    const isLast = i === cols.length - 1;
    return html`<path class="${c.zero ? 'pmf-zero' : 'pmf-some'}" d="${columnPath(x, base, barW, Math.max(h, c.p > 0 ? 1 : 0))}"/>
      ${showValue ? html`<text class="value" x="${fx(x + barW / 2)}" y="${fx(base - h - 6)}" text-anchor="middle">${formatPercent(c.p)}</text>` : ''}
      ${i % labelEvery === 0 || isLast ? html`<text class="tick" x="${fx(x + barW / 2)}" y="${fx(base + 15)}" text-anchor="middle">${c.label}</text>` : ''}`;
  });
  const axis = html`<line class="axis" x1="0" x2="${fx(width)}" y1="${top + plotH}" y2="${top + plotH}"/>
    <text class="axis-label" x="${fx(width / 2)}" y="${height - 2}" text-anchor="middle">${M2.axisCount}</text>`;

  const zero = cols[0]?.p ?? 0;
  const aria = M2.chartAria(formatInt(poi.windowDays), formatSig(mu, 3), formatPercent(zero));
  const legend = html`<ul class="chart-legend">
    <li><span class="legend-swatch" style="--swatch: var(--model)" aria-hidden="true"></span>${M2.legendZero}</li>
    <li><span class="legend-swatch" style="--swatch: var(--accent)" aria-hidden="true"></span>${M2.legendSome}</li>
  </ul>`;
  const table = srTable(M2.tableCaption, M2.tableHead, cols.map((c) => [c.full, formatPercent(c.p)]));
  return html`${svgRoot(width, height, aria, html`${parts}${axis}`)}${legend}${table}`;
}
