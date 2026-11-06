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

describe('assessParse：第二輪刁鑽輸入（2026-11-05）', () => {
  it.each([
    '土耳其東部下週規模7',
    '日本南部下週會有規模7地震',
    '洛杉磯下週會有規模7大地震',
    '舊金山明年會有規模7',
    '南澳洲下週規模6',
    '中國南部下週有規模7',
  ])('只提到國外：%s', (text) => {
    expect(gate(text)).toBe('foreign-only');
  });

  it.each(['小琉球明天會有規模5地震', '中東部下週規模6', '福建金門明天規模5', '新北投下週規模5'])(
    '台灣的地名不是國外：%s',
    (text) => {
      expect(gate(text)).toBeNull();
    },
  );

  it.each([
    'Apple M4 晶片下個月發表',
    'BMW M3 明天交車',
    '這部電影太震撼了，明天再去看一次',
    '有感而發，明天去台北玩',
    '搖滾音樂祭下週在高雄',
    '股市明天會劇震盪',
    '央行宣布升息半碼，房市恐出現劇烈震盪，專家建議下個月再進場',
    '颱風明天將從花蓮登陸，氣象署預估暴風圈規模龐大，東部地區要嚴防強風豪雨，民眾務必做好防颱準備。',
    '行政院今天通過明年度總預算案，總規模約新台幣3兆元，其中國防預算創新高。',
  ])('像地震、其實不是：%s', (text) => {
    expect(gate(text)).toBe('not-quake');
  });

  it.each(['地震險怎麼買', '明天高中地震演練', '國中地震避難演練下週三舉行'])('演練、保險：%s', (text) => {
    expect(gate(text)).toBe('not-prophecy');
  });

  it('預言裡順便提到保險，照常計算', () => {
    expect(gate('下週花蓮會有規模7大地震，快去買保險')).toBeNull();
  });

  it.each(['地震', '震震震震震', '去年的地震好可怕', '我昨天夢到地震'])('沒說時間、地點、大小：%s', (text) => {
    expect(gate(text)).toBe('empty');
  });

  it.each(['去年花蓮地震震度7級好可怕', '1999年集集大地震'])('說的是過去的地震：%s', (text) => {
    expect(gate(text)).toBe('past');
  });

  it('提到過去、也說了未來的時間：照常計算', () => {
    expect(gate('像1999年那樣，下週會有大地震')).toBeNull();
    expect(gate('上週三花蓮地震很大，下週一定還會有規模6')).toBeNull();
  });

  it.each([
    '11/15或12/20花蓮會有規模6或規模7',
    '三天後或五天後花蓮規模6或7級',
    '台北或台中，明天或後天，規模6',
    '明天、後天、大後天都會有地震',
  ])('兩項以上各有好幾種說法，或同一項有三種以上：%s', (text) => {
    expect(gate(text)).toBe('conflicting');
  });

  it('只有地點有好幾個（亂槍打鳥）：照常計算，地點合在一起', () => {
    expect(gate('台北、台中、高雄、花蓮、台東、宜蘭、南投明天都會有規模6')).toBeNull();
  });
});

describe('assessParse：第三輪（反向驗證代理，2026-11-06）', () => {
  it.each([
    '下週花蓮地震不會超過規模5',
    '下週只會有規模4以下的小地震',
    '下週花蓮不會有規模6以上的地震',
    '專家：11/15不會有規模7大地震，請勿轉傳',
  ])('說「不會」或「最多」：%s', (text) => {
    expect(gate(text)).toBe('negated');
  });

  it('「會不會」是問句，照常計算', () => {
    expect(gate('下週會不會有地震')).toBeNull();
  });

  it.each([
    '去年11月花蓮規模6的地震好可怕',
    '去年的今天花蓮發生規模6地震',
    '前年3月花蓮規模6的地震',
    '上個禮拜花蓮規模6好可怕',
    '幾天前花蓮規模5.8的地震好大',
    '三天前花蓮規模6',
    '民國88年集集大地震規模7.3好可怕',
    '二〇二四年花蓮規模7.2',
    '花蓮日前發生規模6地震，好可怕',
    '花蓮縣近海稍早發生規模5.8地震，最大震度4級',
  ])('說的是過去的地震：%s', (text) => {
    expect(gate(text)).toBe('past');
  });

  it.each([
    '明年政府會推有感加薪3%',
    '這次減稅很有感，下個月開始',
    '我的M2 MacBook明天到貨',
    '衣服M 6件明天出貨',
    '這部電影太震憾了，明天再去看一次',
    '明天去台北晃晃',
    '明天去買手搖飲',
    '這項投資規模達30億，明年完工',
  ])('像地震、其實不是：%s', (text) => {
    expect(gate(text)).toBe('not-quake');
  });

  it('「人事大地震」是比喻', () => {
    expect(gate('下個月公司人事大地震')).toBe('not-prophecy');
  });

  it.each([
    '今天在LINE群組看到：下週花蓮會有規模6以上',
    '今天起一週內花蓮會有規模6以上',
    '下週五級地震',
    '吉安鄉近期有感',
    '下週會有感',
    '下週台北會有5強的搖晃',
    '過年前花蓮會有規模6以上',
  ])('照常計算：%s', (text) => {
    expect(gate(text)).toBeNull();
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
