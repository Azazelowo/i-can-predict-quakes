import { describe, expect, it } from 'vitest';
import { ANALOGIES, LEVELS, SPECTRUM } from '../src/core/constants';
import type { Claim, FlagCode } from '../src/core/types';
import { ANALOGY_TEXT, LEVEL_TEXT, SPECTRUM_LABELS, flagText } from '../src/copy/zh-TW';
import {
  describeClaim,
  formatPercent,
  formatPercentShort,
  formatRegion,
  formatSize,
  formatWindowSummary,
  intensityName,
  levelRanges,
} from '../src/ui/format';
import { escapeHtml, html } from '../src/ui/html';

describe('百分比', () => {
  it.each([
    [0, '0%'],
    [0.0004, '< 0.1%'],
    [0.004, '0.4%'],
    [0.411504815763895, '41.2%'],
    [0.9458, '94.6%'],
    [0.9996, '> 99.9%'],
    [1, '100%'],
  ])('%s → %s', (p, text) => {
    expect(formatPercent(p)).toBe(text);
  });

  it('等級門檻用簡短寫法', () => {
    expect(formatPercentShort(0.9)).toBe('90%');
    expect(formatPercentShort(0.05)).toBe('5%');
  });
});

describe('大小、地點、時間的文字', () => {
  it('震度名稱：5、6 級分弱／強', () => {
    expect(intensityName(4)).toContain('4');
    expect(intensityName(5)).toContain('5 弱');
    expect(intensityName(5.5)).toContain('5 強');
    expect(intensityName(6)).toContain('6 弱');
    expect(intensityName(6.5)).toContain('6 強');
  });

  it('寬鬆判定會寫出實際門檻', () => {
    const text = formatSize({ kind: 'magnitude', value: 6, tolerance: 'lenient' });
    expect(text).toContain('6.0');
    expect(text).toContain('5.5');
  });

  it('地點：分區名稱、外推距離、只算縣內', () => {
    expect(formatRegion({ kind: 'taiwan' })).toBe('台灣及近海');
    expect(formatRegion({ kind: 'counties', ids: ['G', 'U', 'V'], bufferKm: 30, group: 'east' })).toContain('東部');
    expect(formatRegion({ kind: 'counties', ids: ['O', 'J'], bufferKm: 30 })).toContain('新竹市');
    expect(formatRegion({ kind: 'counties', ids: ['U'], bufferKm: 30 })).toContain('30');
    expect(formatRegion({ kind: 'counties', ids: ['U'], bufferKm: 0 })).toContain('只算縣內');
  });

  it('時間窗摘要含星期與天數', () => {
    const text = formatWindowSummary({ kind: 'nextWeek', start: '2026-11-09', end: '2026-11-15', days: 7 }, '2026-11-04');
    expect(text).toContain('11/9（一）');
    expect(text).toContain('11/15（日）');
    expect(text).toContain('7');
  });

  it('預言描述只由結構產生（分享時不會帶出原文）', () => {
    const claim: Claim = {
      issuedAt: '2026-11-04',
      time: { kind: 'nextWeek', start: '2026-11-09', end: '2026-11-15', days: 7 },
      region: { kind: 'counties', ids: ['U'], bufferKm: 30 },
      size: { kind: 'magnitude', value: 6, tolerance: 'strict' },
    };
    const text = describeClaim(claim);
    expect(text).toContain('花蓮縣');
    expect(text).toContain('6.0');
  });
});

describe('文案涵蓋所有代碼', () => {
  it('每個等級、類比、光譜項目都有文字', () => {
    for (const lv of LEVELS) expect(LEVEL_TEXT[lv.id].name.length).toBeGreaterThan(0);
    for (const a of ANALOGIES) expect(ANALOGY_TEXT[a.id]).toBeTruthy();
    for (const s of SPECTRUM) expect(SPECTRUM_LABELS[s.id]).toBeTruthy();
    expect(levelRanges()).toHaveLength(LEVELS.length);
  });

  it('每個旗標都有提醒文字', () => {
    const codes: FlagCode[] = [
      'time-unspecified', 'time-vague', 'time-past', 'time-clamped',
      'region-unspecified', 'region-out-of-scope', 'region-offshore', 'region-ambiguous',
      'size-unspecified', 'size-level-ambiguous', 'size-below-min', 'size-intensity-region-ignored',
      'repeat-mentioned',
    ];
    for (const code of codes) {
      const text = flagText({ code, detail: '測試' }, 30);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('undefined');
    }
    expect(flagText({ code: 'size-unspecified', detail: '' }, 30)).not.toContain('「」');
  });
});

describe('HTML 跳脫', () => {
  it('使用者輸入不會變成標記', () => {
    const evil = '<img src=x onerror=alert(1)>"\'&';
    expect(escapeHtml(evil)).not.toContain('<');
    expect(html`<p>${evil}</p>`.toString()).not.toContain('<img');
  });
});
