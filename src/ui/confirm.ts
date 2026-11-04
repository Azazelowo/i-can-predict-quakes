/**
 * 確認卡「我們這樣理解這則預言」：時間、地點、大小各一列，每一列都能直接改；
 * 原文用 <mark> 標出被解讀的片段（每個欄位一種顏色）；下方是小提醒（旗標）。
 *
 * 這裡只產生標記；修改的邏輯在 src/app/edit.ts（時間窗一律交給 windowFor 計算）。
 */
import { TIME_PRESETS, MAGNITUDE_CHOICES, regionValue, usesDates, usesDays } from '../app/edit';
import { visibleFlags } from '../app/notes';
import type { AppState, SpanSlot } from '../app/state';
import { BUFFER_CHOICES_KM, INTENSITY_VALUES, MAX_WINDOW_DAYS } from '../core/constants';
import { COUNTIES, GROUPS, groupById } from '../core/regions';
import type { Claim, SizeSpec, TimeKind } from '../core/types';
import { CONFIRM, REGION, SIZE, TIME, flagText } from '../copy/zh-TW';
import {
  countyNames,
  describeClaim,
  formatMagnitude,
  formatMagnitudeSaid,
  formatRegion,
  formatSize,
  formatWindowSummary,
  intensityName,
  lenientThreshold,
  timeLabel,
} from './format';
import { highlightHtml, slotsUsed } from './highlight';
import { flag, html, type SafeHtml } from './html';

const PRESET_LABELS: Readonly<Partial<Record<TimeKind, string>>> = TIME.presets;

function editedTag(state: AppState, slot: SpanSlot): SafeHtml {
  return state.edited.has(slot) ? html`<span class="slot-edited">${CONFIRM.edited}</span>` : html``;
}

function slotHead(state: AppState, slot: 'time' | 'region' | 'size', value: string): SafeHtml {
  return html`<div class="slot-head">
    <span class="slot-name" id="slot-${slot}-name">${CONFIRM.slotNames[slot]}</span>
    <span class="slot-value" id="slot-${slot}-value">${value}</span>
    ${editedTag(state, slot)}
  </div>`;
}

// ================================================================ 原文

function originalBlock(state: AppState, claim: Claim): SafeHtml {
  if (state.source && !state.fromLink) {
    const { text, parse } = state.source;
    const used = slotsUsed(parse.spans);
    return html`<div class="original">
      <p class="original-label">${CONFIRM.originalLabel}</p>
      <p class="original-text">${highlightHtml(text, parse.spans, state.edited)}</p>
      ${used.length > 0
        ? html`<ul class="hl-legend" aria-label="${CONFIRM.legendLabel}">
            ${used.map((slot) => html`<li><span class="hl-swatch hl-${slot}" aria-hidden="true"></span>${CONFIRM.slotNames[slot]}</li>`)}
          </ul>`
        : ''}
    </div>`;
  }
  // 從分享連結打開：沒有原文，只顯示由 Claim 產生的描述
  return html`<div class="original">
    <p class="original-label">${CONFIRM.fromLink}</p>
    <p class="original-text">${describeClaim(claim)}</p>
  </div>`;
}

// ================================================================ 時間

function timeSlot(state: AppState, claim: Claim): SafeHtml {
  const { time, issuedAt } = claim;
  const inPresets = TIME_PRESETS.includes(time.kind);
  const error = state.timeError ? TIME.errors[state.timeError] : '';
  return html`<div class="slot slot-time" role="group" aria-labelledby="slot-time-name slot-time-value">
    ${slotHead(state, 'time', formatWindowSummary(time, issuedAt))}
    <div class="slot-controls">
      <label class="control">
        <span class="control-label">${TIME.presetLabel}</span>
        <select data-action="time-kind">
          ${inPresets ? '' : html`<option value="current" selected>${TIME.current(timeLabel(time, issuedAt))}</option>`}
          ${TIME_PRESETS.map(
            (kind) => html`<option value="${kind}"${flag('selected', inPresets && kind === time.kind)}>${PRESET_LABELS[kind] ?? kind}</option>`,
          )}
        </select>
      </label>
      ${usesDays(time.kind)
        ? html`<label class="control">
            <span class="control-label">${TIME.daysLabel}</span>
            <input type="number" inputmode="numeric" min="1" max="${MAX_WINDOW_DAYS}" step="1" value="${time.days}" data-action="time-days">
          </label>`
        : ''}
      ${usesDates(time.kind)
        ? html`<label class="control">
            <span class="control-label">${TIME.startLabel}</span>
            <input type="date" value="${time.start}" data-action="time-start" required>
          </label>
          <label class="control">
            <span class="control-label">${TIME.endLabel}</span>
            <input type="date" value="${time.end}" data-action="time-end" required>
          </label>`
        : ''}
      <label class="control">
        <span class="control-label">${TIME.issuedLabel}</span>
        <input type="date" value="${issuedAt}" data-action="issued" required>
      </label>
    </div>
    <p class="field-error" role="alert">${error}</p>
  </div>`;
}

// ================================================================ 地點

