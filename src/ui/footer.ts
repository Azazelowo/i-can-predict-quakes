/**
 * 頁尾：免責聲明（頁首「這不是地震預報」連到這裡）、隱私說明、資料來源與授權（由 meta.json 產生）、連結。
 */
import { CWA_URL, METHODS_URL, REPO_URL } from '../app/config';
import type { Meta } from '../core/types';
import { FOOTER } from '../copy/zh-TW';
import { formatFixed, formatInt } from './format';
import { html, type SafeHtml } from './html';

/** 授權文字裡的 https 網址變成連結（其餘文字照常跳脫）。 */
export function linkify(text: string): SafeHtml {
  const parts = text.split(/(https:\/\/[^\s，。、）)」]+)/);
  return html`${parts.map((part, i) =>
    i % 2 === 1 ? html`<a href="${part}" rel="noopener noreferrer">${part}</a>` : part,
  )}`;
}

function dataSources(meta: Meta | null): SafeHtml {
  if (!meta) return html`<p class="muted">${FOOTER.loading}</p>`;
  return html`<ul class="data-list">
      <li>${FOOTER.period(meta.period.start, meta.period.end, meta.period.timezone)}</li>
      <li>${FOOTER.catalog(meta.catalog.source, formatInt(meta.catalog.count), meta.catalog.magnitudeType, formatFixed(meta.catalog.minML, 1))}</li>
      <li>${FOOTER.felt(meta.felt.source, formatInt(meta.felt.count))}</li>
      <li>${FOOTER.counties(meta.counties.source)}</li>
    </ul>
    <h3 class="footer-title footer-subtitle">${FOOTER.licensesTitle}</h3>
    <ul class="data-list">${meta.licenses.map((text) => html`<li>${linkify(text)}</li>`)}</ul>`;
}

export function footerHtml(meta: Meta | null): SafeHtml {
  return html`<div class="wrap footer-grid">
    <section class="disclaimer-box" aria-labelledby="disclaimer-title">
      <h2 class="footer-title" id="disclaimer-title">${FOOTER.disclaimerTitle}</h2>
      <p>${FOOTER.disclaimer}</p>
      <p>${FOOTER.privacy}</p>
    </section>
    <section aria-labelledby="data-title">
      <h2 class="footer-title" id="data-title">${FOOTER.dataTitle}</h2>
      ${dataSources(meta)}
    </section>
    <nav aria-labelledby="resources-title">
      <h2 class="footer-title" id="resources-title">${FOOTER.resourcesTitle}</h2>
      ${FOOTER.resources.map(
        (group) => html`<h3 class="footer-title footer-subtitle">${group.group}</h3>
          <ul class="data-list resource-list">
            ${group.items.map((item) => html`<li><a href="${item.url}" rel="noopener noreferrer">${item.text}</a></li>`)}
          </ul>`,
      )}
    </nav>
    <nav aria-labelledby="links-title">
      <h2 class="footer-title" id="links-title">${FOOTER.linksTitle}</h2>
      <div class="footer-links">
        <a href="${CWA_URL}" rel="noopener noreferrer">${FOOTER.links.cwa}</a>
        <a href="${METHODS_URL}" rel="noopener noreferrer">${FOOTER.links.methods}</a>
        <a href="${REPO_URL}" rel="noopener noreferrer">${FOOTER.links.source}</a>
        <button type="button" class="btn-link" data-action="terms-open">${FOOTER.termsLink}</button>
      </div>
    </nav>
  </div>`;
}
