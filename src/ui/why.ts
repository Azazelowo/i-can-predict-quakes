/**
 * 「為什麼預言常常看起來很準？」：把網站在算的事濃縮成五個原因，放在頁尾前面，誰都看得到。
 * 第一點的數字由資料計算（AGENTS.md 規則 1：數字只由程式產生）；資料還沒載入時只顯示文字。
 */
import { TAIWAN_BOX } from '../core/constants';
import { localDay } from '../core/time';
import type { DataBundle } from '../core/types';
import { WHY } from '../copy/zh-TW';
import { formatFixed, formatInt } from './format';
import { html, type SafeHtml } from './html';

/** 台灣及近海、ML ≥ 5.0 的平均年發生次數（和 M2 的 λ 同一個定義） */
function yearlyRate(data: DataBundle): { years: number; rate: number } {
  const { lat, lon, ml } = data.catalog;
  let n = 0;
  for (let i = 0; i < ml.length; i++) {
    const la = lat[i]!;
    const lo = lon[i]!;
    if (ml[i]! >= 5 && la >= TAIWAN_BOX.latMin && la <= TAIWAN_BOX.latMax && lo >= TAIWAN_BOX.lonMin && lo <= TAIWAN_BOX.lonMax) n++;
  }
  const years = (localDay(data.meta.period.endUnix) - localDay(data.meta.period.startUnix)) / 365.25;
  return { years, rate: n / years };
}

const cache = new WeakMap<DataBundle, { years: number; rate: number }>();

export function whyHtml(data: DataBundle | null): SafeHtml {
  let first: string = WHY.quakesTextLoading;
  if (data) {
    let r = cache.get(data);
    if (!r) {
      r = yearlyRate(data);
      cache.set(data, r);
    }
    first = WHY.quakesText(formatInt(Math.round(r.years)), formatFixed(r.rate, 0));
  }
  const items = [{ icon: '🌋', title: WHY.quakesTitle, text: first }, ...WHY.items];
  return html`<section class="why" aria-labelledby="why-title">
    <h2 class="why-title" id="why-title">${WHY.title}</h2>
    <p class="why-intro">${WHY.intro}</p>
    <ol class="why-list">
      ${items.map(
        (item) => html`<li class="why-item">
          <span class="why-icon" aria-hidden="true">${item.icon}</span>
          <div><p class="why-item-title">${item.title}</p><p class="why-item-text">${item.text}</p></div>
        </li>`,
      )}
    </ol>
  </section>`;
}
