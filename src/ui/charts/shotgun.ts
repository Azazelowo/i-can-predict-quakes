/**
 * M8 一年份預言的命中次數分布：直條 = 歷史實際【事實】，折線與圓點 = 獨立假設的二項分布【模型】。
 * 地震成群發生，所以歷史分布通常比二項分布更分散（中 0 次和中很多次都比較常見）。
 *
 * 次數很多時（例如 T = 1 天，一年 365 次），只畫有意義的範圍，再把相鄰的次數合併成最多 40 欄；
 * 範圍外的極少量機率併進第一欄和最後一欄，並標成「≤a」「≥b」。
 */
import type { ShotgunResult } from '../../core/types';
import { M8 } from '../../copy/zh-TW';
import { formatPercent, formatPercentShort } from '../format';
import { html, type SafeHtml } from '../html';
import { columnPath, fx, integerStep, srTable, svgRoot } from './svg';

const MAX_BINS = 40;
const NEGLIGIBLE = 0.0005;

export interface HistBin {
  from: number;
  to: number;
  label: string;
  historical: number;
  binomial: number;
}

function firstAbove(values: readonly number[], eps: number): number {
  const i = values.findIndex((v) => v > eps);
  return i < 0 ? 0 : i;
}

function lastAbove(values: readonly number[], eps: number): number {
  for (let i = values.length - 1; i >= 0; i--) if ((values[i] ?? 0) > eps) return i;
  return 0;
}

/** 把 0..n 的兩個分布切成要畫的欄（純函式，方便測試） */
export function histogramBins(run: ShotgunResult['yearRun']): HistBin[] {
  const { n, historical, binomial } = run;
  let lo = 0;
  let hi = n;
  if (n + 1 > MAX_BINS) {
    lo = Math.min(firstAbove(historical, NEGLIGIBLE), firstAbove(binomial, NEGLIGIBLE));
    hi = Math.max(lastAbove(historical, NEGLIGIBLE), lastAbove(binomial, NEGLIGIBLE), lo);
  }
  const width = Math.max(1, Math.ceil((hi - lo + 1) / MAX_BINS));
  const bins: HistBin[] = [];
  for (let from = lo; from <= hi; from += width) {
    const to = Math.min(hi, from + width - 1);
    // 範圍外的尾巴併進第一欄、最後一欄
    const a = from === lo ? 0 : from;
    const b = to === hi ? n : to;
    let h = 0;
    let p = 0;
    for (let k = a; k <= b; k++) {
      h += historical[k] ?? 0;
      p += binomial[k] ?? 0;
    }
    let label = from === to ? String(from) : M8.binRange(String(from), String(to));
    if (a < from) label = `≤${to}`;
    if (b > to) label = `≥${from}`;
    bins.push({ from: a, to: b, label, historical: h, binomial: p });
  }
  return bins;
}

function niceMax(max: number): { top: number; step: number } {
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25];
  const step = steps.find((s) => max / s <= 4) ?? 0.25;
  return { top: Math.min(1, Math.max(step, Math.ceil(max / step - 1e-9) * step)), step };
}

export function shotgunHistogram(run: ShotgunResult['yearRun'], width: number): SafeHtml {
  const bins = histogramBins(run);
  const maxVal = Math.max(...bins.map((b) => Math.max(b.historical, b.binomial)), 0.01);
  const { top: yMax, step } = niceMax(maxVal);
  const padL = 38;
  const padT = 10;
  const plotH = 150;
  const padB = 36;
  const plotW = width - padL - 4;
  const height = padT + plotH + padB;
  const band = plotW / bins.length;
  const barW = Math.max(1.5, band * 0.72);
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;
  const cx = (i: number) => padL + i * band + band / 2;

  const grid: SafeHtml[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += step) {
    grid.push(html`<line class="grid" x1="${padL}" x2="${fx(width)}" y1="${fx(y(v))}" y2="${fx(y(v))}"/>
      <text class="tick" x="${padL - 6}" y="${fx(y(v) + 4)}" text-anchor="end">${formatPercentShort(v)}</text>`);
  }
  const bars = bins.map(
    (b, i) => html`<path class="hist-bar" d="${columnPath(cx(i) - barW / 2, padT + plotH, barW, (b.historical / yMax) * plotH, 3)}"/>`,
  );
  const points = bins.map((b, i) => `${fx(cx(i))},${fx(y(b.binomial))}`).join(' ');
  const dots = band >= 7 ? bins.map((b, i) => html`<circle class="binom-dot" cx="${fx(cx(i))}" cy="${fx(y(b.binomial))}" r="3"/>`) : [];
  const every = integerStep(bins.length, band, 26);
  const labels = bins.map((b, i) =>
    i % every === 0 || i === bins.length - 1
      ? html`<text class="tick" x="${fx(cx(i))}" y="${padT + plotH + 15}" text-anchor="middle">${b.label}</text>`
      : '',
  );
  const axis = html`<line class="axis" x1="${padL}" x2="${fx(width)}" y1="${padT + plotH}" y2="${padT + plotH}"/>
    <text class="axis-label" x="${fx(padL + plotW / 2)}" y="${height - 3}" text-anchor="middle">${M8.axisHits}</text>`;

  let mode = bins[0];
  for (const b of bins) if (mode && b.historical > mode.historical) mode = b;
  const aria = M8.histAria(String(run.n), mode?.label ?? '0');
  const legend = html`<ul class="chart-legend">
    <li><span class="legend-swatch" style="--swatch: var(--accent)" aria-hidden="true"></span>${M8.legendHistorical}</li>
    <li><svg class="legend-mark" viewBox="0 0 12 12" aria-hidden="true"><circle class="binom-dot" cx="6" cy="6" r="3.5"/></svg>${M8.legendBinomial}</li>
  </ul>`;
  const table = srTable(
    M8.histTableCaption,
    M8.histTableHead,
    bins.map((b) => [b.label, formatPercent(b.historical), formatPercent(b.binomial)]),
  );
  const body = html`${grid}${bars}<polyline class="binom-line" points="${points}"/>${dots}${labels}${axis}`;
  return html`${svgRoot(width, height, aria, body)}${legend}${table}`;
}
