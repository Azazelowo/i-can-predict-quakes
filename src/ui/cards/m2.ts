/**
 * M2 固定速率（Poisson）【模型】：假設地震以平均速率、彼此獨立地發生。
 * 和 M1 並列，用來說明「地震成群發生」讓短窗口的實際命中率比模型低。
 */
import type { CompareResult } from '../../core/types';
import { M2 } from '../../copy/zh-TW';
import { poissonPmfChart } from '../charts/pmf';
import {
  formatFixed,
  formatInt,
  formatPercent,
  formatPointsAbs,
  formatSig,
  percentResult,
  periodLabels,
} from '../format';
import { html } from '../html';
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

/** 差距小於 0.05 個百分點就說「幾乎一樣」（和百分比顯示到一位小數一致） */
const SAME_THRESHOLD = 0.0005;

export function versusM1(cmp: CompareResult): string {
  if (cmp.diff > SAME_THRESHOLD) return M2.vsHigher(formatPointsAbs(cmp.diff));
  if (cmp.diff < -SAME_THRESHOLD) return M2.vsLower(formatPointsAbs(cmp.diff));
  return M2.vsSame;
}

export function m2Card(ctx: CardContext): CardSpec | null {
  const poi = ctx.results.poisson;
  if (!poi) return null;
  const { years } = periodLabels(ctx.results.period);
  const yearsExact = formatFixed(poi.years, 2);
  const rate = formatSig(poi.ratePerYear, 4);
  const days = formatInt(poi.windowDays);
  const mean = formatSig((poi.ratePerYear * poi.windowDays) / 365.25, 3);
  const cmp = ctx.results.compare;
  return {
    id: 'm2',
    code: M2.code,
    title: M2.title,
    question: M2.question,
    natures: ['model'],
    peek: formatPercent(poi.p),
    body: () => html`
      ${explain(M2.explain(years, formatInt(poi.n), rate, days))}
      ${cmp ? html`<p class="result-line">${versusM1(cmp)}</p>` : ''}
      ${chartBlock(M2.chartTitle(days, mean), poissonPmfChart(poi, ctx.width))}
      ${formulaBlock([
        M2.rate(formatInt(poi.n), yearsExact, rate),
        M2.prob(rate, days, percentResult(poi.p)),
        M2.ciLine(formatPercent(poi.ci95[0]), formatPercent(poi.ci95[1])),
      ])}
      ${assumptionsBlock(M2.assumptions(years))}
      ${sourceLine(claimSourceText(ctx))}
    `,
  };
}
