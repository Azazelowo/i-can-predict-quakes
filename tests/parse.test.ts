/**
 * 解析器測試（docs/MODELS.md 第 2 節「解析規則」，第 4 節「解析器測試」）。
 *
 * - 表格案例：tests/parse-cases.ts，預期值依規格手算
 * - span：一律是「原文」的 UTF-16 索引（全形字、台／臺、emoji 都不能讓位置跑掉）
 * - 穩健性：約 200 個固定產生的字串（mulberry32 固定種子，不用 Math.random），不可丟出錯誤、結果一律合法
 * - windowFor：每一種 TimeKind，以及「解析結果用 windowFor 重算會得到同一個窗口」（確認卡共用同一套規則）
 *
 * 表格案例與穩健性測試都直接呼叫 parseClaimStrict：內部錯誤才不會被 parseClaim 的保底結果藏起來；
 * 同時確認 parseClaim 回傳一模一樣的結果。
 */
import { describe, expect, it } from 'vitest';
import { parseClaimStrict } from '../src/claim/core';
import { parseClaim, windowFor } from '../src/claim/parse';
import { DEFAULT_BUFFER_KM, MAX_WINDOW_DAYS, OFFSHORE_BUFFER_KM, VAGUE_WINDOW_DAYS } from '../src/core/constants';
import { COUNTIES, COUNTY_COMBOS, GROUPS, OFFSHORE_WORDS, groupById } from '../src/core/regions';
import { isoToDay } from '../src/core/time';
import type { Flag, FlagCode, GroupId, ParseResult, Span, TimeKind, TimeWindow } from '../src/core/types';
import { mulberry32 } from '../src/stats/random';
import {
  DEC28,
  DEC31,
  JAN31,
  MON,
  PARSE_CASES,
  SAT,
  SUN,
  WED,
  type ExpectedFlag,
} from './parse-cases';

// ================================================================ 共用

const ALL_KINDS: Record<TimeKind, true> = {
  today: true,
  tomorrow: true,
  dayAfterTomorrow: true,
  thisWeek: true,
  nextWeek: true,
  weekend: true,
  thisMonth: true,
  nextMonth: true,
  month: true,
  thisYear: true,
  withinDays: true,
  date: true,
  untilDate: true,
  dateRange: true,
  vague: true,
  unspecified: true,
};

/** 第 2 節會產生的旗標（size-intensity-region-ignored 是計算時才產生的，不在這裡） */
const PARSE_FLAGS: ReadonlySet<FlagCode> = new Set<FlagCode>([
  'time-unspecified',
  'time-vague',
  'time-past',
  'time-clamped',
  'time-multiple',
  'region-unspecified',
  'region-out-of-scope',
  'region-foreign-only',
  'region-offshore',
  'region-ambiguous',
  'region-town',
  'region-union',
  'size-unspecified',
  'size-level-ambiguous',
  'size-below-min',
  'size-multiple',
  'size-magnitude-type',
  'size-official-term',
  'size-unsupported-term',
  'repeat-mentioned',
]);

