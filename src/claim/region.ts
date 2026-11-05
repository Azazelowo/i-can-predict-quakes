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
 * - 誤判排除：除了規格的「其中部分」，另收「其中部份」「當中部分」「當中部份」；「其中國防」的「中國」、
 *   「密集集中」的「集集」也不算。
 * - 地標（小琉球、墾丁、龜山島…，src/core/regions.ts 的 LANDMARKS）和鄉鎮一樣，換成所在縣市、加 region-town。
 * - 國外地名或鄉鎮後面接「路、街、巷、大道、夜市」時是路名（南京東路、重慶南路、延平北路、寧夏夜市），不算地點。
 * - 方位詞緊接在國外地名後面（「土耳其東部」「日本南部」「美國西部」，中間只能有空白或「的」）時屬於那個國家，
 *   不是台灣的分區。
 */
import { DEFAULT_BUFFER_KM, OFFSHORE_BUFFER_KM } from '../core/constants';
import {
  AMBIGUOUS_PLACES,
  COUNTIES,
  COUNTY_COMBOS,
  GROUPS,
  LANDMARKS,
  OFFSHORE_WORDS,
  OUT_OF_SCOPE_PLACES,
  TAIWAN_ALIASES,
  countyById,
} from '../core/regions';
import { TOWNS } from '../core/towns';
import type { Flag, GroupId, RegionSpec, Span } from '../core/types';
import { normalize } from './normalize';
import { buildLexicon, scanLexicon, type LexiconEntry } from './scan';

export interface RegionResult {
  region: RegionSpec;
  flags: Flag[];
  spans: Span[];
}

type PlaceKind = 'excluded' | 'group' | 'combo' | 'county' | 'ambiguous' | 'town' | 'taiwan' | 'foreign';

interface PlaceWord extends LexiconEntry {
  kind: PlaceKind;
  ids: readonly string[];
  group: GroupId | null;
}

/** 常見誤判：這些片段裡的「中部」「中國」「集集」不是地名 */
const EXCLUDED_PHRASES: readonly string[] = [
  '其中部分', '其中部份', '當中部分', '當中部份', '其中國', '高中國',
  ...['密', '聚', '匯', '群', '雲', '收', '蒐', '搜', '採', '召', '募', '交', '齊'].map((c) => `${c}集集`),
];

/** 路名、夜市名：「南京東路」「延平北路」「寧夏夜市」裡的地名不是地點 */
const STREET_AFTER_RE = /^(?:[東西南北]?[路街巷]|大道|夜市)/;
/** 國外地名和後面的方位詞之間只能有這些字（「日本東部」「日本的南部」） */
const FOREIGN_GAP_RE = /^[\s的]*$/;

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
  // 鄉鎮：全名與（安全的）簡稱，都對應到所在的縣市；和縣市別名同名時縣市優先（先加入者優先）
  for (const t of TOWNS) {
    add(t.name, 'town', [t.county]);
    if (t.short !== null) add(t.short, 'town', [t.county]);
  }
  for (const [name, county] of Object.entries(LANDMARKS)) add(name, 'town', [county]);
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
  /** 鄉鎮 → 所在縣市（「池上→臺東縣」），依出現順序去重 */
  const towns = new Map<string, string>();
  /** 被採用的台灣地名：對應的縣市組合 → 原文寫法。對應到不同縣市組合才算「多個地點」 */
  const places = new Map<string, string>();

  /** 上一個國外地名的結尾（給「土耳其東部」這類說法用） */
  let foreignEnd = -1;
  for (const { start, end, entry } of scanLexicon(norm, PLACES)) {
    const span: Span = { slot: 'region', start, end };
    if ((entry.kind === 'foreign' || entry.kind === 'town') && STREET_AFTER_RE.test(norm.slice(end))) continue;
    if (
      (entry.kind === 'group' || entry.kind === 'combo') &&
      foreignEnd >= 0 &&
      FOREIGN_GAP_RE.test(norm.slice(foreignEnd, start))
    ) {
      continue;
    }
    switch (entry.kind) {
      case 'excluded':
        break;
      case 'taiwan':
        taiwanSpans.push(span);
        break;
      case 'foreign':
        if (!foreign.has(entry.word)) foreign.set(entry.word, orig.slice(start, end));
        foreignEnd = end;
        break;
      default:
        localSpans.push(span);
        for (const id of entry.ids) pushUnique(ids, id);
        if (entry.kind === 'group' && entry.group !== null) pushUnique(groups, entry.group);
        else countyLevel = true;
        if (entry.kind === 'ambiguous' && !ambiguous.has(entry.word)) ambiguous.set(entry.word, orig.slice(start, end));
        // 這兩種提醒的 detail 用正規化後的寫法：只差在全形／半形、台／臺的兩句話，結果要完全相同
        if (entry.kind === 'town' && !towns.has(entry.word)) {
          towns.set(entry.word, `${entry.word}→${countyById(entry.ids[0] ?? '')?.name ?? ''}`);
        }
        {
          const key = [...entry.ids].sort().join(',');
          if (!places.has(key)) places.set(key, entry.word);
        }
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
    if (towns.size > 0) flags.push({ code: 'region-town', detail: [...towns.values()].join('、') });
    // 提到兩個以上的地點（例如「南部、西部」「卑南或池上」）：合在一起算，提醒使用者
    if (places.size > 1) flags.push({ code: 'region-union', detail: [...places.values()].join('、') });
    const modifierSpans: Span[] = offshore.map((h) => ({ slot: 'modifier', start: h.start, end: h.end }));
    return { region, flags, spans: [...localSpans, ...modifierSpans] };
  }

  // 沒有台灣的縣市：一律用台灣及近海。只提到國外時不加 region-unspecified（規格 2.3），
  // 但加 region-foreign-only：這則預言說的根本不是台灣，網頁要先問過使用者再算
  if (foreign.size > 0) {
    flags.push({ code: 'region-out-of-scope', detail: foreignDetail });
    if (taiwanSpans.length === 0) flags.push({ code: 'region-foreign-only' });
  } else if (taiwanSpans.length === 0) {
    flags.push({ code: 'region-unspecified' });
  }
  return { region: { kind: 'taiwan' }, flags, spans: taiwanSpans };
}
