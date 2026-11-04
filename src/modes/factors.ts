/**
 * M4c 灌水成分【事實】（docs/MODELS.md 第 3 節）。
 *
 * 反事實比較：每次只把一個維度收緊（時間、地區、大小、寬鬆度），重算 M1 的 p̂。
 * 收緊後掉得越多，代表這則預言越靠那一招讓自己容易中。
 */
import { DEFAULT_BUFFER_KM } from '../core/constants';
import type { Claim, Factor, RegionSpec, SizeSpec, TimeWindow } from '../core/types';
import type { ModeContext, SpecifiedClaim } from './context';

const DIMENSION_ORDER: Readonly<Record<Factor['dimension'], number>> = {
  time: 0,
  region: 1,
  size: 2,
  tolerance: 3,
};

/** 複製地區設定（不和原預言共用陣列）；dropGroup 時不帶 group。 */
function copyRegion(region: RegionSpec, dropGroup = false): RegionSpec {
  if (region.kind === 'taiwan') return { kind: 'taiwan' };
  const out: RegionSpec = { kind: 'counties', ids: [...region.ids], bufferKm: region.bufferKm };
  if (!dropGroup && region.group !== undefined) out.group = region.group;
  return out;
}

/** 只換掉一個維度的新預言（其餘欄位都是複本，修改 alt 不會影響原預言）。 */
function variant(
  claim: Claim,
  change: { time?: TimeWindow; region?: RegionSpec; size?: SizeSpec },
): Claim {
  return {
    issuedAt: claim.issuedAt,
    time: change.time ?? { ...claim.time },
    region: change.region ?? copyRegion(claim.region),
    size: change.size ?? { ...claim.size },
  };
}

/** 在候選縣市中找單獨一個縣市命中率最高者；同值取清單中較前者。 */
function bestSingleCounty(
  ctx: ModeContext,
  ids: readonly string[],
  bufferKm: number,
  size: SizeSpec,
  T: number,
): string | null {
  let bestId: string | null = null;
  let bestP = Number.NEGATIVE_INFINITY;
  for (const id of ids) {
    const p = ctx.windowStats({ kind: 'counties', ids: [id], bufferKm }, size, T).p;
    if (p > bestP) {
      bestP = p;
      bestId = id;
    }
  }
  return bestId;
}

/** 地區收緊後的設定；不適用時回傳 null。只有規模型會呼叫（震度型的地區不適用）。 */
function tightenRegion(ctx: ModeContext, claim: SpecifiedClaim, T: number): RegionSpec | null {
  const region = claim.region;
  if (region.kind === 'taiwan') {
    // 全部縣市（meta.counties.items 的順序）各自加外推 30 公里
    const ids = ctx.data.meta.counties.items.map((c) => c.id);
    const best = bestSingleCounty(ctx, ids, DEFAULT_BUFFER_KM, claim.size, T);
    return best === null ? null : { kind: 'counties', ids: [best], bufferKm: DEFAULT_BUFFER_KM };
  }
  if (region.ids.length >= 2) {
    // 成員中最高的單一縣市；外推距離不變；不帶 group
    const best = bestSingleCounty(ctx, region.ids, region.bufferKm, claim.size, T);
    return best === null ? null : { kind: 'counties', ids: [best], bufferKm: region.bufferKm };
  }
  if (region.ids.length === 1 && region.bufferKm > 0) {
    // 只算縣內。【規格未提】單一縣市原本不會有 group；這裡一律不帶
    return { kind: 'counties', ids: [region.ids[0]!], bufferKm: 0 };
  }
  return null;
}

/** 依規格表列出所有適用的「收緊後預言」，順序 = time、region、size、tolerance。 */
function candidates(ctx: ModeContext, claim: SpecifiedClaim, T: number): { dimension: Factor['dimension']; alt: Claim }[] {
  const out: { dimension: Factor['dimension']; alt: Claim }[] = [];
  const size = claim.size;

  if (T > 1) {
    const time: TimeWindow = { kind: 'date', start: claim.time.start, end: claim.time.start, days: 1 };
    out.push({ dimension: 'time', alt: variant(claim, { time }) });
  }

  if (size.kind === 'magnitude') {
    const region = tightenRegion(ctx, claim, T);
    if (region) out.push({ dimension: 'region', alt: variant(claim, { region }) });
  }

  if (size.kind === 'magnitude') {
    const value = size.value + 1.0;
    if (!(value > 9)) {
      out.push({ dimension: 'size', alt: variant(claim, { size: { kind: 'magnitude', value, tolerance: size.tolerance } }) });
    }
  } else {
    const value = size.value + 1;
    if (!(value > 7)) out.push({ dimension: 'size', alt: variant(claim, { size: { kind: 'intensity', value } }) });
  }

  if (size.kind === 'magnitude' && size.tolerance === 'lenient') {
    out.push({
      dimension: 'tolerance',
      alt: variant(claim, { size: { kind: 'magnitude', value: size.value, tolerance: 'strict' } }),
    });
  }
  return out;
}

export function factorsOf(ctx: ModeContext, claim: SpecifiedClaim): Factor[] {
  const T = ctx.windowLength(claim.time.days);
  const from = ctx.windowStats(claim.region, claim.size, T).p;
  const out: Factor[] = [];
  for (const { dimension, alt } of candidates(ctx, claim, T)) {
    const to = ctx.windowStats(alt.region, alt.size, ctx.windowLength(alt.time.days)).p;
    // 只保留真的變難的項目；to = 0 代表收緊後期間內從沒發生過，倍數記為 null
    if (to < from) out.push({ dimension, from, to, ratio: to === 0 ? null : from / to, alt });
  }
  // ratio 由大到小，null 視為最大；同值依 time、region、size、tolerance
  out.sort((a, b) => {
    const ra = a.ratio ?? Number.POSITIVE_INFINITY;
    const rb = b.ratio ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return rb - ra;
    return DIMENSION_ORDER[a.dimension] - DIMENSION_ORDER[b.dimension];
  });
  return out;
}
