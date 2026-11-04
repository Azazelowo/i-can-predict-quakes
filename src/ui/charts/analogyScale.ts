/**
 * M12 生活機率尺：16 個精確機率的生活事件排在一條直的刻度上，這則預言標在它的位置。
 *
 * 刻度用 logit（勝算的對數）：1/1,048,576 和 1023/1024 都能放進同一張圖，
 * 而且和 M12 選「最接近的事件」用的是同一個距離（|logit(p) − logit(a)|）。
 * 很多事件擠在 1/6～5/6 附近，所以標籤先放在真實位置，再上下推開避免重疊，用細線連回刻度。
 */
import { ANALOGIES } from '../../core/constants';
import { M12 } from '../../copy/zh-TW';
import { analogyText, formatInt, formatPercent } from '../format';
import { html, type SafeHtml } from '../html';
import { fx, srTable, svgRoot } from './svg';

const CLAMP = 1e-9;

function logit(p: number): number {
  const q = Math.min(Math.max(p, CLAMP), 1 - CLAMP);
  return Math.log(q / (1 - q));
}

interface Item {
  key: string;
  text: string;
  p: number;
  claim: boolean;
  closest: boolean;
}

/** 一維的標籤避讓：依目標位置排序，保持至少 gap 的間距，超出底部時整體往上推。 */
export function dodge(targets: readonly number[], gap: number, min: number, max: number): number[] {
  const order = targets.map((t, i) => ({ t, i })).sort((a, b) => a.t - b.t);
  const placed = order.map((o) => Math.min(Math.max(o.t, min), max));
  for (let i = 1; i < placed.length; i++) placed[i] = Math.max(placed[i]!, placed[i - 1]! + gap);
  const last = placed.length - 1;
  if (last >= 0 && placed[last]! > max) {
    placed[last] = max;
    for (let i = last - 1; i >= 0; i--) placed[i] = Math.min(placed[i]!, placed[i + 1]! - gap);
  }
  const out = new Array<number>(targets.length);
  order.forEach((o, k) => {
    out[o.i] = placed[k]!;
  });
  return out;
}

export function analogyScaleChart(p: number, closestId: string, width: number): SafeHtml {
  const items: Item[] = ANALOGIES.map((a) => ({
    key: a.id,
    text: M12.scaleItem(analogyText(a.id), `${formatInt(a.num)}/${formatInt(a.den)}`),
    p: a.p,
    claim: false,
    closest: a.id === closestId,
  }));
  items.push({ key: 'claim', text: M12.scaleMarker(formatPercent(p)), p, claim: true, closest: false });

  const gap = 19;
  const padT = 14;
  const padB = 14;
  const height = Math.max(380, items.length * gap + 70);
  const axisX = 22;
  const labelX = 52;
  const logits = items.map((it) => logit(it.p));
  const hiL = Math.max(...logits);
  const loL = Math.min(...logits);
  const span = hiL - loL || 1;
  const yOf = (l: number) => padT + ((hiL - l) / span) * (height - padT - padB);
  const trueY = logits.map(yOf);
  const labelY = dodge(trueY, gap, padT + 4, height - padB);

  const marks = items.map((it, i) => {
    const ty = trueY[i] ?? 0;
    const ly = labelY[i] ?? ty;
    const textClass = it.claim ? 'scale-claim-text' : it.closest ? 'scale-closest' : '';
    const mark = it.claim
      ? html`<path class="scale-claim-mark" d="M${fx(axisX - 9)} ${fx(ty)}L${fx(axisX)} ${fx(ty - 7)}L${fx(axisX + 9)} ${fx(ty)}L${fx(axisX)} ${fx(ty + 7)}Z"/>`
      : html`<circle class="scale-tick" cx="${axisX}" cy="${fx(ty)}" r="3.5"/>`;
    const suffix = it.closest ? `（${M12.closest}）` : '';
    return html`<path class="scale-leader${it.claim ? ' is-claim' : ''}" d="M${axisX + 6} ${fx(ty)}C${axisX + 18} ${fx(ty)} ${labelX - 16} ${fx(ly - 4)} ${labelX - 4} ${fx(ly - 4)}"/>
      ${mark}
      <text class="small-label ${textClass}" x="${labelX}" y="${fx(ly)}">${it.text}${suffix}</text>`;
  });
  // 先畫一般事件，最後畫這則預言（疊在最上層）
  const ordered = [...marks.slice(0, -1), marks[marks.length - 1]];
  const axis = html`<line class="scale-axis" x1="${axisX}" x2="${axisX}" y1="${padT - 6}" y2="${fx(height - padB + 6)}"/>`;

  const closest = ANALOGIES.find((a) => a.id === closestId);
  const aria = M12.scaleAria(formatPercent(p), closest ? analogyText(closest.id) : '');
  const table = srTable(
    M12.scaleTableCaption,
    M12.scaleTableHead,
    [...items].sort((a, b) => b.p - a.p).map((it) => [it.text, formatPercent(it.p)]),
  );
  return html`${svgRoot(width, height, aria, html`${axis}${ordered}`)}${table}`;
}
