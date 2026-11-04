/**
 * M1 歷史回放【事實】：過去每一天都當成預言發布日，數有幾成的窗口真的發生。
 */
import { M1 } from '../../copy/zh-TW';
import { heatmapChart } from '../charts/heatmap';
import { formatInt, formatPercent, percentResult, periodLabels } from '../format';
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

export function m1Card(ctx: CardContext): CardSpec | null {
  const rep = ctx.results.replay;
  if (!rep) return null;
  const { years, from, to } = periodLabels(ctx.results.period);
  const days = formatInt(rep.windowDays);
  const p = formatPercent(rep.p);
  return {
    id: 'm1',
    code: M1.code,
    title: M1.title,
    question: M1.question(years),
    natures: ['fact'],
    peek: p,
    body: () => html`
      ${explain(M1.explain(from, to, days, formatInt(rep.windows), formatInt(rep.hits), p))}
      ${chartBlock(M1.chartTitle(days), heatmapChart(rep, ctx.results.period, ctx.width))}
      ${formulaBlock([
        M1.formula(formatInt(rep.hits), formatInt(rep.windows), percentResult(rep.p)),
        M1.ciLine(formatPercent(rep.ci95[0]), formatPercent(rep.ci95[1])),
      ])}
      ${assumptionsBlock(M1.assumptions(formatInt(rep.nEvents)))}
      ${sourceLine(claimSourceText(ctx))}
    `,
  };
}
