/**
 * 結果總覽：主數字（或解讀光譜）、生活換算、算命師等級、模型共識、灌水成分、
 * 要連中幾次才值得相信、資訊量、複製結果。
 *
 * 文案一律是「就算隨便亂猜也會中的機率」，不寫成「發生地震的機率」。
 */
import type { AppState } from '../app/state';
import { DEFAULT_BUFFER_KM } from '../core/constants';
import type { DataBundle, Factor, RegionSpec, Results, SizeSpec } from '../core/types';
import { OVERVIEW } from '../copy/zh-TW';
import { hitRate, level } from '../modes/index';
import { consensusChart } from './charts/consensus';
import { spectrumChart, spectrumLegend } from './charts/spectrum';
import {
  analogyLine,
  describeClaim,
  formatBits,
  formatFixed,
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
import { officialSpectrumId } from './official';

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
    <p class="every-n">${everyN(h.p)}</p>
    <p class="headline-sub">${OVERVIEW.empiricalSub(years, from, to, p)}</p>`;
}

/** 「平均每猜 N 次，就會中 1 次」：N = 1 ÷ p；9 成以上直接說幾乎每次都會中 */
export function everyN(p: number): string {
  if (p >= 0.9) return OVERVIEW.everyNAlmost;
  const n = 1 / p;
  return OVERVIEW.everyN(n < 10 ? formatFixed(n, 1) : formatInt(n));
}

// ================================================================ 對照組

interface Reference {
  key: keyof typeof OVERVIEW.compareRefs;
  region: RegionSpec;
  size: SizeSpec;
  days: number;
}

/** 對照用的幾句預言：由寬鬆到精確，讓使用者知道這則預言的命中率算高還是低 */
const REFERENCES: readonly Reference[] = [
  { key: 'weekFelt', region: { kind: 'taiwan' }, size: { kind: 'intensity', value: 1 }, days: 7 },
  { key: 'monthM5', region: { kind: 'taiwan' }, size: { kind: 'magnitude', value: 5, tolerance: 'strict' }, days: 30 },
  {
    key: 'weekHualienM6',
    region: { kind: 'counties', ids: ['U'], bufferKm: DEFAULT_BUFFER_KM },
    size: { kind: 'magnitude', value: 6, tolerance: 'strict' },
    days: 7,
  },
  {
    key: 'dayTaipeiM6',
    region: { kind: 'counties', ids: ['A'], bufferKm: DEFAULT_BUFFER_KM },
    size: { kind: 'magnitude', value: 6, tolerance: 'strict' },
    days: 1,
  },
  { key: 'yearM7', region: { kind: 'taiwan' }, size: { kind: 'magnitude', value: 7, tolerance: 'strict' }, days: 365 },
];

interface ReferenceRate {
  label: string;
  p: number;
  /** 用來判斷「這則預言就是其中一句」 */
  spec: string;
}

/** 對照組和預言無關，每份資料只算一次 */
const referenceCache = new WeakMap<DataBundle, ReferenceRate[]>();

/** 震度型的預言不套用地點（資料只有全台最大震度），所以地點不同也算同一句 */
function specKey(region: RegionSpec, size: SizeSpec): string {
  return JSON.stringify([size.kind === 'intensity' ? { kind: 'taiwan' } : region, size]);
}

function referenceRates(data: DataBundle): ReferenceRate[] {
  let rows = referenceCache.get(data);
  if (!rows) {
    rows = REFERENCES.map((r) => ({
      label: OVERVIEW.compareRefs[r.key],
      p: hitRate(r.region, r.size, r.days, data).p,
      spec: specKey(r.region, r.size),
    }));
    referenceCache.set(data, rows);
  }
  return rows;
}

function compareSection(results: Results, data: DataBundle | null): SafeHtml {
  const h = results.headline;
  if (!data || h.source !== 'empirical' || h.p === null) return html``;
  const p = h.p;
  const mine = specKey(results.claim.region, results.claim.size);
  // 這則預言和某一句對照組一模一樣（同地點、同大小、同機率）時，只列這則預言，不重複
  const refs = referenceRates(data).filter((r) => !(r.spec === mine && r.p === p));
  const rows = [
    ...refs.map((r) => ({ label: r.label, p: r.p, current: false })),
    { label: `${describeClaim(results.claim)}${OVERVIEW.compareThis}`, p, current: true },
  ].sort((a, b) => b.p - a.p);
  return html`<section class="ov-section" aria-labelledby="ov-compare">
    <h3 class="section-title" id="ov-compare">${OVERVIEW.compareTitle}</h3>
    <p class="ov-help">${OVERVIEW.compareHelp}</p>
    <ol class="compare-list">
      ${rows.map(
        (r) => html`<li class="compare-row${r.current ? ' is-current' : ''}"${r.current ? html` aria-current="true"` : ''}>
          <span class="compare-bar" aria-hidden="true"><span style="width:${Math.max(1, Math.round(r.p * 100))}%"></span></span>
          <span class="compare-p">${formatPercent(r.p)}</span>
          <span class="compare-label">${r.label}</span>
          <span class="compare-level">${levelName(level(r.p))}</span>
        </li>`,
      )}
    </ol>
  </section>`;
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

function spectrumSection(results: Results, width: number, officialId: string | null): SafeHtml {
  return html`<section class="ov-section" aria-label="${OVERVIEW.spectrumLead}">
    ${spectrumChart(results.spectrum.items, results.claim.size, width, officialId)}
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
      <p class="not-forecast-callout">${OVERVIEW.notForecast}</p>
      ${analogyAndLevel(results)}
    </div>
    ${unspecified ? spectrumSection(results, width, officialSpectrumId(state)) : ''}
    ${compareSection(results, state.data)}
    ${consensusSection(results, width)}
    ${unspecified ? '' : factorsSection(results)}
    ${bayesSection(results)}
    ${infoSection(results)}
    ${actionsSection(state)}
  </section>`;
}
