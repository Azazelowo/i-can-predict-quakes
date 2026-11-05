/**
 * 顯示設定（src/app/prefs.ts）：存下來的字串不管長怎樣，都要還原成合法的設定；
 * index.html 裡提早套主題的小腳本要和 prefs.ts 用同一個 key、同一組選項。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, LAYOUTS, STORAGE_KEY, TERMS_VERSION, THEMES, parsePrefs, termsAccepted } from '../src/app/prefs';

describe('parsePrefs', () => {
  it('沒有存過、或存的不是 JSON：用預設值', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('null')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('[1,2]')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('"desert"')).toEqual(DEFAULT_PREFS);
  });

  it('合法的值原樣還原', () => {
    expect(parsePrefs('{"theme":"desert","layout":"wide","termsVersion":1}')).toEqual({
      theme: 'desert',
      layout: 'wide',
      termsVersion: 1,
    });
  });

  it('不合法的項目各自換回預設值，其他項目保留', () => {
    expect(parsePrefs('{"theme":"neon","layout":"wide","termsVersion":1}')).toEqual({
      theme: 'auto',
      layout: 'wide',
      termsVersion: 1,
    });
    expect(parsePrefs('{"theme":"tech","layout":3,"termsVersion":"1"}')).toEqual({
      theme: 'tech',
      layout: 'single',
      termsVersion: 0,
    });
    expect(parsePrefs('{"termsVersion":1.5}').termsVersion).toBe(0);
  });

  it('每個主題與版面都能存回來', () => {
    for (const theme of THEMES) expect(parsePrefs(JSON.stringify({ theme })).theme).toBe(theme);
    for (const layout of LAYOUTS) expect(parsePrefs(JSON.stringify({ layout })).layout).toBe(layout);
  });
});

describe('termsAccepted', () => {
  it('同意的版本 ≥ 目前版本才算同意過', () => {
    expect(termsAccepted(DEFAULT_PREFS)).toBe(false);
    expect(termsAccepted({ ...DEFAULT_PREFS, termsVersion: TERMS_VERSION })).toBe(true);
    expect(termsAccepted({ ...DEFAULT_PREFS, termsVersion: TERMS_VERSION - 1 })).toBe(false);
  });
});

describe('index.html 的提早套用主題腳本', () => {
  const page = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

  it('用同一個 localStorage key', () => {
    expect(page).toContain(`'${STORAGE_KEY}'`);
  });

  it('主題與版面的選項和 prefs.ts 一致', () => {
    const themes = /\^\(([a-z|]+)\)\$\/\.test\(p\.theme\)/.exec(page)?.[1]?.split('|');
    const layouts = /\^\(([a-z|]+)\)\$\/\.test\(p\.layout\)/.exec(page)?.[1]?.split('|');
    expect(themes).toEqual([...THEMES]);
    expect(layouts).toEqual([...LAYOUTS]);
  });
});
