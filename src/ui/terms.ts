/**
 * 使用規範：第一次開啟時一定要先看過並勾選同意（記在這台裝置的瀏覽器裡，見 src/app/prefs.ts）；
 * 之後可以從頁首或頁尾的「使用規範」再打開來看。
 *
 * 無障礙：role="dialog"、aria-modal；打開時頁面其他部分設成 inert（controller），焦點移到對話框。
 */
import { METHODS_URL } from '../app/config';
import { TERMS } from '../copy/zh-TW';
import { flag, html, type SafeHtml } from './html';

export function termsHtml(open: boolean, accepted: boolean, checked: boolean): SafeHtml {
  if (!open) return html``;
  return html`<div class="modal-backdrop">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="terms-title" aria-describedby="terms-intro"
      id="terms-dialog" tabindex="-1">
      <h2 class="modal-title" id="terms-title">${TERMS.title}</h2>
      <p class="modal-intro" id="terms-intro">${TERMS.intro}</p>
      <ol class="terms-list">
        ${TERMS.items.map((item) => html`<li><p class="terms-item-title">${item.title}</p><p>${item.text}</p></li>`)}
      </ol>
      <p class="terms-links">
        <a href="${TERMS.sourceUrl}" rel="noopener noreferrer" target="_blank">${TERMS.sourceLink}</a>
        <a href="${METHODS_URL}" rel="noopener noreferrer" target="_blank">${TERMS.methodsLink}</a>
      </p>
      ${accepted
        ? html`<div class="modal-actions">
            <button type="button" class="btn btn-primary" data-action="terms-close">${TERMS.close}</button>
          </div>`
        : html`<label class="terms-check">
              <input type="checkbox" data-action="terms-check"${flag('checked', checked)} />
              <span>${TERMS.checkbox}</span>
            </label>
            <div class="modal-actions">
              <button type="button" class="btn btn-primary" data-action="terms-accept"${flag('disabled', !checked)}>${TERMS.accept}</button>
            </div>
            <p class="modal-note">${TERMS.memoryNote}</p>`}
    </div>
  </div>`;
}
