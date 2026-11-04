/**
 * M4b 敏感度矩陣：7 個規模門檻 × 7 種天數的表格式熱圖（真正的 <table>，螢幕報讀器可以逐格讀）。
 * 顏色深淺 = 命中率；框起來的格子是這則預言（claimCell）。
 *
 * 顏色用 color-mix 把主色混進底色，混色比例的上限由 CSS 變數 --heat-max 控制（淺色、深色模式不同），
 * 確保格子裡的文字永遠符合 WCAG AA 對比。
 */
import type { MatrixResult } from '../../core/types';
import { M4 } from '../../copy/zh-TW';
import { formatInt, formatMagnitude, formatPercent } from '../format';
import { html, type SafeHtml } from '../html';

/** 命中率 → 0–1 的深淺。用 0.6 次方，讓 1%–10% 之間也看得出差別。 */
export function heatLevel(p: number): number {
  const v = Math.min(Math.max(p, 0), 1) ** 0.6;
  return Math.round(v * 1000) / 1000;
}

export function matrixTable(m: MatrixResult): SafeHtml {
  const cell = m.claimCell;
  return html`<div class="table-wrap">
    <table class="matrix">
      <caption class="sr-only">${M4.matrixCaption}</caption>
      <thead>
        <tr>
          <th scope="col">${M4.matrixCorner}</th>
          ${m.windowDays.map((d) => html`<th scope="col">${M4.matrixDays(formatInt(d))}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${m.magnitudes.map(
          (mag, i) => html`<tr>
            <th scope="row">${M4.matrixMag(formatMagnitude(mag))}</th>
            ${m.windowDays.map((_, j) => {
              const p = m.p[i]?.[j] ?? 0;
              const isClaim = cell !== null && cell[0] === i && cell[1] === j;
              return html`<td class="${isClaim ? 'is-claim' : ''}" style="--heat: ${heatLevel(p)}">${formatPercent(p)}${
                isClaim ? html`<span class="sr-only">${M4.matrixClaim}</span>` : ''
              }</td>`;
            })}
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}
