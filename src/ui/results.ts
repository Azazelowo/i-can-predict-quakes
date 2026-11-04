/**
 * 結果區：總覽卡 + 模式卡（依固定順序）。
 * 大小沒說時只顯示總覽（含光譜）、M4 與 M14，並邀請使用者點光譜或選大小。
 */
import { UNSPECIFIED_CARDS, type AppState, type CardId } from '../app/state';
import type { DataBundle, Results } from '../core/types';
import { MODES } from '../copy/zh-TW';
import { cardHtml, natureLegend, type CardContext, type CardSpec } from './cards/common';
import { CARD_BUILDERS } from './cards/registry';
import { html, type SafeHtml } from './html';
import { overviewHtml } from './overview';

export function cardContext(state: AppState, results: Results, data: DataBundle): CardContext {
  return { results, data, width: state.chartWidth, bayes: state.bayes };
}

/** 這次要顯示的模式卡（依顯示順序） */
export function visibleCards(results: Results, ctx: CardContext): CardSpec[] {
  const unspecified = results.headline.source === 'spectrum';
  const specs: CardSpec[] = [];
  for (const [id, build] of CARD_BUILDERS) {
    if (unspecified && !UNSPECIFIED_CARDS.includes(id)) continue;
    const spec = build(ctx);
    if (spec) specs.push(spec);
  }
  return specs;
}

export function singleCardHtml(state: AppState, id: CardId): SafeHtml | null {
  const { results, data } = state;
  if (!results || !data) return null;
  const build = CARD_BUILDERS.find(([cardId]) => cardId === id)?.[1];
  const spec = build?.(cardContext(state, results, data));
  return spec ? cardHtml(spec, state.open.has(id)) : null;
}

export function resultsHtml(state: AppState): SafeHtml {
  const { results, data } = state;
  if (!results || !data) return html``;
  const ctx = cardContext(state, results, data);
  const unspecified = results.headline.source === 'spectrum';
  const cards = visibleCards(results, ctx);
  return html`${overviewHtml(state, results, state.chartWidth)}
    <section class="modes" aria-labelledby="modes-title">
      <div class="modes-head">
        <h2 class="card-title" id="modes-title">${MODES.title}</h2>
        <p class="modes-intro">${unspecified ? MODES.introUnspecified : MODES.intro}</p>
        ${natureLegend()}
      </div>
      <div class="mode-list">${cards.map((spec) => cardHtml(spec, state.open.has(spec.id)))}</div>
    </section>`;
}