const GROUP_IDS: Record<GroupId, true> = { north: true, central: true, south: true, east: true, huadong: true };
const COUNTY_IDS: ReadonlySet<string> = new Set(COUNTIES.map((c) => c.id));
/** 2.4：震度 v ∈ 0–7，只有 5、6 可接弱／強 */
const INTENSITY_OK: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5, 5.5, 6, 6.5, 7]);
const SLOTS: readonly Span['slot'][] = ['time', 'region', 'size', 'modifier'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALL_ISSUED = [WED, SAT, SUN, MON, DEC28, DEC31, JAN31] as const;

/** 位置 i 是否切在代理對（surrogate pair）中間 */
function splitsSurrogatePair(text: string, i: number): boolean {
  if (i <= 0 || i >= text.length) return false;
  const before = text.charCodeAt(i - 1);
  const after = text.charCodeAt(i);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

function expectedDetail(expected: readonly ExpectedFlag[], code: FlagCode): string | undefined {
  for (const f of expected) if (typeof f !== 'string' && f.code === code) return f.detail;
  return undefined;
}

/** 旗標的比較形式：規格有定義 detail（預期值有寫）時是「代碼「detail」」，否則只有代碼；排序後比較 */
function actualFlagView(actual: readonly Flag[], expected: readonly ExpectedFlag[]): string[] {
  return actual
    .map((f) => (expectedDetail(expected, f.code) === undefined ? f.code : `${f.code}「${f.detail ?? '（沒有 detail）'}」`))
    .sort();
}

function expectedFlagView(expected: readonly ExpectedFlag[]): string[] {
  return expected.map((f) => (typeof f === 'string' ? f : `${f.code}「${f.detail}」`)).sort();
}

/**
 * 任何輸入的解析結果都要合法：Claim 的每個欄位都在值域內、旗標與 Claim 一致（規格 2.2–2.5）、
 * span 都在原文範圍內。
 */
function expectValid(text: string, issuedAt: string, r: ParseResult, label: string): void {
  const { claim, flags, spans } = r;
  const codes = flags.map((f) => f.code);
  const has = (code: FlagCode): boolean => codes.includes(code);

  // ---- 旗標：只會是第 2 節的代碼，同一個代碼最多一個
  for (const f of flags) {
    expect(PARSE_FLAGS.has(f.code), `${label}：不該由解析器產生的旗標 ${f.code}`).toBe(true);
    if (f.detail !== undefined) expect(typeof f.detail, label).toBe('string');
  }
  expect(new Set(codes).size, `${label}：旗標重複 ${codes.join(',')}`).toBe(codes.length);

  // ---- 時間
  expect(claim.issuedAt, label).toBe(issuedAt);
  const { time, region, size } = claim;
  expect(ALL_KINDS[time.kind], `${label}：kind ${time.kind}`).toBe(true);
  expect(time.start, label).toMatch(ISO_RE);
  expect(time.end, label).toMatch(ISO_RE);
  const start = isoToDay(time.start); // 不存在的日期會丟出錯誤
  const end = isoToDay(time.end);
  expect(time.days, label).toBe(end - start + 1);
  expect(time.days, label).toBeGreaterThanOrEqual(1);
  expect(time.days, label).toBeLessThanOrEqual(MAX_WINDOW_DAYS);
  expect(time.kind === 'unspecified', `${label}：time-unspecified`).toBe(has('time-unspecified'));
  if (time.kind === 'vague') expect(has('time-vague'), `${label}：vague 要有 time-vague`).toBe(true);
  if (has('time-vague')) expect(['vague', 'withinDays'], label).toContain(time.kind);
  if (time.kind === 'vague' || time.kind === 'unspecified') expect(time.days, label).toBe(VAGUE_WINDOW_DAYS);
  if (has('time-clamped')) expect(time.days, label).toBe(MAX_WINDOW_DAYS);
  expect(start < isoToDay(issuedAt), `${label}：time-past ⇔ 開始日早於發布日`).toBe(has('time-past'));

  // ---- 地點
  if (region.kind === 'counties') {
    expect(region.ids.length, label).toBeGreaterThan(0);
    expect(new Set(region.ids).size, `${label}：縣市重複`).toBe(region.ids.length);
    for (const id of region.ids) expect(COUNTY_IDS.has(id), `${label}：不認得的縣市 ${id}`).toBe(true);
    expect(region.bufferKm, label).toBe(has('region-offshore') ? OFFSHORE_BUFFER_KM : DEFAULT_BUFFER_KM);
    if (region.group !== undefined) {
      expect(GROUP_IDS[region.group], label).toBe(true);
      // 只有一個分區、沒有其他縣市時才記 group，所以縣市剛好就是那個分區
      expect(region.ids, label).toEqual([...(groupById(region.group)?.ids ?? [])]);
    }
  } else {
    expect(Object.keys(region), label).toEqual(['kind']);
  }
  if (has('region-unspecified')) {
    expect(region.kind, label).toBe('taiwan');
    expect(has('region-out-of-scope'), `${label}：有國外地名就不加 region-unspecified`).toBe(false);
  }
  if (has('region-offshore')) expect(region.kind, label).toBe('counties');
  if (has('region-ambiguous')) {
    const ids = region.kind === 'counties' ? region.ids : [];
    const both = (a: string, b: string): boolean => ids.includes(a) && ids.includes(b);
    expect(both('O', 'J') || both('I', 'Q'), `${label}：region-ambiguous 要同時有縣與市`).toBe(true);
  }
  const outOfScope = flags.find((f) => f.code === 'region-out-of-scope');
  if (outOfScope !== undefined) expect(outOfScope.detail ?? '', label).not.toBe('');

  // ---- 大小
  if (size.kind === 'magnitude') {
    const tenths = Math.round(size.value * 10);
    expect(Math.abs(size.value * 10 - tenths), `${label}：規模取一位小數`).toBeLessThan(1e-9);
    expect(tenths, label).toBeGreaterThanOrEqual(10);
    expect(tenths, label).toBeLessThanOrEqual(99);
    expect(['strict', 'lenient'], label).toContain(size.tolerance);
    const threshold = size.tolerance === 'strict' ? tenths : tenths - 5;
    expect(has('size-below-min'), `${label}：size-below-min ⇔ 門檻 < 4.0`).toBe(threshold < 40);
  } else {
    expect(has('size-below-min'), label).toBe(false);
    expect(has('size-level-ambiguous'), label).toBe(false);
  }
  if (size.kind === 'intensity') expect(INTENSITY_OK.has(size.value), `${label}：震度 ${size.value}`).toBe(true);
  expect(size.kind === 'unspecified', `${label}：size-unspecified`).toBe(has('size-unspecified'));
  const sizeWord = flags.find((f) => f.code === 'size-unspecified');
  if (sizeWord !== undefined) expect(typeof sizeWord.detail, `${label}：size-unspecified 一定有 detail`).toBe('string');

  // ---- span：原文的 [start, end)，不切開代理對；採用的時間說法剛好一個
  for (const s of spans) {
    const where = `${label}：span ${s.slot} [${s.start}, ${s.end})`;
    expect(SLOTS, where).toContain(s.slot);
    expect(Number.isInteger(s.start) && Number.isInteger(s.end), where).toBe(true);
    expect(s.start, where).toBeGreaterThanOrEqual(0);
    expect(s.start, where).toBeLessThan(s.end);
    expect(s.end, where).toBeLessThanOrEqual(text.length);
    expect(splitsSurrogatePair(text, s.start) || splitsSurrogatePair(text, s.end), where).toBe(false);
  }
  expect(spans.filter((s) => s.slot === 'time').length, `${label}：時間 span`).toBe(time.kind === 'unspecified' ? 0 : 1);
}

// ================================================================ 案例資料本身

describe('解析器案例資料（tests/parse-cases.ts）', () => {
  it('至少 90 筆，名稱不重複', () => {
    expect(PARSE_CASES.length).toBeGreaterThanOrEqual(90);
    const names = PARSE_CASES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('手算的窗口自洽：days = end − start + 1', () => {
    for (const c of PARSE_CASES) {
      const t = c.expect.time;
      expect(t.days, c.name).toBe(isoToDay(t.end) - isoToDay(t.start) + 1);
    }
  });

  it('涵蓋每種時間類型、每個發布日、22 個縣市、每個分區、每個合稱、每個外海用詞', () => {
    const kinds = new Set(PARSE_CASES.map((c) => c.expect.time.kind));
    for (const kind of Object.keys(ALL_KINDS)) expect(kinds.has(kind as TimeKind), kind).toBe(true);

    const issued = new Set(PARSE_CASES.map((c) => c.issuedAt));
    for (const d of ALL_ISSUED) expect(issued.has(d), d).toBe(true);

    const ids = new Set<string>();
    const groups = new Set<string>();
    for (const c of PARSE_CASES) {
      const r = c.expect.region;
      if (r.kind !== 'counties') continue;
      for (const id of r.ids) ids.add(id);
      if (r.group !== undefined) groups.add(r.group);
    }
    expect(COUNTIES.length).toBe(22);
    for (const county of COUNTIES) expect(ids.has(county.id), county.name).toBe(true);
    for (const g of GROUPS) expect(groups.has(g.id), g.name).toBe(true);

    const texts = PARSE_CASES.map((c) => c.text).join('\n');
    for (const combo of Object.keys(COUNTY_COMBOS)) expect(texts.includes(combo), combo).toBe(true);
    for (const offshore of OFFSHORE_WORDS) expect(texts.includes(offshore), offshore).toBe(true);
    for (const variant of ['台', '臺', '馬祖', '新竹', '嘉義', '新竹市', '新竹縣', '嘉義市', '嘉義縣', '其中部分']) {
      expect(texts.includes(variant), variant).toBe(true);
    }
  });

  it('涵蓋 2.4 的每個用詞與 2.5 的每個重複說法', () => {
    const details = new Set<string>();
    for (const c of PARSE_CASES) {
      for (const f of c.expect.flags) if (typeof f !== 'string' && f.code === 'size-unspecified') details.add(f.detail);
    }
    const bigWords = ['大地震', '強震', '強烈地震', '巨震', '超大地震', '大規模地震', '大震', '毀滅性', '災難性', '地牛翻身', ''];
    for (const big of bigWords) expect(details.has(big), `size-unspecified「${big}」`).toBe(true);

    const texts = PARSE_CASES.map((c) => c.text).join('\n');
    const words = ['有感', '會搖', '會晃', '感覺得到', '規模', '芮氏', '芮氏規模', 'M', 'ML', 'Mw', '震度'];
    const modifiers = ['以上', '起跳', '+', '↑', '≥', '至少', '超過', '大於', '左右', '上下', '約', '將近'];
    const repeats = ['又說', '再次', '再度', '每週都', '每天都', '一直說', '每次都', '重複'];
    for (const x of [...words, ...modifiers, ...repeats]) expect(texts.includes(x), x).toBe(true);
  });
});

// ================================================================ 表格案例

describe('parseClaim：表格案例（docs/MODELS.md 2.2–2.5）', () => {
  it.each(PARSE_CASES)('$name', (c) => {
    const r = parseClaimStrict(c.text, c.issuedAt);
    expect(parseClaim(c.text, c.issuedAt), '對外的 parseClaim 結果相同（沒有走到保底）').toEqual(r);
    expect({
      issuedAt: r.claim.issuedAt,
      time: r.claim.time,
      region: r.claim.region,
      size: r.claim.size,
      flags: actualFlagView(r.flags, c.expect.flags),
    }).toEqual({
      issuedAt: c.issuedAt,
      time: c.expect.time,
      region: c.expect.region,
      size: c.expect.size,
      flags: expectedFlagView(c.expect.flags),
    });
    expectValid(c.text, c.issuedAt, r, c.name);
  });
});

// ================================================================ span 對回原文

describe('span 指回原文（2.1 長度不變的前處理、2.6）', () => {
  /** 依 span 的位置排序後，各欄位在「原文」切出來的字 */
  function slicesBySlot(text: string, issuedAt: string = WED): Record<Span['slot'], string[]> {
    const out: Record<Span['slot'], string[]> = { time: [], region: [], size: [], modifier: [] };
    const spans = [...parseClaimStrict(text, issuedAt).spans].sort((a, b) => a.start - b.start || a.end - b.end);
    for (const s of spans) out[s.slot].push(text.slice(s.start, s.end));
    return out;
  }

  it('全形數字、全形符號與「臺」：切出原文的寫法', () => {
    expect(slicesBySlot('臺南１１／１０到１１／１５會有震度５強')).toEqual({
      time: ['１１／１０到１１／１５'],
      region: ['臺南'],
      size: ['震度５強'],
      modifier: [],
    });
  });

  it('emoji（代理對）在前面、全形空白、修飾語（外海、以上）', () => {
    expect(slicesBySlot('😱😱台東外海　未來１０天　Ｍ６．５以上！')).toEqual({
      time: ['未來１０天'],
      region: ['台東'],
      size: ['Ｍ６．５'],
      modifier: ['外海', '以上'],
    });
  });

  it('台灣的說法也標出位置（全臺灣）', () => {
    expect(slicesBySlot('🌋🌋全臺灣下週會有感')).toEqual({
      time: ['下週'],
      region: ['全臺灣'],
      size: ['有感'],
      modifier: [],
    });
  });

  it('只差在半形／全形、台／臺時，整個結果（含 span）完全相同', () => {
    const pairs: readonly [string, string][] = [
      ['下週花蓮規模6以上', '下週花蓮規模６以上'],
      ['11/10~11/15台南震度5強', '１１／１０～１１／１５臺南震度５強'],
      ['台灣東部外海M6.5+', '臺灣東部外海Ｍ６．５＋'],
      ['台北、台中、台南、台東下週有感', '臺北、臺中、臺南、臺東下週有感'],
      ['這週末 新竹 6級地震', '這週末　新竹　６級地震'],
    ];
    for (const [half, full] of pairs) {
      expect(full.length).toBe(half.length);
      expect(parseClaimStrict(full, WED), full).toEqual(parseClaimStrict(half, WED));
    }
  });
});

// ================================================================ 穩健性

interface FuzzInput {
  label: string;
  text: string;
  issuedAt: string;
}

const PARAGRAPH =
  '【轉傳】某某又說下週花蓮外海會有規模6以上的大地震！！😱 有人說11/15前、也有人說１１／１０～１１／１５，' +
  '震度５強，其中部分網友說台灣東部、宜花東、北北基都會有感。';

/** 特別挑的輸入：空字串、只有標點、emoji、孤立的代理字元、全形數字、很長的輸入、很大的數字、不存在的日期 */
const SPECIAL_INPUTS: readonly string[] = [
  '',
  ' ',
  '　\t\n\r　',
  '，。、！？；：「」『』（）【】…—～・!?.,;:\'"()[]{}<>/\\|@#$%^&*_+=~`',
  '😱🌋🔥🙏🏻👨‍👩‍👧‍👦🇹🇼',
  '\uD83D',
  '\uDE00\uD83D花蓮\uDE00下週\uD800規模6',
  '０１２３４５６７８９',
  '１１／１５～１２／３１　Ｍ６．５＋　震度５強',
  PARAGRAPH.repeat(Math.ceil(30000 / PARAGRAPH.length)),
  ' '.repeat(3000) + '規模' + ' '.repeat(3000) + '6級',
  '1'.repeat(5000),
  '十'.repeat(2000) + '天內',
  '9'.repeat(400) + '天內，規模' + '9'.repeat(400),
  '\u0000\u0001\u0007\u001b[31m下週\u001b[0m',
  'é​‍‮花́蓮﻿',
  '2/30 13/45 0/0 2026/2/29 2026/13/1 99/99 2026/11/31',
  '1899/1/1到2201/1/1 民國0年1月1日 民國999年 二〇二六年十一月十五日',
  '規模規模規模震度震度級級級MMMLMw',
  '台台台臺臺臺灣灣灣其中部分其中部分',
];

/** 組合用的片段：每條規則的說法、會讓規則誤判或出錯的寫法、雜訊 */
const FUZZ_PARTS: readonly string[] = [
  // 時間
  '今天', '明晚', '大後天', '這週末', '這個週末', '下個禮拜', '下周', '月底前', '下月', '十二月', '11月', '今年底', '年內',
  '三天內', '兩週之內', '十五天內', '一個月內', '半年內', '三年內', '一百年內', '9999年內', '0天內', '未來', '接下來',
  '這幾天', '近期', '不久前', '最近幾天', '11/15', '１１／１５前', '11/10到11/15', '12/28～1/3', '11/10-15', '2026/11/1',
  '2025年3月1日', '民國115年11月15日', '13/45', '2/30', '0/0', '2/29', '99999/1/1', '1/2的機率', '12月底前', '11/15前後',
  '2026年底前', '民國115年 底', '2027年底前', '二〇二六年底', '11/15到11/10',
  // 地點
  '花蓮', '臺東縣', '台灣東部外海', '新竹', '嘉義', '新竹縣市', '宜花東', '北北基桃', '其中部分', '日本', '中國大陸', '東南亞',
  '全台', '海域',
  // 大小
  '規模', 'Ｍ６．５以上', '芮氏規模六點五左右', 'ML', 'Mw', 'M', '震度５強', '震度4強', '6級', '六點五級', '五六級', '震度8級',
  '規模0.5', '規模10', '規模6.55', '至少', '超過', '大於', '約', '將近', '左右', '以上', '↑', '+', '≥', '級', '震度', '大地震',
  '有感', '會搖', '地牛翻身', '大規模地震',
  // 其他旗標
  '又說', '每周都', '一直說',
  // 數字與符號
  '0', '９', '十', '百', '點', '兩', '半', '月', '日', '號', '年', '天', '週', '內', '前', '到', '至', '/', '~', '～', '-', '.', '第',
  // 雜訊
  '😱', '🌋', '🇹🇼', '👨‍👩‍👧', '\uD83D', '\uDE00', 'é', '​', '‮', '﻿', '，', '。', '！！', '？', '……',
  '「', '」', '　', ' ', '\n', '\t', '\u0000', 'abc', 'PM',
];

const SEPARATORS: readonly string[] = ['', '', '', ' ', '，', '　', '\n'];

const FUZZ_COUNT = 200;

function buildFuzzInputs(): FuzzInput[] {
  const out: FuzzInput[] = [];
  const add = (text: string): void => {
    const i = out.length;
    out.push({
      label: `#${i} ${JSON.stringify(text.slice(0, 24))}${text.length > 24 ? `…（${text.length} 字）` : ''}`,
      text,
      issuedAt: ALL_ISSUED[i % ALL_ISSUED.length] ?? WED,
    });
  };
  for (const text of SPECIAL_INPUTS) add(text);
  const next = mulberry32(20261104);
  const pick = <T>(list: readonly T[]): T => {
    const item = list[Math.floor(next() * list.length)];
    if (item === undefined) throw new Error('empty list');
    return item;
  };
  while (out.length < FUZZ_COUNT) {
    const n = 1 + Math.floor(next() * 8);
    let text = '';
    for (let k = 0; k < n; k++) text += pick(FUZZ_PARTS) + pick(SEPARATORS);
    add(text);
  }
  return out;
}

const FUZZ_INPUTS = buildFuzzInputs();

describe('穩健性：固定產生的字串不會丟出錯誤，結果一律合法', () => {
  it('產生的輸入是固定的（同一個種子）、數量約 200', () => {
    expect(FUZZ_INPUTS.length).toBe(FUZZ_COUNT);
    expect(buildFuzzInputs()).toEqual(FUZZ_INPUTS);
  });

  it.each(FUZZ_INPUTS)('$label', ({ label, text, issuedAt }) => {
    let r: ParseResult | null = null;
    expect(() => {
      r = parseClaimStrict(text, issuedAt);
    }, label).not.toThrow();
    if (r === null) return;
    expect(parseClaim(text, issuedAt), label).toEqual(r);
    expectValid(text, issuedAt, r, label);
  });
});

// ================================================================ windowFor

interface WindowRow {
  kind: TimeKind;
  issuedAt: string;
  opts: { days?: number; start?: string; end?: string };
  start: string;
  end: string;
  days: number;
}

function row(
  kind: TimeKind,
  issuedAt: string,
  opts: WindowRow['opts'],
  start: string,
  end: string,
  days: number,
): WindowRow {
  return { kind, issuedAt, opts, start, end, days };
}

/** 規格 2.2 的表格（手算）；天數型的預設與上下限、日期型的必填欄位依 parse.ts 的 windowFor 說明 */
const WINDOW_TABLE: readonly WindowRow[] = [
  row('today', WED, {}, '2026-11-04', '2026-11-04', 1),
  row('today', DEC31, {}, '2026-12-31', '2026-12-31', 1),
  row('tomorrow', WED, {}, '2026-11-05', '2026-11-05', 1),
  row('tomorrow', DEC31, {}, '2027-01-01', '2027-01-01', 1),
  row('dayAfterTomorrow', WED, {}, '2026-11-06', '2026-11-06', 1),
  row('dayAfterTomorrow', DEC31, {}, '2027-01-02', '2027-01-02', 1),
  row('thisWeek', WED, {}, '2026-11-04', '2026-11-08', 5),
  row('thisWeek', SAT, {}, '2026-11-07', '2026-11-08', 2),
  row('thisWeek', SUN, {}, '2026-11-08', '2026-11-08', 1),
  row('thisWeek', MON, {}, '2026-11-09', '2026-11-15', 7),
  row('thisWeek', DEC28, {}, '2026-12-28', '2027-01-03', 7),
  row('thisWeek', DEC31, {}, '2026-12-31', '2027-01-03', 4),
  row('thisWeek', JAN31, {}, '2026-01-31', '2026-02-01', 2),
  row('nextWeek', WED, {}, '2026-11-09', '2026-11-15', 7),
  row('nextWeek', SAT, {}, '2026-11-09', '2026-11-15', 7),
  row('nextWeek', SUN, {}, '2026-11-09', '2026-11-15', 7),
  row('nextWeek', MON, {}, '2026-11-16', '2026-11-22', 7),
  row('nextWeek', DEC28, {}, '2027-01-04', '2027-01-10', 7),
  row('nextWeek', DEC31, {}, '2027-01-04', '2027-01-10', 7),
  row('nextWeek', JAN31, {}, '2026-02-02', '2026-02-08', 7),
  row('weekend', WED, {}, '2026-11-07', '2026-11-08', 2),
  row('weekend', SAT, {}, '2026-11-07', '2026-11-08', 2),
  row('weekend', SUN, {}, '2026-11-08', '2026-11-08', 1),
  row('weekend', MON, {}, '2026-11-14', '2026-11-15', 2),
  row('weekend', DEC28, {}, '2027-01-02', '2027-01-03', 2),
  row('weekend', DEC31, {}, '2027-01-02', '2027-01-03', 2),
  row('weekend', JAN31, {}, '2026-01-31', '2026-02-01', 2),
  row('thisMonth', WED, {}, '2026-11-04', '2026-11-30', 27),
  row('thisMonth', DEC31, {}, '2026-12-31', '2026-12-31', 1),
  row('thisMonth', JAN31, {}, '2026-01-31', '2026-01-31', 1),
  row('nextMonth', WED, {}, '2026-12-01', '2026-12-31', 31),
  row('nextMonth', DEC28, {}, '2027-01-01', '2027-01-31', 31),
  row('nextMonth', JAN31, {}, '2026-02-01', '2026-02-28', 28),
  row('thisYear', WED, {}, '2026-11-04', '2026-12-31', 58),
  row('thisYear', DEC31, {}, '2026-12-31', '2026-12-31', 1),
  row('thisYear', JAN31, {}, '2026-01-31', '2026-12-31', 335),
  row('withinDays', WED, { days: 1 }, '2026-11-04', '2026-11-04', 1),
  row('withinDays', WED, { days: 14 }, '2026-11-04', '2026-11-17', 14),
  row('withinDays', DEC31, { days: 30 }, '2026-12-31', '2027-01-29', 30),
  row('withinDays', WED, { days: 3650 }, '2026-11-04', '2036-10-31', 3650),
  row('withinDays', WED, { days: 5000 }, '2026-11-04', '2036-10-31', 3650),
  row('withinDays', WED, { days: 0 }, '2026-11-04', '2026-11-04', 1),
  row('vague', WED, {}, '2026-11-04', '2026-12-03', 30),
  row('vague', WED, { days: 30 }, '2026-11-04', '2026-12-03', 30),
  row('unspecified', WED, {}, '2026-11-04', '2026-12-03', 30),
  row('unspecified', JAN31, {}, '2026-01-31', '2026-03-01', 30),
  row('date', WED, { start: '2026-11-15' }, '2026-11-15', '2026-11-15', 1),
  row('date', WED, { start: '2026-11-15', end: '2026-11-15' }, '2026-11-15', '2026-11-15', 1),
  row('date', WED, { start: '2025-03-01', end: '2025-03-01' }, '2025-03-01', '2025-03-01', 1),
  row('untilDate', WED, { end: '2026-11-15' }, '2026-11-04', '2026-11-15', 12),
  row('untilDate', DEC31, { end: '2027-01-05' }, '2026-12-31', '2027-01-05', 6),
  row('dateRange', WED, { start: '2026-11-10', end: '2026-11-15' }, '2026-11-10', '2026-11-15', 6),
  row('dateRange', WED, { start: '2026-12-28', end: '2027-01-03' }, '2026-12-28', '2027-01-03', 7),
  row('dateRange', WED, { start: '2026-11-10', end: '2040-01-01' }, '2026-11-10', '2036-11-06', 3650),
  row('month', WED, { start: '2026-12-01', end: '2026-12-31' }, '2026-12-01', '2026-12-31', 31),
  row('month', WED, { start: '2026-11-04', end: '2026-11-30' }, '2026-11-04', '2026-11-30', 27),
  row('month', WED, { start: '2027-02-01', end: '2027-02-28' }, '2027-02-01', '2027-02-28', 28),
];

/** 由時間窗反推 windowFor 的參數（確認卡重算時的做法） */
function optsFor(t: TimeWindow): WindowRow['opts'] {
  switch (t.kind) {
    case 'withinDays':
    case 'vague':
    case 'unspecified':
      return { days: t.days };
    case 'date':
    case 'dateRange':
    case 'month':
      return { start: t.start, end: t.end };
    case 'untilDate':
      return { end: t.end };
    default:
      return {};
  }
}

describe('windowFor（2.2 的表格，解析器與確認卡共用）', () => {
  it('表格涵蓋每一種 TimeKind', () => {
    for (const kind of Object.keys(ALL_KINDS)) {
      expect(WINDOW_TABLE.some((r) => r.kind === kind), kind).toBe(true);
    }
  });

  it.each(WINDOW_TABLE)('$kind（發布日 $issuedAt）→ $start..$end', (r) => {
    expect(windowFor(r.kind, r.issuedAt, r.opts)).toEqual({ kind: r.kind, start: r.start, end: r.end, days: r.days });
  });

  it('日期型缺少必要的日期時丟出錯誤', () => {
    expect(() => windowFor('date', WED)).toThrow();
    expect(() => windowFor('untilDate', WED)).toThrow();
    expect(() => windowFor('dateRange', WED, { start: '2026-11-10' })).toThrow();
    expect(() => windowFor('month', WED, { end: '2026-12-31' })).toThrow();
  });

  it('每個表格案例的窗口都能用 windowFor 重算出來', () => {
    for (const c of PARSE_CASES) {
      const t = c.expect.time;
      expect(windowFor(t.kind, c.issuedAt, optsFor(t)), c.name).toEqual(t);
    }
  });
});
