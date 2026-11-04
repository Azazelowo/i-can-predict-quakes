/**
 * M1 日曆熱圖：從資料期間第一天起每 T 天一格（不重疊），塗色 = 那段期間真的發生了。
 *
 * - T ≤ 120 天：每列一年、每欄是該年的第幾格（第 c 格從當年 1/1 起第 c·T 天附近開始）。
 * - T > 120 天：一年放不下兩格以上，改成一整列方塊。
 * 格子很窄時（例如 T = 1，一年 365 欄），相鄰的命中格合併成一個矩形，SVG 節點數維持在幾百個。
 */
import { firstDayOfMonth, yearOfDay } from '../../core/time';
import type { PeriodInfo, ReplayResult } from '../../core/types';
import { M1, TIME } from '../../copy/zh-TW';
import { formatInt, formatPercent } from '../format';
import { html, type SafeHtml } from '../html';
import { clamp, fx, srTable, svgRoot } from './svg';

/** 超過這個天數就改成一整列方塊 */
const ROW_LAYOUT_MAX_DAYS = 120;

interface Cell {
  row: number;
  col: number;
  hit: boolean;
}

function legend(): SafeHtml {
  return html`<ul class="chart-legend">
    <li><span class="legend-swatch" style="--swatch: var(--accent)" aria-hidden="true"></span>${M1.legendHit}</li>
    <li><span class="legend-swatch" style="--swatch: var(--track)" aria-hidden="true"></span>${M1.legendMiss}</li>
  </ul>`;
}

/** 同一列連續的命中格合併成 [起始欄, 結束欄]（含） */
function runs(cols: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const c of [...cols].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && c === last[1] + 1) last[1] = c;
    else out.push([c, c]);
  }
  return out;
}

function yearGrid(slots: readonly number[], T: number, startDay: number, width: number): { body: SafeHtml; height: number } {
  const firstYear = yearOfDay(startDay);
  const cells: Cell[] = slots.map((h, s) => {
    const d = startDay + s * T;
    const year = yearOfDay(d);
    return { row: year - firstYear, col: Math.floor((d - firstDayOfMonth(year, 1)) / T), hit: h === 1 };
  });
  const rows = (cells[cells.length - 1]?.row ?? 0) + 1;
  const cols = Math.ceil(366 / T);
  const labelW = 38;
  const topH = 18;
  const gridW = width - labelW - 2;
  const cellW = gridW / cols;
  const rowH = clamp(Math.round(cellW), 8, 14);
  const gap = 2;
  const height = topH + rows * (rowH + gap) + 2;
  const separate = cellW >= 3;

  const lastCol = new Array<number>(rows).fill(-1);
  const hitCols: number[][] = Array.from({ length: rows }, () => []);
  for (const c of cells) {
    lastCol[c.row] = Math.max(lastCol[c.row] ?? -1, c.col);
    if (c.hit) hitCols[c.row]?.push(c.col);
  }

  const parts: SafeHtml[] = [];
  // 月份刻度（1、4、7、10 月）
  for (const m of [1, 4, 7, 10]) {
    const offset = firstDayOfMonth(2001, m) - firstDayOfMonth(2001, 1);
    const x = labelW + (offset / T) * cellW;
    parts.push(html`<text class="tick" x="${fx(x)}" y="12">${TIME.month(String(m))}</text>`);
  }
  for (let r = 0; r < rows; r++) {
    const y = topH + r * (rowH + gap);
    const year = firstYear + r;
    if (r === 0 || year % 5 === 0 || r === rows - 1) {
      parts.push(html`<text class="tick" x="0" y="${fx(y + rowH / 2 + 4)}">${year}</text>`);
    }
    const end = lastCol[r] ?? -1;
    if (end < 0) continue;
    parts.push(html`<rect class="hm-miss" x="${fx(labelW)}" y="${fx(y)}" width="${fx((end + 1) * cellW - (separate ? 1 : 0))}" height="${rowH}" rx="2"/>`);
    const cols = hitCols[r] ?? [];
    if (separate) {
      for (const c of cols) {
        parts.push(html`<rect class="hm-hit" x="${fx(labelW + c * cellW)}" y="${fx(y)}" width="${fx(cellW - 1)}" height="${rowH}" rx="1"/>`);
      }
    } else {
      for (const [a, b] of runs(cols)) {
        parts.push(html`<rect class="hm-hit" x="${fx(labelW + a * cellW)}" y="${fx(y)}" width="${fx((b - a + 1) * cellW)}" height="${rowH}"/>`);
      }
    }
  }
  return { body: html`${parts}`, height };
}

function blockRow(slots: readonly number[], T: number, startDay: number, width: number): { body: SafeHtml; height: number } {
  const n = slots.length;
  const blockW = width / Math.max(1, n);
  const blockH = 30;
  const separate = blockW >= 4;
  const parts: SafeHtml[] = [];
  slots.forEach((h, i) => {
    const x = i * blockW;
    parts.push(html`<rect class="${h === 1 ? 'hm-hit' : 'hm-miss'}" x="${fx(x)}" y="0" width="${fx(separate ? blockW - 2 : blockW)}" height="${blockH}" rx="${separate ? 3 : 0}"/>`);
  });
  // 起訖年份標籤（第一格與最後一格的開始年份）
  const firstYear = yearOfDay(startDay);
  const lastStart = startDay + (n - 1) * T;
  parts.push(html`<text class="tick" x="0" y="${blockH + 15}">${firstYear}</text>`);
  if (n > 1) {
    parts.push(html`<text class="tick" x="${fx(width)}" y="${blockH + 15}" text-anchor="end">${yearOfDay(lastStart)}</text>`);
  }
  return { body: html`${parts}`, height: blockH + 20 };
}

export function heatmapChart(rep: ReplayResult, period: PeriodInfo, width: number): SafeHtml {
  const T = rep.windowDays;
  const slots = rep.slots;
  const hits = slots.reduce((sum, h) => sum + h, 0);
  const share = slots.length > 0 ? hits / slots.length : 0;
  const aria = M1.heatmapAria(formatInt(T), formatInt(slots.length), formatInt(hits), formatPercent(share));
  const { body, height } =
    T > ROW_LAYOUT_MAX_DAYS ? blockRow(slots, T, period.startDay, width) : yearGrid(slots, T, period.startDay, width);
  const table = srTable(
    M1.tableCaption,
    M1.tableHead,
    rep.byYear.map((b) => [String(b.year), formatInt(b.hits), formatInt(b.windows), formatPercent(b.windows > 0 ? b.hits / b.windows : 0)]),
  );
  return html`${svgRoot(width, height, aria, body)}${legend()}${table}`;
}
