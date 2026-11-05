/**
 * 輸入卡：輸入框、「算算看」、範例，以及資料載入中／失敗的狀態。
 * 原文只放在 textarea 裡（經過跳脫），不會出現在網址或分享文字中。
 */
import type { AppState } from '../app/state';
import { INPUT } from '../copy/zh-TW';
import { html, type SafeHtml } from './html';

/** 輸入框長度上限：一則預言用不到這麼多字，避免貼進整篇文章拖慢解析。 */
export const MAX_INPUT_LENGTH = 1000;

function loadStatus(state: AppState): SafeHtml {
  if (state.phase === 'loading') {
    return html`<p class="status-line"><span class="spinner" aria-hidden="true"></span>${INPUT.loading}</p>`;
  }
  if (state.phase === 'error') {
    return html`<div class="error-box" role="alert">
      <p>${INPUT.loadFailed(state.loadError ?? '')}</p>
      <button type="button" class="btn btn-secondary" data-action="retry">${INPUT.retry}</button>
    </div>`;
  }
  return html``;
}

export function inputCardHtml(state: AppState): SafeHtml {
  const message = state.inputMessage;
  return html`<section class="card input-card" aria-labelledby="input-title">
    <h2 class="card-title" id="input-title">${INPUT.title}</h2>
    <p class="scope-note">${INPUT.scope}</p>
    <form class="claim-form" data-form="claim" novalidate>
      <label class="field-label sr-only" for="claim-text">${INPUT.label}</label>
      <textarea id="claim-text" class="claim-input" name="claim" rows="3" maxlength="${MAX_INPUT_LENGTH}"
        placeholder="${INPUT.placeholder}" data-action="text" autocomplete="off" spellcheck="false"
        enterkeyhint="go">${state.text}</textarea>
      <div class="input-actions">
        <button type="submit" class="btn btn-primary">${INPUT.submit}</button>
        <button type="button" class="btn btn-secondary" data-action="clear" aria-label="${INPUT.clearLabel}">${INPUT.clear}</button>
        <span class="kbd-hint">${INPUT.shortcut}</span>
      </div>
      <p class="input-message${message ? ` is-${message.kind}` : ''}" role="status">${message?.text ?? ''}</p>
    </form>
    ${loadStatus(state)}
    <div class="examples">
      <p class="examples-label" id="examples-label">${INPUT.examplesLabel}</p>
      <ul class="chips" aria-labelledby="examples-label">
        ${INPUT.examples.map(
          (text, i) => html`<li><button type="button" class="chip" data-action="example" data-index="${i}">${text}</button></li>`,
        )}
      </ul>
    </div>
    <p class="privacy-note">${INPUT.privacy}</p>
  </section>`;
}
