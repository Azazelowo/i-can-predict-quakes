/**
 * 分享文字與分享網址（純函式，可在 Node 測試）。
 *
 * 只用結構化的 Claim 與計算結果組字串，函式根本拿不到原文，所以分享出去的內容不可能含有人名
 * （AGENTS.md 規則 3）。
 */
import type { Claim, Results } from '../core/types';
import { SHARE } from '../copy/zh-TW';
import {
  formatPercent,
  formatRegion,
  formatSize,
  formatTimeShort,
  levelName,
  periodLabels,
} from '../ui/format';
import { encodeClaim } from './url';

/** 分享網址：目前頁面的位置（不含舊的 hash）加上這則解讀的 hash。 */
export function shareUrl(base: string, claim: Claim): string {
  const hashIndex = base.indexOf('#');
  const clean = hashIndex >= 0 ? base.slice(0, hashIndex) : base;
  return `${clean}#${encodeClaim(claim)}`;
}

/** 【我也會地震預測】{時間}、{地點}、{大小}：就算隨便亂猜也有 {p} 會中（{等級}）。{url} */
export function shareText(results: Results, url: string): string {
  const claim = results.claim;
  const time = formatTimeShort(claim.time, claim.issuedAt);
  const region = formatRegion(claim.region);
  const { headline } = results;
  if (headline.source === 'spectrum' || headline.p === null) {
    const [low, high] = headline.range ?? [0, 0];
    return SHARE.spectrum(time, region, formatPercent(low), formatPercent(high), url);
  }
  const size = formatSize(claim.size);
  const level = results.level ? levelName(results.level) : '';
  const p = formatPercent(headline.p);
  if (headline.source === 'poisson-upper') {
    return SHARE.upper(time, region, size, periodLabels(results.period).years, p, level, url);
  }
  return SHARE.empirical(time, region, size, p, level, url);
}
