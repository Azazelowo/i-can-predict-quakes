/**
 * M10：連續猜中 k 次後，「他真的有能力」的後驗機率。虛線是目標把握，空心圓是剛好達標的那一次。
 */
import type { BayesResult } from '../../core/types';
import { M10 } from '../../copy/zh-TW';
import { formatInt, formatPercent, formatPercentSetting, formatPercentShort } from '../format';
import { html, type SafeHtml } from '../html';
import { PERCENT_TICKS, fx, integerStep, srTable, svgRoot } from './svg';

export function bayesCurveChart(b: BayesResult, width: number): SafeHtml {
  const curve = b.curve;
  const K = Math.max(1, curve.length - 1);
  const padL = 40;
  const padR = 12;
  const padT = 14;
  const plotH = 160;
  const padB = 36;
  const plotW = width - padL - padR;
  const height = padT + plotH + padB;
  const x = (k: number) => padL + (k / K) * plotW;
  const y = (p: number) => padT + (1 - p) * plotH;

  const grid = PERCENT_TICKS.map(
    (t) => html`<line class="grid" x1="${padL}" x2="${fx(width - padR)}" y1="${fx(y(t))}" y2="${fx(y(t))}"/>
      <text class="tick" x="${padL - 6}" y="${fx(y(t) + 4)}" text-anchor="end">${formatPercentShort(t)}</text>`,
  );
  const targetY = y(b.target);
  const targetLabel = M10.targetLabel(formatPercentSetting(b.target));
  // 目標標籤放左上：曲線從先驗（低）開始往上爬，左側在目標線附近通常是空的
  const target = html`<line class="target-line" x1="${padL}" x2="${fx(width - padR)}" y1="${fx(targetY)}" y2="${fx(targetY)}"/>
    <text class="target-text" x="${padL + 4}" y="${fx(targetY > padT + 16 ? targetY - 5 : targetY + 14)}">${targetLabel}</text>`;

  const points = curve.map((c) => `${fx(x(c.k))},${fx(y(c.posterior))}`).join(' ');
  const dots = K <= 40 ? curve.map((c) => html`<circle class="curve-dot" cx="${fx(x(c.k))}" cy="${fx(y(c.posterior))}" r="2.5"/>`) : [];

  const k = b.hitsNeeded;
  const hitPoint = k !== null && k > 0 ? curve[k] : undefined;
  const hit = hitPoint
    ? html`<circle class="curve-hit" cx="${fx(x(hitPoint.k))}" cy="${fx(y(hitPoint.posterior))}" r="6"/>
        <text class="value" x="${fx(Math.min(Math.max(x(hitPoint.k), padL + 24), width - padR - 24))}" y="${fx(Math.max(y(hitPoint.posterior) - 12, 11))}" text-anchor="middle">${M10.hitLabel(formatInt(hitPoint.k))}</text>`
    : '';

  const every = integerStep(K + 1, plotW / K, 28);
  const xLabels = curve
    .filter((c) => c.k % every === 0 || c.k === K)
    .map((c) => html`<text class="tick" x="${fx(x(c.k))}" y="${padT + plotH + 15}" text-anchor="middle">${c.k}</text>`);
  const axis = html`<line class="axis" x1="${padL}" x2="${fx(width - padR)}" y1="${fx(y(0))}" y2="${fx(y(0))}"/>
    <text class="axis-label" x="${fx(padL + plotW / 2)}" y="${height - 3}" text-anchor="middle">${M10.axisK}</text>`;

  const aria =
    k === null ? M10.chartAriaNever : M10.chartAria(formatInt(k), formatPercentSetting(b.target));
  const table = srTable(
    M10.tableCaption,
    M10.tableHead,
    curve.map((c) => [String(c.k), formatPercent(c.posterior)]),
  );
  const body = html`${grid}${target}<polyline class="curve-line" points="${points}"/>${dots}${hit}${xLabels}${axis}`;
  return html`${svgRoot(width, height, aria, body)}${table}`;
}
