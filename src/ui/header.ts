/**
 * 頁首（網站名稱、標語、「這不是地震預報」連結）與第一次使用時的三步驟說明。
 */
import { LAYOUTS, THEMES, type Prefs } from '../app/prefs';
import { EXPLAINER, PREFS, SITE, TERMS } from '../copy/zh-TW';
import { flag, html, type SafeHtml } from './html';

/** 水晶球裡有一條地震波：算命攤 × 地震儀。顏色走 CSS 變數，深色模式自動切換。 */
export function brandMark(className = 'brand-mark'): SafeHtml {
  return html`<svg class="${className}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <ellipse cx="24" cy="42" rx="13" ry="3.5" style="fill:var(--border-strong)"/>
    <path d="M14 41.5 17 35.5h14l3 6Z" style="fill:var(--accent)"/>
    <circle cx="24" cy="21" r="16" style="fill:var(--accent-soft);stroke:var(--accent);stroke-width:2.5"/>
    <path d="M10.5 22h6l2.5-6 3.5 12 3-15 3 11 2-2h7" style="fill:none;stroke:var(--accent);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"/>
    <circle cx="17" cy="12.5" r="2.6" style="fill:var(--surface);opacity:.85"/>
  </svg>`;
}

/** 主題、版面與使用規範（設定存在這台裝置，見 src/app/prefs.ts） */
function prefsHtml(prefs: Prefs): SafeHtml {
  return html`<div class="prefs" role="group" aria-label="${PREFS.label}">
    <label class="pref">
      <span class="pref-label">${PREFS.themeLabel}</span>
      <select data-action="theme">
        ${THEMES.map((t) => html`<option value="${t}"${flag('selected', t === prefs.theme)}>${PREFS.themes[t]}</option>`)}
      </select>
    </label>
    <label class="pref pref-layout">
      <span class="pref-label">${PREFS.layoutLabel}</span>
      <select data-action="layout" aria-describedby="layout-help">
        ${LAYOUTS.map((l) => html`<option value="${l}"${flag('selected', l === prefs.layout)}>${PREFS.layouts[l]}</option>`)}
      </select>
    </label>
    <span class="sr-only" id="layout-help">${PREFS.layoutHelp}</span>
    <button type="button" class="btn-link" data-action="terms-open">${TERMS.title}</button>
  </div>`;
}

export function headerHtml(prefs: Prefs): SafeHtml {
  return html`<a class="skip-link" href="#main" data-action="skip">${SITE.skipLink}</a>
  <header class="site-header wrap">
    <div class="brand">
      ${brandMark()}
      <h1 class="site-name">${SITE.name}</h1>
    </div>
    <p class="tagline">${SITE.tagline}</p>
    <div class="header-row">
      <a class="not-forecast" href="#disclaimer" data-action="to-disclaimer">${SITE.notForecastLink}</a>
      ${prefsHtml(prefs)}
    </div>
  </header>`;
}

/** 還沒有任何結果時顯示的三步驟 */
export function explainerHtml(visible: boolean): SafeHtml {
  if (!visible) return html``;
  return html`<section class="explainer" aria-labelledby="explainer-title">
    <h2 class="sr-only" id="explainer-title">${EXPLAINER.title}</h2>
    <ol class="steps">
      ${EXPLAINER.steps.map(
        (step, i) => html`<li class="step">
          <span class="step-num" aria-hidden="true">${i + 1}</span>
          <div><p class="step-title"><span class="sr-only">${i + 1}. </span>${step.title}</p><p class="step-text">${step.text}</p></div>
        </li>`,
      )}
    </ol>
  </section>`;
}
