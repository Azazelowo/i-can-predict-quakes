/**
 * M12 生活換算與算命師等級【假設】：等級階梯（目前的等級反白）與生活機率尺（標出這則預言的位置）。
 */
import { M12, MODES } from '../../copy/zh-TW';
import { analogyScaleChart } from '../charts/analogyScale';
import { levelLadder } from '../charts/ladder';
import { levelName } from '../format';
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

export function m12Card(ctx: CardContext): CardSpec | null {
  const { level, analogy, headline } = ctx.results;
  const p = headline.p;
  if (!level || !analogy || p === null) return null;
  return {
    id: 'm12',
    code: M12.code,
    title: M12.title,
    question: M12.question,
    natures: ['assumption'],
    peek: levelName(level),
    body: () => html`
      ${explain(M12.explain)}
      ${chartBlock(M12.ladderTitle, levelLadder(level))}
      ${chartBlock(M12.scaleTitle, analogyScaleChart(p, analogy.id, ctx.width), M12.scaleHelp)}
      ${formulaBlock(M12.formula)}
      ${assumptionsBlock(M12.assumptions)}
      ${sourceLine(MODES.sourceHeadline, claimSourceText(ctx))}
    `,
  };
}
