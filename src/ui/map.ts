/**
 * 確認卡的小地圖：縣市界、目前選的範圍，以及期間內規模夠大的歷史震央。
 *
 * 目的是讓「範圍放大」看得見：同樣的門檻，範圍越大，圈進來的點越多。
 *
 * 投影：等距圓柱，經度乘上 cos(23.7°)（台灣中部的緯度），1 度 = 100 個 viewBox 單位。
 * 只畫 ML ≥ 5（或預言門檻更高時用預言門檻），否則會有上萬個點。
 */
import { MIN_ML, TAIWAN_BOX } from '../core/constants';
import type { Claim, DataBundle, RegionSpec, SizeSpec } from '../core/types';
import { REGION } from '../copy/zh-TW';
import { regionMask } from '../modes';
import { fx } from './charts/svg';
import { formatInt, formatMagnitude, formatRegion } from './format';
import { html, raw, type SafeHtml } from './html';

const LON0 = 118.0;
const LON1 = 123.3;
const LAT0 = 21.7;
const LAT1 = 26.5;
const UNIT = 100;
const COS = Math.cos((23.7 * Math.PI) / 180);
const WIDTH = (LON1 - LON0) * COS * UNIT;
const HEIGHT = (LAT1 - LAT0) * UNIT;
/** 地圖最低只畫到 ML 5.0 */
const DOT_FLOOR = 5.0;
/** 台灣及近海的矩形；南緣北緯 21 度在地圖外 */
const BOX = TAIWAN_BOX;

const px = (lon: number): number => (lon - LON0) * COS * UNIT;
const py = (lat: number): number => (LAT1 - lat) * UNIT;

/** 縣市界的 path 只依資料而定，每份資料算一次 */
const countyCache = new WeakMap<DataBundle, { id: string; d: string }[]>();
/** 點的標記依「資料 + 範圍 + 門檻」而定；確認卡每次重畫都會呼叫，所以快取最近幾種 */
const dotCache = new WeakMap<DataBundle, Map<string, { markup: SafeHtml; total: number; inside: number }>>();
const DOT_CACHE_SIZE = 16;

function countyPaths(data: DataBundle): { id: string; d: string }[] {
  let paths = countyCache.get(data);
  if (!paths) {
    paths = data.map.counties.map((c) => ({
      id: c.id,
      d: c.rings
        .map((ring) => {
          let d = '';
          for (let i = 0; i + 1 < ring.length; i += 2) {
            d += `${i === 0 ? 'M' : 'L'}${fx(px(ring[i]!))} ${fx(py(ring[i + 1]!))}`;
          }
          return `${d}Z`;
        })
        .join(''),
    }));
    countyCache.set(data, paths);
  }
  return paths;
}

/** 地圖要畫的最低規模：規模型預言用它的有效門檻 m*（至少 5.0），其他用 5.0 */
export function mapMinMagnitude(size: SizeSpec): number {
  if (size.kind !== 'magnitude') return DOT_FLOOR;
  const threshold = size.tolerance === 'lenient' ? size.value - 0.5 : size.value;
  return Math.max(DOT_FLOOR, MIN_ML, Math.round(threshold * 10) / 10);
}

function dotsFor(data: DataBundle, region: RegionSpec, minMl: number): { markup: SafeHtml; total: number; inside: number } {
  let perData = dotCache.get(data);
  if (!perData) {
    perData = new Map();
    dotCache.set(data, perData);
  }
  const key = `${JSON.stringify(region)}|${minMl}`;
  const hit = perData.get(key);
  if (hit) return hit;

  const mask = regionMask(region, data);
  const { lat, lon, ml } = data.catalog;
  const inside: { x: number; y: number; m: number }[] = [];
  const outside: { x: number; y: number; m: number }[] = [];
  for (let i = 0; i < ml.length; i++) {
    const m = ml[i]!;
    const la = lat[i]!;
    const lo = lon[i]!;
    if (m < minMl || lo < LON0 || lo > LON1 || la < LAT0 || la > LAT1) continue;
    (mask[i] === 1 ? inside : outside).push({ x: px(lo), y: py(la), m });
  }
  // 小的先畫、大的蓋在上面；範圍外的整組先畫
  const byMag = (a: { m: number }, b: { m: number }) => a.m - b.m;
  inside.sort(byMag);
  outside.sort(byMag);
  const circle = (cls: string) => (d: { x: number; y: number; m: number }) =>
    `<circle class="${cls}" cx="${fx(d.x)}" cy="${fx(d.y)}" r="${fx(2.2 + (d.m - minMl) * 1.6)}"/>`;
  const markup = raw(outside.map(circle('map-dot-out')).join('') + inside.map(circle('map-dot-in')).join(''));
  const result = { markup, total: inside.length + outside.length, inside: inside.length };

  if (perData.size >= DOT_CACHE_SIZE) {
    const oldest = perData.keys().next().value;
    if (oldest !== undefined) perData.delete(oldest);
  }
  perData.set(key, result);
  return result;
}

export function miniMapHtml(claim: Claim, data: DataBundle): SafeHtml {
  const region = claim.region;
  const minMl = mapMinMagnitude(claim.size);
  const from = data.meta.period.start.slice(0, 4);
  const to = data.meta.period.end.slice(0, 4);
  const selected = new Set(region.kind === 'counties' ? region.ids : []);

  let dots: { markup: SafeHtml; total: number; inside: number } | null = null;
  try {
    dots = dotsFor(data, region, minMl);
  } catch {
    dots = null; // 例如網址裡有不存在的縣市代碼：照樣畫地圖，只是不標點
  }

  const counties = countyPaths(data).map(
    (c) => html`<path class="map-county${selected.has(c.id) ? ' is-selected' : ''}" d="${c.d}" fill-rule="evenodd"/>`,
  );
  const box =
    region.kind === 'taiwan'
      ? html`<rect class="map-box" x="${fx(px(BOX.lonMin))}" y="${fx(py(BOX.latMax))}" width="${fx(px(BOX.lonMax) - px(BOX.lonMin))}" height="${fx(py(BOX.latMin) - py(BOX.latMax))}"/>`
      : '';

  const label =
    (dots
      ? REGION.map.aria(formatRegion(region), from, to, formatMagnitude(minMl), formatInt(dots.total), formatInt(dots.inside))
      : formatRegion(region)) + (region.kind === 'taiwan' ? ` ${REGION.map.ariaTaiwanBox}` : '');

  return html`<figure class="map-block">
    <svg class="mini-map" viewBox="0 0 ${fx(WIDTH)} ${fx(HEIGHT)}" width="100%" role="img" aria-label="${label}" focusable="false">
      <g>${counties}</g>
      ${box}
      <g>${dots ? dots.markup : ''}</g>
    </svg>
    <figcaption class="map-caption">
      ${dots
        ? html`<span class="map-key"><svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><circle class="map-dot-in" cx="5" cy="5" r="4"/></svg>${REGION.map.legendInside}</span>
          <span class="map-key"><svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><circle class="map-dot-out" cx="5" cy="5" r="4"/></svg>${REGION.map.legendOutside}</span>
          <br />${REGION.map.caption(from, to, formatMagnitude(minMl))}`
        : REGION.map.unavailable}
    </figcaption>
  </figure>`;
}
