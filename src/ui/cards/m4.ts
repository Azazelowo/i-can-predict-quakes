/**
 * M4 解讀光譜與敏感度【事實】：
 *   a. 解讀光譜：「大」的 11 種解讀各自的命中率（點一列就改用那種解讀）
 *   b. 敏感度矩陣：規模門檻 × 天數
 *   c. 灌水成分：一次只收緊一個條件
 */
import { M4, MODES, OVERVIEW } from '../../copy/zh-TW';
import { factorBarsChart } from '../charts/factorBars';
import { matrixTable } from '../charts/matrix';
import { spectrumChart, spectrumLegend } from '../charts/spectrum';
import { formatInt, formatPercentRange, formatRegion, periodLabels } from '../format';
import { html } from '../html';
import {
  assumptionsBlock,
  chartBlock,
  explain,
  formulaBlock,
  sourceLine,
  type CardContext,
  type CardSpec,
} from './common';

export function m4Card(ctx: CardContext): CardSpec {
  const { results, data, width } = ctx;
  const items = results.spectrum.items;
  const ps = items.map((it) => it.p);
  const low = ps.length > 0 ? Math.min(...ps) : 0;
  const high = ps.length > 0 ? Math.max(...ps) : 0;
  const { from, to } = periodLabels(results.period);
  const unspecified = results.claim.size.kind === 'unspecified';
  const factors = results.factors;
  return {
    id: 'm4',
    code: M4.code,
    title: M4.title,
    question: M4.question,
    natures: ['fact'],
    peek: formatPercentRange(low, high),
    body: () => html`
      ${explain(M4.explain(formatInt(items.length)))}
      ${chartBlock(M4.spectrumTitle, html`${spectrumChart(items, results.claim.size, width)}${spectrumLegend()}`, M4.spectrumHelp)}
      ${chartBlock(M4.matrixTitle, matrixTable(results.matrix), M4.matrixHelp(formatRegion(results.claim.region)))}
      ${chartBlock(
        M4.factorsTitle,
        factors.length > 0
          ? factorBarsChart(factors, width)
          : html`<p class="chart-help">${unspecified ? M4.factorsUnspecified : OVERVIEW.factorsNone}</p>`,
      )}
      ${formulaBlock(M4.formula(formatInt(results.spectrum.windowDays)))}
      ${assumptionsBlock(M4.assumptions)}
      ${sourceLine(MODES.sourceBoth(data.meta.catalog.source, data.meta.felt.source, from, to))}
    `,
  };
}
