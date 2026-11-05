/**
 * 解析結果的把關（src/app/quality.ts）：哪些輸入要先請使用者確認，不直接給數字。
 * 例句多半來自使用者試玩回報（2026-11-05），見 tests/parse-cases.ts 的「回報｜」。
 */
import { describe, expect, it } from 'vitest';
import { assessParse, detailCount, type GateKind } from '../src/app/quality';
import { parseClaim } from '../src/claim/parse';

const ISSUED = '2026-11-04';

function gate(text: string): GateKind | null {
  return assessParse(text, parseClaim(text, ISSUED));
}

describe('assessParse：只提到國外', () => {
  it.each([
    '下一周歐洲會有M5以上地震',
    '日本下週會有大地震',
    '胡言亂語，測試test，規模9.9地震毀滅日本',
  ])('%s → foreign-only', (text) => {
    expect(gate(text)).toBe('foreign-only');
  });

  it('國外和台灣一起提到時照常計算（只提醒國外的部分不算）', () => {
    expect(gate('30 天以內，日本、台灣、大陸、菲律賓、印尼可能發生 M7.0 地震')).toBeNull();
    expect(gate('日本網友說下個月台灣會有大地震')).toBeNull();
  });
});

describe('assessParse：看不出是地震預言', () => {
  it.each(['今天天氣很好', 'asdfghjkl', '12345 54321', '下週會中樂透', '　'])('%s → not-quake', (text) => {
    expect(gate(text)).toBe('not-quake');
  });

  it.each([
    '下週花蓮會有規模 6 的地震',
    '169天後，卑南或池上會發生小區域有感地震',
    '地牛翻身',
    '下週台北會搖得很厲害',
    '花蓮 M6.5',
    '下週Mw7.2',
    '近期會有震度 5 弱',
    '下週台中地震',
  ])('%s → 照常計算', (text) => {
    expect(gate(text)).toBeNull();
  });
});

describe('assessParse：說法互相矛盾', () => {
  it('好幾種震度、規模混在一起', () => {
    expect(
      gate('近期東部外海會有強震 中震 弱震接連發生 或是舊制7級 新制6弱 舊制6級 有可能是Mj4.8 有可能是ML5.2 南部 西部也會有'),
    ).toBe('conflicting');
  });

  it('地震學術語亂入', () => {
    expect(
      gate(
        '我是地震，我的手是Mw5級,腳是震度4級,頭是PGA1800，嘴是Ms-0.2 我要胡亂輸出地震學術語，擾亂你。逼逼逼，規模要加震度 哈哈哈 12345 54321 1級包含2級 M6包含M7',
      ),
    ).toBe('conflicting');
  });

  it('只有兩種大小、一種時間：照常計算（確認卡會提醒）', () => {
    expect(gate('下週花蓮會有規模 6 或規模 7 的地震')).toBeNull();
  });

  it('兩種大小又有兩種時間：要先確認', () => {
    expect(gate('明天或下個月，花蓮會有規模 6 或規模 7 的地震')).toBe('conflicting');
  });
});

describe('detailCount', () => {
  it('以「、」分隔計數；沒有這個旗標時為 0；沒有 detail 算 1 項', () => {
    expect(detailCount([{ code: 'size-multiple', detail: 'M6、M7、震度4' }], 'size-multiple')).toBe(3);
    expect(detailCount([{ code: 'size-multiple', detail: ' ' }], 'size-multiple')).toBe(1);
    expect(detailCount([{ code: 'size-multiple' }], 'size-multiple')).toBe(1);
    expect(detailCount([], 'time-multiple')).toBe(0);
  });
});
