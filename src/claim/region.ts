/**
 * 地點（docs/MODELS.md 2.3）。
 *
 * 所有詞表（分區別名、縣市合稱、縣市別名、新竹／嘉義、台灣的說法、國外地名，見 src/core/regions.ts）合成一張表，
 * 由左到右掃描：每個位置先試最長的詞，比對到的字不再重複使用。所以「台灣東部」是東部分區（不是台灣）、
 * 「新竹縣」不會再被讀成「新竹」、「東南亞」不會被讀成「南部」。
 *
 * 規格沒寫、我們的解讀（見 notes）：
 * - 只記下 group 的條件：只比對到一種分區（同一分區出現多次也算一種），而且沒有縣市、合稱、新竹／嘉義。
 *   台灣的說法與國外地名不影響 group。
 * - 同時提到「新竹」「嘉義」時只有一個 region-ambiguous，detail 以「、」連接（確認卡依代碼去重，只會顯示一個）。
 * - 國外地名依出現順序、去重後以「、」連接；用原文的寫法。國外地名不標 span（它們沒有被採用到 Claim）。
 * - 外海等字只在地區是縣市時才有作用（加旗標、外推改 60 公里、標成 modifier）；「台灣外海」仍是台灣及近海。
 * - 誤判排除：除了規格的「其中部分」，另收「其中部份」「當中部分」「當中部份」。
 */
import { DEFAULT_BUFFER_KM, OFFSHORE_BUFFER_KM } from '../core/constants';
import {
  AMBIGUOUS_PLACES,
  COUNTIES,
  COUNTY_COMBOS,
  GROUPS,
  OFFSHORE_WORDS,
  OUT_OF_SCOPE_PLACES,
  TAIWAN_ALIASES,
} from '../core/regions';
import type { Flag, GroupId, RegionSpec, Span } from '../core/types';
import { normalize } from './normalize';
import { buildLexicon, scanLexicon, type LexiconEntry } from './scan';

export interface RegionResult {
  region: RegionSpec;
  flags: Flag[];
  spans: Span[];
}

type PlaceKind = 'excluded' | 'group' | 'combo' | 'county' | 'ambiguous' | 'taiwan' | 'foreign';

interface PlaceWord extends LexiconEntry {
  kind: PlaceKind;
  ids: readonly string[];
  group: GroupId | null;
}

/** 常見誤判：這些片段裡的「中部」不是地名 */
const EXCLUDED_PHRASES: readonly string[] = ['其中部分', '其中部份', '當中部分', '當中部份'];

function placeWords(): PlaceWord[] {
  const words: PlaceWord[] = [];
  const seen = new Set<string>();
  const add = (raw: string, kind: PlaceKind, ids: readonly string[], group: GroupId | null = null): void => {
    // 詞表也經過同一個正規化（「台北」「臺北」變成同一個詞）
    const word = normalize(raw);
    if (word.length === 0 || seen.has(word)) return;
    seen.add(word);
    words.push({ word, kind, ids, group });
  };
  // 加入順序 = 規格的順序；長度相同時先加入者優先
  for (const phrase of EXCLUDED_PHRASES) add(phrase, 'excluded', []);
  for (const g of GROUPS) for (const alias of g.aliases) add(alias, 'group', g.ids, g.id);
  for (const [name, ids] of Object.entries(COUNTY_COMBOS)) add(name, 'combo', ids);
  for (const c of COUNTIES) for (const alias of c.aliases) add(alias, 'county', [c.id]);
  for (const [name, ids] of Object.entries(AMBIGUOUS_PLACES)) add(name, 'ambiguous', ids);
  for (const alias of TAIWAN_ALIASES) add(alias, 'taiwan', []);
  for (const name of OUT_OF_SCOPE_PLACES) add(name, 'foreign', []);
  return words;
}

const PLACES = buildLexicon(placeWords());
const OFFSHORE = buildLexicon(OFFSHORE_WORDS.map((w) => ({ word: normalize(w) })));

function pushUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

export function findRegion(norm: string, orig: string): RegionResult {
  const ids: string[] = [];
  const groups: GroupId[] = [];
  /** 有縣市、合稱或新竹／嘉義（不是只有分區） */
  let countyLevel = false;
  const localSpans: Span[] = [];
  const taiwanSpans: Span[] = [];
  const foreign = new Map<string, string>(); // 正規化的詞 → 原文寫法（依出現順序）
  const ambiguous = new Map<string, string>();

  for (const { start, end, entry } of scanLexicon(norm, PLACES)) {
    const span: Span = { slot: 'region', start, end };
    switch (entry.kind) {
      case 'excluded':
        break;
      case 'taiwan':
        taiwanSpans.push(span);
        break;
      case 'foreign':
        if (!foreign.has(entry.word)) foreign.set(entry.word, orig.slice(start, end));
        break;
      default:
        localSpans.push(span);
        for (const id of entry.ids) pushUnique(ids, id);
        if (entry.kind === 'group' && entry.group !== null) pushUnique(groups, entry.group);
        else countyLevel = true;
        if (entry.kind === 'ambiguous' && !ambiguous.has(entry.word)) ambiguous.set(entry.word, orig.slice(start, end));
    }
  }

  const flags: Flag[] = [];
  const foreignDetail = [...foreign.values()].join('、');

  if (ids.length > 0) {
    const offshore = scanLexicon(norm, OFFSHORE);
    const bufferKm = offshore.length > 0 ? OFFSHORE_BUFFER_KM : DEFAULT_BUFFER_KM;
    const group = groups.length === 1 && !countyLevel ? groups[0] : undefined;
    const region: RegionSpec =
      group === undefined ? { kind: 'counties', ids, bufferKm } : { kind: 'counties', ids, bufferKm, group };
    if (foreign.size > 0) flags.push({ code: 'region-out-of-scope', detail: foreignDetail });
    if (offshore.length > 0) flags.push({ code: 'region-offshore' });
    if (ambiguous.size > 0) flags.push({ code: 'region-ambiguous', detail: [...ambiguous.values()].join('、') });
    const modifierSpans: Span[] = offshore.map((h) => ({ slot: 'modifier', start: h.start, end: h.end }));
    return { region, flags, spans: [...localSpans, ...modifierSpans] };
  }

  // 沒有台灣的縣市：一律用台灣及近海。只提到國外時不加 region-unspecified（規格 2.3）
  if (foreign.size > 0) flags.push({ code: 'region-out-of-scope', detail: foreignDetail });
  else if (taiwanSpans.length === 0) flags.push({ code: 'region-unspecified' });
  return { region: { kind: 'taiwan' }, flags, spans: taiwanSpans };
}
