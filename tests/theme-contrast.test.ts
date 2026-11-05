/**
 * 主題配色的對比檢查：直接讀 src/ui/styles.css 的色彩變數，用 WCAG 2 的相對亮度公式計算。
 *
 * - 文字（內文、次要文字、連結、按鈕字、提醒字…）對它實際出現的底色 ≥ 4.5:1
 * - 圖形（圖表線條、地圖上的點、焦點框）對底色 ≥ 3:1
 * - 敏感度矩陣最深的格子（主色混入 --heat-max% 的 surface-2）上的文字 ≥ 4.5:1
 * - 「範圍內」（--region）和主色（--accent）不能是同一個顏色
 *
 * 改了任何一個主題的顏色都會自動重新檢查；新增主題時把名字加進 THEMES。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../src/app/prefs';

const css = readFileSync(fileURLToPath(new URL('../src/ui/styles.css', import.meta.url)), 'utf8');

type Vars = Record<string, string>;

function varsIn(body: string): Vars {
  const out: Vars = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

/** 某個選擇器後面第一個 { … } 區塊裡的變數 */
function block(selector: string): Vars {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`styles.css 裡找不到 ${selector}`);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return varsIn(css.slice(open + 1, close));
}

const base = block(':root {');
const themeVars: Record<string, Vars> = {
  light: base,
  auto: base,
  dark: { ...base, ...block(':root[data-theme="dark"] {') },
  desert: { ...base, ...block(':root[data-theme="desert"] {') },
  jungle: { ...base, ...block(':root[data-theme="jungle"] {') },
  tech: { ...base, ...block(':root[data-theme="tech"] {') },
};
const autoDark = { ...base, ...block(':root[data-theme="auto"] {') };

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`不是 6 位數色碼：${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** color-mix(in srgb, a p%, b)：在 sRGB（gamma 編碼）空間線性內插 */
function mix(a: [number, number, number], b: [number, number, number], p: number): [number, number, number] {
  return [0, 1, 2].map((i) => Math.round(a[i]! * p + b[i]! * (1 - p))) as [number, number, number];
}

const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-2'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['muted', 'surface-2'],
  ['accent', 'bg'],
  ['accent', 'surface'],
  ['accent', 'surface-2'],
  ['accent', 'accent-soft'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-hover'],
  ['region-ink', 'surface'],
  ['region-ink', 'region-soft'],
  ['note', 'surface'],
  ['note', 'surface-2'],
  ['note', 'note-soft'],
  ['text', 'note-soft'],
  ['modifier', 'surface'],
  ['modifier', 'modifier-soft'],
];

const GRAPHIC_PAIRS: [string, string][] = [
  ['region', 'surface'],
  ['region', 'land'],
  ['model', 'surface'],
  ['model', 'track'],
  ['accent', 'track'],
  ['note', 'bg'],
  ['focus', 'bg'],
  ['focus', 'surface'],
];

describe('主題配色對比（WCAG 2）', () => {
  it('styles.css 有每一個主題', () => {
    for (const theme of THEMES) expect(themeVars[theme], theme).toBeDefined();
  });

  it('跟隨系統的深色模式和「黑夜」主題同一組顏色', () => {
    expect(autoDark).toEqual(themeVars['dark']);
  });

  const cases = [...THEMES, 'auto-dark'].map((name) => [name, name === 'auto-dark' ? autoDark : themeVars[name]!] as const);

  describe.each(cases)('%s', (_name, v) => {
    const c = (a: string, b: string): number => contrast(rgb(v[a]!), rgb(v[b]!));

    it.each(TEXT_PAIRS)('文字 %s／%s ≥ 4.5', (a, b) => {
      expect(c(a, b)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(GRAPHIC_PAIRS)('圖形 %s／%s ≥ 3', (a, b) => {
      expect(c(a, b)).toBeGreaterThanOrEqual(3);
    });

    it('敏感度矩陣最深的格子上，文字 ≥ 4.5', () => {
      const p = Number(v['heat-max']) / 100;
      const cell = mix(rgb(v['accent']!), rgb(v['surface-2']!), p);
      expect(contrast(rgb(v['text']!), cell)).toBeGreaterThanOrEqual(4.5);
    });

    it('「範圍內」和主色不同色', () => {
      expect(v['region']!.toLowerCase()).not.toBe(v['accent']!.toLowerCase());
      expect(c('region', 'accent')).toBeGreaterThan(1.05);
    });
  });
});
