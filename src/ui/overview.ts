/**
 * 結果總覽：主數字（或解讀光譜）、生活換算、算命師等級、模型共識、灌水成分、
 * 要連中幾次才值得相信、資訊量、複製結果。
 *
 * 文案一律是「就算隨便亂猜也會中的機率」，不寫成「發生地震的機率」。
 */
import type { AppState } from '../app/state';
import type { Factor, Results } from '../core/types';
import { OVERVIEW } from '../copy/zh-TW';
import { consensusChart } from './charts/consensus';
import { spectrumChart, spectrumLegend } from './charts/spectrum';
import {
  analogyLine,
  describeClaim,
  formatBits,
  formatInt,
  formatPercent,
  formatPercentRange,
  formatPercentSetting,
  formatRatio,
  formatRegion,
  formatSize,
  levelMeaning,
  levelName,
  periodLabels,
} from './format';
import { html, type SafeHtml } from './html';

/** 總覽最多列出幾項灌水成分 */
const MAX_FACTORS = 4;

/** 灌水成分「如果…」的說法（總覽與 M4 共用） */
export function factorChange(f: Factor): string {
  switch (f.dimension) {
    case 'time':
      return OVERVIEW.factorChange.time;
    case 'region':
      return OVERVIEW.factorChange.region(formatRegion(f.alt.region));
    case 'size':
      return OVERVIEW.factorChange.size(formatSize(f.alt.size));
    case 'tolerance':
      return OVERVIEW.factorChange.tolerance(formatSize(f.alt.size));
  }
}

/** 時間：如果只說某一天，命中率從 X 降到 Y（×R）；to = 0 時：收緊後 31 年來從沒發生過 */
export function factorLine(f: Factor, years: string): string {
  const dim = OVERVIEW.factorDims[f.dimension];
  if (f.ratio === null) return OVERVIEW.factorNever(dim, factorChange(f), years);
  return OVERVIEW.factorLine(dim, factorChange(f), formatPercent(f.from), formatPercent(f.to), formatRatio(f.ratio));
}

function headline(results: Results): SafeHtml {
  const { years, from, to } = periodLabels(results.period);
  const h = results.headline;
  if (h.source === 'spectrum' || h.p === null) {
    const [low, high] = h.range ?? [0, 0];
    return html`<p class="headline-lead">${OVERVIEW.spectrumLead}</p>
      <p class="big-number">${formatPercentRange(low, high)}</p>
      <p class="headline-sub">${OVERVIEW.spectrumSub}</p>`;
  }
  const p = formatPercent(h.p);
  if (h.source === 'poisson-upper') {
    return html`<p class="big-number"><span class="prefix">${OVERVIEW.upperPrefix}</span>${p}</p>
      <p class="headline-lead">${OVERVIEW.upperLead(years, p)}</p>
      <p class="headline-sub">${OVERVIEW.upperSub}</p>`;
  }
  return html`<p class="big-number">${p}</p>
    <p class="headline-lead">${OVERVIEW.empiricalLead(p)}</p>
    <p class="headline-sub">${OVERVIEW.empiricalSub(years, from, to, p)}</p>`;
}

function analogyAndLevel(results: Results): SafeHtml {
  if (!results.analogy || !results.level) return html``;
  return html`<div class="analogy-level">
    <div class="pill-box">
      <p class="pill-label">${OVERVIEW.analogyLabel}</p>
      <p class="analogy-text">${analogyLine(results.analogy)}</p>
    </div>
    <div class="pill-box">
      <p class="pill-label">${OVERVIEW.levelLabel}</p>
      <p><span class="level-badge">${levelName(results.level)}</span></p>
      <p class="level-meaning">${levelMeaning(results.level)}</p>
    </div>
  </div>`;
}

function spectrumSection(results: Results, width: number): SafeHtml {
  return html`<section class="ov-section" aria-label="${OVERVIEW.spectrumLead}">
    ${spectrumChart(results.spectrum.items, results.claim.size, width)}
    ${spectrumLegend()}
    <p class="invite">${OVERVIEW.spectrumInvite}</p>
  </section>`;
}

