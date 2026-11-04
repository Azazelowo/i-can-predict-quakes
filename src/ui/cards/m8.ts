/**
 * M8 亂槍打鳥【事實＋模型】：同一個人一直發同樣的預言，至少中一次的機率與平均中幾次。
 * 並列「假設各次獨立」（模型）與「歷史上連續的窗口」（事實，保留地震成群發生的特性）。
 */
import type { ShotgunResult } from '../../core/types';
import { M8, MODES } from '../../copy/zh-TW';
import { shotgunHistogram } from '../charts/shotgun';
import { formatCount, formatInt, formatPercent, formatPercentPrecise, percentResult } from '../format';
import { html, type SafeHtml } from '../html';
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

/** 兩層表頭的表格：說了幾次 ｜ 至少中一次（獨立、歷史）｜ 平均中幾次（獨立、歷史） */
function shotgunTable(shot: ShotgunResult, yearN: number): SafeHtml {
  const [g1, g2] = M8.tableGroups;
  const [independent, historical] = M8.tableSub;
  return html`<div class="table-wrap">
    <table class="data-table shotgun-table">
      <caption>${M8.tableCaption}</caption>
      <thead>
        <tr>
          <th scope="col" rowspan="2">${M8.tableFirst}</th>
          <th scope="colgroup" colspan="2" class="group-head">${g1}</th>
          <th scope="colgroup" colspan="2" class="group-head">${g2}</th>
        </tr>
        <tr>
          <th scope="col">${independent}</th><th scope="col">${historical}</th>
          <th scope="col">${independent}</th><th scope="col">${historical}</th>
        </tr>
      </thead>
      <tbody>
        ${shot.rows.map(
          (r) => html`<tr class="${r.n === yearN ? 'is-year' : ''}">
            <th scope="row">${M8.times(formatInt(r.n))}${r.n === yearN ? html`<span class="year-tag">${M8.yearTag}</span>` : ''}</th>
            <td>${formatPercent(r.independent)}</td>
            <td>${formatPercent(r.historical)}</td>
            <td>${formatCount(r.expectedHits)}</td>
            <td>${formatCount(r.historicalMeanHits)}</td>
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

export function m8Card(ctx: CardContext): CardSpec | null {
  const { results } = ctx;
  const shot = results.shotgun;
  const rep = results.replay;
  if (!shot || !rep) return null;
  const T = rep.windowDays;
  const yearN = shot.yearRun.n;
  const yearRow = shot.rows.find((r) => r.n === yearN) ?? shot.rows[shot.rows.length - 1];
  // 公式用「一年份」那一列；萬一沒有（期間太短），直接用 yearRun 的次數計算
  const n = yearRow?.n ?? yearN;
  const atLeastOne = yearRow?.independent ?? 1 - (1 - shot.p) ** n;
  const expected = yearRow?.expectedHits ?? n * shot.p;
  return {
    id: 'm8',
    code: M8.code,
    title: M8.title,
    question: M8.question,
    natures: ['fact', 'model'],
    peek: yearRow ? M8.peek(formatInt(yearRow.n), formatPercent(yearRow.historical)) : null,
    body: () => html`
      ${explain(M8.explain(formatInt(T)))}
      ${shotgunTable(shot, yearN)}
      ${chartBlock(M8.histTitle(formatInt(yearN)), shotgunHistogram(shot.yearRun, ctx.width))}
      ${formulaBlock(M8.formula(formatPercentPrecise(shot.p), formatInt(n), percentResult(atLeastOne), formatCount(expected)))}
      ${assumptionsBlock(M8.assumptions)}
      ${sourceLine(MODES.sourceHeadline, claimSourceText(ctx))}
    `,
  };
}
