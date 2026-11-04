/**
 * M14 為什麼模型答案不一樣：並列 M1（保留真實群聚）與 M2（不考慮群聚）的結果與區間，
 * 說明兩種「隨機」（預言固定 vs. 地震固定），並附參考文獻。
 */
import { M14, MODES, REFERENCES } from '../../copy/zh-TW';
import { consensusChart } from '../charts/consensus';
import { formatPercent, formatPercentRange, formatPoints, periodLabels } from '../format';
import { html } from '../html';
import {
  assumptionsBlock,
  chartBlock,
  claimSourceText,
  dataTable,
  explain,
  sourceLine,
  type CardContext,
  type CardSpec,
} from './common';

export function m14Card(ctx: CardContext): CardSpec {
  const { results, data } = ctx;
  const cmp = results.compare;
  const { from, to } = periodLabels(results.period);
  const source = cmp
    ? claimSourceText(ctx)
    : MODES.sourceBoth(data.meta.catalog.source, data.meta.felt.source, from, to);
  return {
    id: 'm14',
    code: M14.code,
    title: M14.title,
    question: M14.question,
    natures: ['fact', 'model'],
    peek: cmp ? formatPoints(cmp.diff) : null,
    body: () => html`
      ${explain(M14.explain)}
      ${cmp
        ? html`${dataTable(M14.tableCaption, M14.tableHead, [
            [M14.rowM1, formatPercent(cmp.empirical), formatPercentRange(cmp.empiricalCi[0], cmp.empiricalCi[1]), M14.ciM1],
            [M14.rowM2, formatPercent(cmp.poisson), formatPercentRange(cmp.poissonCi[0], cmp.poissonCi[1]), M14.ciM2],
          ])}
          <p class="result-line">${M14.diff(formatPoints(cmp.diff))}</p>
          ${chartBlock(M14.tableCaption, consensusChart(cmp, ctx.width))}`
        : html`<p class="result-line">${M14.noSize}</p>`}
      ${dataTable(
        M14.kindsTitle,
        M14.kindsHead,
        M14.kinds.map((k) => [k.name, k.answers, k.use]),
        { textTable: true },
      )}
      <p>${M14.clustering}</p>
      <div>
        <p class="assumptions-title">${M14.refsTitle}</p>
        <ul class="refs">${REFERENCES.map(
          (ref) => html`<li>${ref.text} <a href="${ref.url}" rel="noopener noreferrer">${ref.url}</a></li>`,
        )}</ul>
      </div>
      ${assumptionsBlock(M14.assumptions)}
      ${sourceLine(source)}
    `,
  };
}
