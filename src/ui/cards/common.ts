/**
 * 模式卡的共用外框：<details>（預設收合、展開狀態由 app 記住），摘要列有代號、標題、
 * 回答的問題、性質標記（【事實】【模型】【假設】）與一個重點數字；
 * 卡片內容只在展開時才產生（收合的卡片不必畫圖，改設定時重算比較快）。
 */
import type { CardId } from '../../app/state';
import { MIN_ML } from '../../core/constants';
import type { BayesParams, DataBundle, Results } from '../../core/types';
import { MODES, NATURE, type Nature } from '../../copy/zh-TW';
import { formatMagnitude, formatRegion, intensityName, lenientThreshold, periodLabels } from '../format';
import { flag, html, type HtmlValue, type SafeHtml } from '../html';

export interface CardContext {
  results: Results;
  data: DataBundle;
  /** 圖表可用寬度（CSS px） */
  width: number;
  /** M10 滑桿的目前設定 */
  bayes: BayesParams;
}

export interface CardSpec {
  id: CardId;
  code: string;
  title: string;
  question: string;
  natures: readonly Nature[];
  /** 摘要列右側的重點數字（沒有就 null） */
  peek: string | null;
  /** 卡片內容（只在展開時呼叫） */
  body: () => SafeHtml;
}

export function natureTag(nature: Nature): SafeHtml {
  const n = NATURE[nature];
  return html`<span class="nature nature-${nature}" title="${n.meaning}">${n.tag}</span>`;
}

/** 標記說明：【事實】由資料直接計數…… */
export function natureLegend(): SafeHtml {
  return html`<p class="nature-legend">
    <span>${MODES.natureLegend}</span>
    ${(Object.keys(NATURE) as Nature[]).map((key) => html`<span>${natureTag(key)} ${NATURE[key].meaning}</span>`)}
  </p>`;
}

const CHEVRON = html`<svg class="chevron" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function cardHtml(spec: CardSpec, open: boolean): SafeHtml {
  return html`<details class="card mode-card" data-card="${spec.id}" data-key="${spec.id}"${flag('open', open)}>
    <summary>
      <span class="mode-code" aria-hidden="true">${spec.code}</span>
      <span class="mode-head">
        <h3 class="mode-title"><span class="sr-only">${spec.code} </span>${spec.title}</h3>
        <span class="mode-q">${spec.question}</span>
        <span class="nature-tags">${spec.natures.map(natureTag)}${spec.peek ? html`<span class="mode-peek">${spec.peek}</span>` : ''}</span>
      </span>
      ${CHEVRON}
    </summary>
    ${open ? html`<div class="mode-body">${spec.body()}</div>` : ''}
  </details>`;
}

// ================================================================ 卡片內容的積木

export function explain(text: string): SafeHtml {
  return html`<p class="mode-explain">${text}</p>`;
}

export function chartBlock(title: string, chart: HtmlValue, help?: string): SafeHtml {
  return html`<figure class="chart-block">
    <figcaption class="chart-title">${title}</figcaption>
    ${chart}
    ${help ? html`<p class="chart-help">${help}</p>` : ''}
  </figure>`;
}

export function formulaBlock(lines: readonly string[]): SafeHtml {
  return html`<div class="formula">
    <p class="formula-title">${MODES.formula}</p>
    <ul>${lines.map((line) => html`<li>${line}</li>`)}</ul>
  </div>`;
}

export function assumptionsBlock(items: readonly string[]): SafeHtml {
  return html`<div class="assumptions">
    <p class="assumptions-title">${MODES.assumptions}</p>
    <ul>${items.map((item) => html`<li>${item}</li>`)}</ul>
  </div>`;
}

/** 看得到的資料表（第一欄是列標題）；rowClass 可替特定列加 class（例如「一年份」那一列）。 */
export function dataTable(
  caption: string,
  head: readonly string[],
  rows: readonly (readonly string[])[],
  opts: { rowClass?: (i: number) => string; textTable?: boolean } = {},
): SafeHtml {
  return html`<div class="table-wrap">
    <table class="data-table${opts.textTable ? ' text-table' : ''}">
      <caption>${caption}</caption>
      <thead><tr>${head.map((h) => html`<th scope="col">${h}</th>`)}</tr></thead>
      <tbody>${rows.map(
        (row, i) => html`<tr class="${opts.rowClass?.(i) ?? ''}">${row.map((cell, j) =>
          j === 0 ? html`<th scope="row">${cell}</th>` : html`<td>${cell}</td>`,
        )}</tr>`,
      )}</tbody>
    </table>
  </div>`;
}

export function sourceLine(...texts: string[]): SafeHtml {
  return html`<p class="source-line">${texts.join(' ')}</p>`;
}

/** 這則預言用到的資料：規模型 → 地震目錄＋地區＋門檻；震度型 → 有感地震；沒說 → 兩者 */
export function claimSourceText(ctx: CardContext): string {
  const { results, data } = ctx;
  const { from, to } = periodLabels(results.period);
  const size = results.claim.size;
  if (size.kind === 'magnitude') {
    const threshold =
      results.replay?.threshold ?? Math.max(MIN_ML, size.tolerance === 'strict' ? size.value : lenientThreshold(size.value));
    return MODES.sourceMagnitude(data.meta.catalog.source, formatRegion(results.claim.region), formatMagnitude(threshold), from, to);
  }
  if (size.kind === 'intensity') {
    return MODES.sourceIntensity(data.meta.felt.source, intensityName(size.value), from, to);
  }
  return MODES.sourceBoth(data.meta.catalog.source, data.meta.felt.source, from, to);
}
