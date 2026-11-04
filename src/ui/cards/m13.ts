/**
 * M13 資訊量【事實】：bits = −log₂ p，和幾個生活事件並排比較。
 */
import { M13, MODES, UNITS } from '../../copy/zh-TW';
import { bitsChart } from '../charts/bits';
import { formatBits, formatPercentPrecise } from '../format';
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

export function m13Card(ctx: CardContext): CardSpec | null {
  const info = ctx.results.information;
  const p = ctx.results.headline.p;
  if (!info || p === null) return null;
  const bits = formatBits(info.bits);
  return {
    id: 'm13',
    code: M13.code,
    title: M13.title,
    question: M13.question,
    natures: ['fact'],
    peek: UNITS.bits(bits),
    body: () => html`
      ${explain(M13.explain)}
      ${chartBlock(M13.chartTitle, bitsChart(p, info.bits, ctx.width))}
      ${formulaBlock([M13.formula(formatPercentPrecise(p), bits)])}
      ${assumptionsBlock(M13.assumptions)}
      ${sourceLine(MODES.sourceHeadline, claimSourceText(ctx))}
    `,
  };
}