function consensusSection(results: Results, width: number): SafeHtml {
  if (!results.compare) return html``;
  return html`<section class="ov-section" aria-labelledby="ov-consensus">
    <h3 class="section-title" id="ov-consensus">${OVERVIEW.consensusTitle}</h3>
    <p class="ov-help">${OVERVIEW.consensusHelp}</p>
    ${consensusChart(results.compare, width)}
  </section>`;
}

function factorsSection(results: Results): SafeHtml {
  const { years } = periodLabels(results.period);
  const list = results.factors.slice(0, MAX_FACTORS);
  return html`<section class="ov-section" aria-labelledby="ov-factors">
    <h3 class="section-title" id="ov-factors">${OVERVIEW.factorsTitle}</h3>
    <p class="ov-help">${OVERVIEW.factorsHelp}</p>
    ${list.length === 0
      ? html`<p>${OVERVIEW.factorsNone}</p>`
      : html`<ul class="factor-list">
          ${list.map(
            (f) => html`<li class="factor-row">
              <span class="factor-ratio" aria-hidden="true">${f.ratio === null ? '—' : `×${formatRatio(f.ratio)}`}</span>
              <span>${factorLine(f, years)}</span>
            </li>`,
          )}
        </ul>`}
  </section>`;
}

function bayesSection(results: Results): SafeHtml {
  const b = results.bayes;
  if (!b) return html``;
  let body: SafeHtml;
  if (b.hitsNeeded === null) {
    body = html`<p class="big-count">${OVERVIEW.bayesNever}</p><p class="ov-help">${OVERVIEW.bayesNeverDetail}</p>`;
  } else if (b.hitsNeeded === 0) {
    body = html`<p>${OVERVIEW.bayesZero}</p>`;
  } else {
    const k = formatInt(b.hitsNeeded);
    body = html`<p class="big-count">${OVERVIEW.bayesCount(k)}</p>
      <p>${OVERVIEW.bayesLine(formatPercentSetting(b.prior), k, formatPercentSetting(b.target))}</p>`;
  }
  return html`<section class="ov-section" aria-labelledby="ov-bayes">
    <h3 class="section-title" id="ov-bayes">${OVERVIEW.bayesTitle}</h3>
    ${body}
  </section>`;
}

function infoSection(results: Results): SafeHtml {
  const info = results.information;
  if (!info) return html``;
  const bits = formatBits(info.bits);
  return html`<section class="ov-section" aria-labelledby="ov-info">
    <h3 class="section-title" id="ov-info">${OVERVIEW.infoTitle}</h3>
    <p>${info.bits < 1 ? OVERVIEW.infoLineLow(bits) : OVERVIEW.infoLine(bits)}</p>
  </section>`;
}

function actionsSection(state: AppState): SafeHtml {
  const status =
    state.copyStatus === 'copied' ? OVERVIEW.copied : state.copyStatus === 'failed' ? OVERVIEW.copyFailed : '';
  return html`<section class="ov-section">
    <div class="actions">
      <button type="button" class="btn btn-secondary" data-action="copy">${OVERVIEW.copy}</button>
      <span class="copy-status${state.copyStatus === 'failed' ? ' is-failed' : ''}" role="status">${status}</span>
    </div>
    <p class="link-note">${OVERVIEW.linkNote}</p>
  </section>`;
}

export function overviewHtml(state: AppState, results: Results, width: number): SafeHtml {
  const unspecified = results.headline.source === 'spectrum';
  return html`<section class="card overview" id="overview" aria-labelledby="overview-title">
    <div class="overview-top">
      <h2 class="overview-label" id="overview-title">${OVERVIEW.title}</h2>
      <p class="claim-desc">${OVERVIEW.computing}${describeClaim(results.claim)}</p>
      <div class="headline" id="headline" tabindex="-1" aria-live="polite" aria-atomic="true">${headline(results)}</div>
      ${analogyAndLevel(results)}
    </div>
    ${unspecified ? spectrumSection(results, width) : ''}
    ${consensusSection(results, width)}
    ${unspecified ? '' : factorsSection(results)}
    ${bayesSection(results)}
    ${infoSection(results)}
    ${actionsSection(state)}
  </section>`;
}
