/**
 * M13 資訊量：這則預言的 bits 和幾個生活事件並排（橫條越長越難猜中）。
 * 生活事件取自 ANALOGIES（精確機率），bits = −log₂ p。
 */
import { ANALOGIES } from '../../core/constants';
import { M13, UNITS } from '../../copy/zh-TW';
import { analogyText, formatBits, formatPercent } from '../format';
import { html, type SafeHtml } from '../html';
import { barPath, fx, srTable, svgRoot } from './svg';

/** 並排比較的生活事件（由易到難） */
export const BITS_REFERENCES: readonly string[] = ['coin', 'six', 'birth-month', 'card', 'birthday', 'ten-heads', 'twenty-heads'];

interface Row {
  label: string;
  p: number;
  bits: number;
  claim: boolean;
}

export function bitsChart(p: number, bits: number, width: number): SafeHtml {
  const rows: Row[] = [];
  for (const id of BITS_REFERENCES) {
    const a = ANALOGIES.find((x) => x.id === id);
    if (a) rows.push({ label: analogyText(a.id), p: a.p, bits: -Math.log2(a.p), claim: false });
  }
  rows.push({ label: M13.thisClaim, p, bits, claim: true });
  rows.sort((a, b) => a.bits - b.bits || (a.claim ? -1 : 1));

  const finite = rows.map((r) => r.bits).filter((b) => Number.isFinite(b));
  const maxBits = Math.max(1, ...finite);
  const valueW = 74;
  const x0 = 2;
  const plotW = width - x0 - valueW;
  const rowH = 38;
  const height = rows.length * rowH + 4;

  const body = rows.map((r, i) => {
    const top = i * rowH;
    const w = Number.isFinite(r.bits) ? (r.bits / maxBits) * plotW : plotW;
    return html`<g>
      <text class="small-label${r.claim ? ' bits-claim-label' : ''}" x="${x0}" y="${fx(top + 13)}">${r.label}</text>
      <path class="bits-bar${r.claim ? ' is-claim' : ''}" d="${barPath(x0, top + 18, Math.max(w, 2), 12)}"/>
      <text class="small-label${r.claim ? ' bits-claim-label' : ''}" x="${fx(x0 + Math.max(w, 2) + 6)}" y="${fx(top + 28.5)}">${UNITS.bits(formatBits(r.bits))}</text>
    </g>`;
  });

  const table = srTable(
    M13.tableCaption,
    M13.tableHead,
    rows.map((r) => [r.label, formatPercent(r.p), formatBits(r.bits)]),
  );
  return html`${svgRoot(width, height, M13.chartAria(formatBits(bits)), body)}${table}`;
}
