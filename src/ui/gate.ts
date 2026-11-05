/**
 * 先確認再算：只提到國外、看不出是地震預言、或說法互相矛盾時，結果區先顯示這張卡，
 * 不直接給一個看起來很精確的數字（判斷規則在 src/app/quality.ts）。
 */
import type { GateKind } from '../app/quality';
import type { Flag } from '../core/types';
import { GATE } from '../copy/zh-TW';
import { html, type SafeHtml } from './html';

function detailOf(flags: readonly Flag[], code: Flag['code']): string {
  return (flags.find((f) => f.code === code)?.detail ?? '').trim();
}

export function gateHtml(kind: GateKind, flags: readonly Flag[]): SafeHtml {
  let title: string;
  let text: string;
  let hint: string;
  let continueLabel: string = GATE.continue;
  switch (kind) {
    case 'foreign-only':
      title = GATE.foreignTitle;
      text = GATE.foreignText(detailOf(flags, 'region-out-of-scope') || '國外');
      hint = GATE.foreignHint;
      continueLabel = GATE.foreignContinue;
      break;
    case 'not-quake':
      title = GATE.notQuakeTitle;
      text = GATE.notQuakeText;
      hint = GATE.notQuakeHint;
      break;
    case 'not-prophecy':
      title = GATE.notProphecyTitle;
      text = GATE.notProphecyText;
      hint = GATE.notProphecyHint;
      break;
    case 'empty':
      title = GATE.emptyTitle;
      text = GATE.emptyText;
      hint = GATE.emptyHint;
      break;
    case 'past':
      title = GATE.pastTitle;
      text = GATE.pastText;
      hint = GATE.pastHint;
      break;
    case 'conflicting': {
      const list = [detailOf(flags, 'size-multiple'), detailOf(flags, 'time-multiple'), detailOf(flags, 'region-union')]
        .filter(Boolean)
        .join('；');
      title = GATE.conflictTitle;
      text = GATE.conflictText(list);
      hint = GATE.conflictHint;
      break;
    }
  }
  return html`<section class="card gate-card" id="gate" aria-labelledby="gate-title" tabindex="-1">
    <h2 class="card-title" id="gate-title">${title}</h2>
    <p>${text}</p>
    <p class="gate-hint">${hint}</p>
    <div class="actions">
      <button type="button" class="btn btn-primary" data-action="gate-continue">${continueLabel}</button>
      <button type="button" class="btn btn-secondary" data-action="clear">${GATE.clear}</button>
    </div>
  </section>`;
}
