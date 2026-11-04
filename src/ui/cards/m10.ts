/**
 * M10 要連中幾次才可信【模型】：貝氏更新，三個滑桿（先驗、目標把握、能力者命中率）即時呼叫 bayes()。
 * 總覽用預設參數；這張卡用使用者調整過的參數（state.bayes）。
 */
import type { BayesResult } from '../../core/types';
import { M10, MODES, OVERVIEW } from '../../copy/zh-TW';
import { bayes } from '../../modes/index';
import { bayesCurveChart } from '../charts/bayesCurve';
import { formatInt, formatPercent, formatPercentPrecise, formatPercentSetting, formatSig } from '../format';
import { html, type SafeHtml } from '../html';
import { BAYES_SLIDERS, sliderIndex, type BayesParam } from '../sliders';
import {
  assumptionsBlock,
  chartBlock,
  claimSourceText,
  explain,
  formulaBlock,
  sourceLine,
  type CardContext,
  type CardSpec,
} from './common';

const PARAMS: readonly BayesParam[] = ['prior', 'target', 'skill'];

function slider(param: BayesParam, value: number): SafeHtml {
  const values = BAYES_SLIDERS[param].values;
  const text = formatPercentSetting(value);
  return html`<div class="slider">
    <div class="slider-head">
      <label for="bayes-${param}">${M10.sliders[param]}</label>
      <span class="slider-value" aria-hidden="true">${text}</span>
    </div>
    <input type="range" id="bayes-${param}" min="0" max="${values.length - 1}" step="1" value="${sliderIndex(param, value)}"
      aria-valuetext="${text}" data-action="bayes" data-param="${param}">
  </div>`;
}

function resultLine(b: BayesResult): SafeHtml {
  if (b.hitsNeeded === null) {
    return html`<p><strong>${M10.resultNever}</strong></p><p class="chart-help">${M10.resultNeverWhy}</p>`;
  }
  if (b.hitsNeeded === 0) return html`<p><strong>${M10.resultZero}</strong></p>`;
  return html`<p>${M10.resultLabel} <strong>${M10.result(formatInt(b.hitsNeeded))}</strong></p>`;
}

function formulaLines(b: BayesResult): string[] {
  const odds = (q: number) => q / (1 - q);
  const priorOdds = odds(b.prior);
  const targetOdds = odds(b.target);
  const lines = [M10.odds(formatSig(priorOdds, 3), formatSig(targetOdds, 3))];
  const lr = b.p0 > 0 ? b.skill / b.p0 : Number.POSITIVE_INFINITY;
  lines.push(M10.lr(formatPercentSetting(b.skill), formatPercentPrecise(b.p0), formatSig(lr, 3)));
  if (b.hitsNeeded === null) {
    lines.push(M10.kNever);
  } else if (b.hitsNeeded === 0) {
    lines.push(M10.resultZero);
  } else if (b.p0 > 0) {
    const x = Math.log(targetOdds / priorOdds) / Math.log(lr);
    lines.push(M10.k(formatSig(x, 3), formatInt(b.hitsNeeded)));
  }
  return lines;
}

export function m10Card(ctx: CardContext): CardSpec | null {
  const p0 = ctx.results.headline.p;
  if (p0 === null || ctx.results.headline.source === 'spectrum') return null;
  const b = bayes(p0, ctx.bayes);
  return {
    id: 'm10',
    code: M10.code,
    title: M10.title,
    question: M10.question,
    natures: ['model'],
    peek: b.hitsNeeded === null ? '—' : OVERVIEW.bayesCount(formatInt(b.hitsNeeded)),
    body: () => html`
      ${explain(M10.explain(formatPercent(p0)))}
      <div class="sliders">${PARAMS.map((param) => slider(param, ctx.bayes[param]))}</div>
      <div class="result-line" aria-live="polite">
        ${resultLine(b)}
        <p class="chart-help">${M10.afterOne(formatPercentSetting(b.prior), formatPercent(b.posteriorAfterOne))}</p>
      </div>
      ${chartBlock(M10.chartTitle, bayesCurveChart(b, ctx.width))}
      ${formulaBlock(formulaLines(b))}
      ${assumptionsBlock(M10.assumptions)}
      ${sourceLine(MODES.sourceHeadline, claimSourceText(ctx))}
    `,
  };
}
