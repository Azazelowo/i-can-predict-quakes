/**
 * 中央氣象署的分級名稱（解析器用來換算，確認卡用來解釋）。
 *
 * 來源：
 * - 規模分類：中央氣象署地震百問第 33 題「如何以地震規模區分地震之大小？」
 *   微小地震 M < 3.0、小地震 3.0 ≤ M < 5.0、中地震 5.0 ≤ M < 7.0、大地震 M ≥ 7.0
 * - 有感範圍：地震百問第 17 題「何謂局發、小區域、稍顯著地震及顯著地震？」（依最大有感距離）
 * - 震度名稱：舊制（2020 年以前）0 無感、1 微震、2 輕震、3 弱震、4 中震、5 強震、6 烈震、7 劇震。
 *   2020 年起的新制把 5、6 級拆成弱／強，判定方式也改了；現行分級表（地震百問第 35 題）只寫級數，沒有這些名稱。
 *   所以這些詞一律照舊制的級數解讀，確認卡上註明是舊制的名稱。
 *
 * size 為 null 的詞（大地震、強震、稍顯著、顯著）照樣看解讀光譜：
 * 大地震、強震是最常見的口語說法，預言者和讀者心中的「大」沒有共同標準，這正是網站要呈現的事；
 * 稍顯著、顯著地震是用最大有感距離分的，資料裡沒有有感距離，算不出來。
 */
import type { SizeSpec } from './types';

export interface OfficialTerm {
  /** 原文用詞（比對時由長到短） */
  word: string;
  /** 照官方定義換算的大小；null = 看解讀光譜 */
  size: SizeSpec | null;
  /** 官方定義（顯示在確認卡的提醒裡） */
  meaning: string;
  /** 光譜上對應的項目（src/core/constants.ts 的 SPECTRUM id），給畫面標示「官方定義」 */
  spectrumId?: string;
}

const MAG_CLASS = '中央氣象署依規模的分類';
const INTENSITY_NAME = '中央氣象署舊制（2020 年以前）震度分級的名稱';
const FELT_CLASS = '中央氣象署依最大有感距離的分類';

export const OFFICIAL_TERMS: readonly OfficialTerm[] = [
  // 依規模（地震百問第 33 題）
  { word: '微小地震', size: { kind: 'magnitude', value: 1.0, tolerance: 'strict' }, meaning: `${MAG_CLASS}：規模小於 3.0` },
  { word: '小地震', size: { kind: 'magnitude', value: 3.0, tolerance: 'strict' }, meaning: `${MAG_CLASS}：規模 3.0–5.0` },
  { word: '中地震', size: { kind: 'magnitude', value: 5.0, tolerance: 'strict' }, meaning: `${MAG_CLASS}：規模 5.0–7.0（更大的也算中）`, spectrumId: 'm5' },
  { word: '大地震', size: null, meaning: `${MAG_CLASS}：規模 7.0 以上才叫大地震`, spectrumId: 'm7' },
  // 依有感範圍（地震百問第 17 題）
  { word: '局發地震', size: { kind: 'intensity', value: 1 }, meaning: `${FELT_CLASS}：最大有感距離 100 公里以內。資料沒有有感距離，只能用「有感」代替，算出來的是上限`, spectrumId: 'felt' },
  { word: '小區域有感地震', size: { kind: 'intensity', value: 1 }, meaning: `${FELT_CLASS}：最大有感距離 100–200 公里。資料沒有有感距離，只能用「有感」代替，算出來的是上限`, spectrumId: 'felt' },
  { word: '小區域地震', size: { kind: 'intensity', value: 1 }, meaning: `${FELT_CLASS}：最大有感距離 100–200 公里。資料沒有有感距離，只能用「有感」代替，算出來的是上限`, spectrumId: 'felt' },
  { word: '稍顯著地震', size: null, meaning: `${FELT_CLASS}：最大有感距離 200–300 公里；資料沒有有感距離，先看解讀光譜` },
  { word: '顯著有感地震', size: null, meaning: `${FELT_CLASS}：最大有感距離 300 公里以上；資料沒有有感距離，先看解讀光譜` },
  { word: '顯著地震', size: null, meaning: `${FELT_CLASS}：最大有感距離 300 公里以上；資料沒有有感距離，先看解讀光譜` },
  // 震度名稱（舊制；2020 年起的分級表只寫級數）
  { word: '微震', size: { kind: 'intensity', value: 1 }, meaning: `${INTENSITY_NAME}：1 級`, spectrumId: 'felt' },
  { word: '輕震', size: { kind: 'intensity', value: 2 }, meaning: `${INTENSITY_NAME}：2 級` },
  { word: '弱震', size: { kind: 'intensity', value: 3 }, meaning: `${INTENSITY_NAME}：3 級`, spectrumId: 'i3' },
  { word: '中震', size: { kind: 'intensity', value: 4 }, meaning: `${INTENSITY_NAME}：4 級`, spectrumId: 'i4' },
  { word: '強震', size: null, meaning: `${INTENSITY_NAME}：5 級；2020 年起拆成 5 弱、5 強`, spectrumId: 'i5' },
  { word: '烈震', size: { kind: 'intensity', value: 6 }, meaning: `${INTENSITY_NAME}：6 級；2020 年起拆成 6 弱、6 強`, spectrumId: 'i6' },
  { word: '劇震', size: { kind: 'intensity', value: 7 }, meaning: `${INTENSITY_NAME}：7 級` },
];

export function officialTerm(word: string): OfficialTerm | undefined {
  return OFFICIAL_TERMS.find((t) => t.word === word);
}

/**
 * 規模種類（地震百問第 27 題）：同一個地震用不同方法算，數值會不同。
 * 例：1999 年集集地震 ML 7.3、Mw 7.7；2016 年美濃地震 ML 6.6、Mw 6.4。
 */
export const MAGNITUDE_TYPES: Readonly<Record<string, string>> = {
  mw: '地震矩規模 Mw',
  ms: '表面波規模 Ms',
  mb: '體波規模 mb',
  mj: '日本氣象廳規模 Mj',
  mjma: '日本氣象廳規模 Mj',
};