function regionSlot(state: AppState, claim: Claim, map: SafeHtml): SafeHtml {
  const region = claim.region;
  const value = regionValue(region);
  const bufferKm = region.kind === 'counties' ? region.bufferKm : null;
  const buffers: number[] = [...BUFFER_CHOICES_KM];
  if (bufferKm !== null && !buffers.includes(bufferKm)) buffers.push(bufferKm);
  buffers.sort((a, b) => a - b);
  const group = region.kind === 'counties' && region.group ? groupById(region.group) : undefined;
  return html`<div class="slot slot-region" role="group" aria-labelledby="slot-region-name slot-region-value">
    ${slotHead(state, 'region', formatRegion(region))}
    <div class="slot-controls">
      <label class="control">
        <span class="control-label">${REGION.selectLabel}</span>
        <select data-action="region">
          ${value === null && region.kind === 'counties'
            ? html`<option value="current" selected>${REGION.current(countyNames(region.ids))}</option>`
            : ''}
          <optgroup label="${REGION.optgroups.taiwan}">
            <option value="tw"${flag('selected', value === 'tw')}>${REGION.taiwanOption}</option>
          </optgroup>
          <optgroup label="${REGION.optgroups.groups}">
            ${GROUPS.map((g) => html`<option value="g:${g.id}"${flag('selected', value === `g:${g.id}`)}>${g.name}</option>`)}
          </optgroup>
          <optgroup label="${REGION.optgroups.counties}">
            ${COUNTIES.map((c) => html`<option value="c:${c.id}"${flag('selected', value === `c:${c.id}`)}>${c.name}</option>`)}
          </optgroup>
        </select>
      </label>
      ${bufferKm !== null
        ? html`<label class="control">
            <span class="control-label">${REGION.bufferLabel}</span>
            <select data-action="buffer">
              ${buffers.map((km) => html`<option value="${km}"${flag('selected', km === bufferKm)}>${REGION.bufferOption(km)}</option>`)}
            </select>
          </label>`
        : ''}
    </div>
    ${group ? html`<p class="control-help">${REGION.groupMembers(group.name, countyNames(group.ids))}</p>` : ''}
    ${bufferKm !== null ? html`<p class="control-help">${REGION.bufferHelp}</p>` : ''}
    ${map}
  </div>`;
}

// ================================================================ 大小

const SIZE_KINDS: readonly SizeSpec['kind'][] = ['magnitude', 'intensity', 'unspecified'];

function valueOptions(size: SizeSpec): SafeHtml {
  if (size.kind === 'magnitude') {
    const extra = MAGNITUDE_CHOICES.includes(size.value) ? [] : [size.value];
    return html`${[...extra, ...MAGNITUDE_CHOICES].map(
      (v) => html`<option value="${v}"${flag('selected', v === size.value)}>${SIZE.magnitudeOption(formatMagnitude(v))}</option>`,
    )}`;
  }
  if (size.kind === 'intensity') {
    const values: number[] = [...INTENSITY_VALUES];
    const extra = values.includes(size.value) ? [] : [size.value];
    return html`${[...extra, ...values].map(
      (v) => html`<option value="${v}"${flag('selected', v === size.value)}>${SIZE.intensityOption(intensityName(v))}</option>`,
    )}`;
  }
  return html``;
}

function sizeSlot(state: AppState, claim: Claim): SafeHtml {
  const size = claim.size;
  return html`<div class="slot slot-size" role="group" aria-labelledby="slot-size-name slot-size-value">
    ${slotHead(state, 'size', formatSize(size))}
    <div class="slot-controls">
      <fieldset class="segmented">
        <legend class="sr-only">${SIZE.kindLegend}</legend>
        ${SIZE_KINDS.map(
          (kind) => html`<input type="radio" name="size-kind" id="size-kind-${kind}" value="${kind}" data-action="size-kind"${flag('checked', size.kind === kind)}><label for="size-kind-${kind}">${SIZE.kinds[kind]}</label>`,
        )}
      </fieldset>
      ${size.kind !== 'unspecified'
        ? html`<label class="control">
            <span class="control-label">${SIZE.valueLabel}</span>
            <select data-action="size-value">${valueOptions(size)}</select>
          </label>`
        : ''}
    </div>
    ${size.kind === 'magnitude'
      ? html`<fieldset class="radio-list">
          <legend class="control-label">${SIZE.toleranceLegend}</legend>
          <input type="radio" name="tolerance" id="tolerance-strict" value="strict" data-action="tolerance"${flag('checked', size.tolerance === 'strict')}>
          <label for="tolerance-strict">${SIZE.strict(formatMagnitudeSaid(size.value), formatMagnitude(size.value))}</label>
          <input type="radio" name="tolerance" id="tolerance-lenient" value="lenient" data-action="tolerance"${flag('checked', size.tolerance === 'lenient')}>
          <label for="tolerance-lenient">${SIZE.lenient(formatMagnitudeSaid(size.value), formatMagnitude(lenientThreshold(size.value)))}</label>
        </fieldset>`
      : ''}
    ${size.kind === 'unspecified' ? html`<p class="control-help">${SIZE.unspecifiedHelp}</p>` : ''}
  </div>`;
}

// ================================================================ 小提醒

function notesBlock(state: AppState, claim: Claim): SafeHtml {
  const flags = visibleFlags(state.notes, state.results?.flags ?? []);
  if (flags.length === 0) return html``;
  return html`<div class="notes">
    <p class="notes-title">${CONFIRM.notesTitle}</p>
    <ul>${flags.map((f) => html`<li>${flagText(f, claim.time.days)}</li>`)}</ul>
  </div>`;
}

// ================================================================ 整張卡

export function confirmCardHtml(state: AppState, map: SafeHtml): SafeHtml {
  const claim = state.claim;
  if (!claim) return html``;
  return html`<section class="card confirm" id="confirm-card" aria-labelledby="confirm-title" tabindex="-1">
    <h2 class="card-title" id="confirm-title">${CONFIRM.title}</h2>
    <p class="card-intro">${CONFIRM.intro}</p>
    ${originalBlock(state, claim)}
    ${timeSlot(state, claim)}
    ${regionSlot(state, claim, map)}
    ${sizeSlot(state, claim)}
    ${notesBlock(state, claim)}
  </section>`;
}
