/**
 * 手寫 SVG 圖表的共用小工具。
 *
 * 設計：
 * - 圖表依「實際的容器寬度」產生 viewBox（1 單位 = 1 CSS px），所以字級在手機和桌機上都一樣大；
 *   視窗寬度改變時由 app 重畫。SVG 本身 width = 100%，萬一寬度有些微差異也只是等比例縮放。
 * - 顏色一律用 CSS class（樣式在 styles.css，透過 CSS 變數支援深色模式），不寫死色碼。
 * - 每張圖 role="img" + aria-label 摘要，另附視覺上隱藏的表格。
 */
import { html, type HtmlValue, type SafeHtml } from '../html';

/** 座標四捨五入到 0.1，縮短字串 */
export function fx(x: number): string {
  return String(Math.round(x * 10) / 10);
}

/** 粗估文字寬度（px）：中日韓字元約 1em，其他約 0.58em。 */
export function textWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x2e80) w += fontSize;
    else if (ch === ' ') w += fontSize * 0.3;
    else w += fontSize * 0.58;
  }
  return w;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/** 線性比例尺 */
export function scale(d0: number, d1: number, r0: number, r1: number): (x: number) => number {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (x: number) => r0 + (x - d0) * k;
}

export function svgRoot(width: number, height: number, label: string, body: HtmlValue, extraClass = ''): SafeHtml {
  return html`<svg class="chart-svg${extraClass ? ` ${extraClass}` : ''}" viewBox="0 0 ${fx(width)} ${fx(height)}" width="100%" role="img" aria-label="${label}" focusable="false">${body}</svg>`;
}

/** 視覺上隱藏、給螢幕報讀器的表格（第一欄是列標題） */
export function srTable(caption: string, head: readonly string[], rows: readonly (readonly string[])[]): SafeHtml {
  return html`<table class="sr-only"><caption>${caption}</caption><thead><tr>${head.map(
    (h) => html`<th scope="col">${h}</th>`,
  )}</tr></thead><tbody>${rows.map(
    (row) => html`<tr>${row.map((cell, i) => (i === 0 ? html`<th scope="row">${cell}</th>` : html`<td>${cell}</td>`))}</tr>`,
  )}</tbody></table>`;
}

/** 直條：底部方角、頂端 4px 圓角（資料端圓角） */
export function columnPath(x: number, baseY: number, w: number, h: number, radius = 4): string {
  if (h <= 0 || w <= 0) return '';
  const r = Math.min(radius, w / 2, h);
  const top = baseY - h;
  return `M${fx(x)} ${fx(baseY)}V${fx(top + r)}Q${fx(x)} ${fx(top)} ${fx(x + r)} ${fx(top)}H${fx(x + w - r)}Q${fx(x + w)} ${fx(top)} ${fx(x + w)} ${fx(top + r)}V${fx(baseY)}Z`;
}

/** 橫條：左邊方角、右端 4px 圓角 */
export function barPath(x: number, y: number, w: number, h: number, radius = 4): string {
  if (h <= 0 || w <= 0) return '';
  const r = Math.min(radius, h / 2, w);
  const right = x + w;
  return `M${fx(x)} ${fx(y)}H${fx(right - r)}Q${fx(right)} ${fx(y)} ${fx(right)} ${fx(y + r)}V${fx(y + h - r)}Q${fx(right)} ${fx(y + h)} ${fx(right - r)} ${fx(y + h)}H${fx(x)}Z`;
}

/** 0–100% 的刻度 */
export const PERCENT_TICKS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

/** 刻度文字對齊：兩端靠邊，中間置中，避免被裁掉 */
export function tickAnchor(i: number, n: number): 'start' | 'middle' | 'end' {
  if (i === 0) return 'start';
  if (i === n - 1) return 'end';
  return 'middle';
}

/** 整數軸的刻度間距：讓相鄰標籤至少相隔 minGap px */
export function integerStep(count: number, pxPerUnit: number, minGap = 28): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const s of steps) if (s * pxPerUnit >= minGap) return s;
  return Math.max(1, Math.ceil(count / 4));
}

/** 機率軸（0 到 max）的漂亮刻度 */
export function probabilityTicks(max: number): number[] {
  const candidates = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5];
  const step = candidates.find((s) => max / s <= 4) ?? 0.25;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9 && ticks.length < 8; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}
