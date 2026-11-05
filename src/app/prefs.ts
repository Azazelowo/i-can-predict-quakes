/**
 * 顯示設定與「已同意使用規範」：存在這台裝置的 localStorage。
 *
 * 規則：localStorage 可能不能用（無痕視窗、封鎖網站資料、嵌入的預覽），所以每次讀寫都包在 try 裡；
 * 讀不到時用預設值，網站照常運作，只是下次還會再問一次使用規範。
 * 只記這三件事，不記任何輸入內容（AGENTS.md 規則 3）。
 */

export const THEMES = ['auto', 'light', 'dark', 'desert', 'jungle', 'tech'] as const;
export type ThemeId = (typeof THEMES)[number];

export const LAYOUTS = ['single', 'wide'] as const;
export type LayoutId = (typeof LAYOUTS)[number];

export interface Prefs {
  theme: ThemeId;
  layout: LayoutId;
  /** 同意的使用規範版本；規範內容有重大修改時把 TERMS_VERSION 加 1，所有人會再看到一次 */
  termsVersion: number;
}

export const TERMS_VERSION = 1;
/** index.html 的小腳本也用這個 key，在樣式套用前先套主題（避免重新整理時閃一下預設配色） */
export const STORAGE_KEY = 'i-can-predict-quakes.prefs';

export const DEFAULT_PREFS: Prefs = { theme: 'auto', layout: 'single', termsVersion: 0 };

function isTheme(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v);
}

function isLayout(v: unknown): v is LayoutId {
  return typeof v === 'string' && (LAYOUTS as readonly string[]).includes(v);
}

/** 從存下來的字串還原設定；任何一項不合法就用預設值（純函式） */
export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      theme: isTheme(obj['theme']) ? obj['theme'] : DEFAULT_PREFS.theme,
      layout: isLayout(obj['layout']) ? obj['layout'] : DEFAULT_PREFS.layout,
      termsVersion:
        typeof obj['termsVersion'] === 'number' && Number.isInteger(obj['termsVersion']) ? obj['termsVersion'] : 0,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function loadPrefs(): Prefs {
  try {
    return parsePrefs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 不能存就算了：只影響下次開啟時要不要重選
  }
}

export function termsAccepted(prefs: Prefs): boolean {
  return prefs.termsVersion >= TERMS_VERSION;
}

/** 主題與版面寫在 <html> 的 data-theme、data-layout 上，樣式表依此切換變數 */
export function applyPrefs(prefs: Prefs): void {
  const root = document.documentElement;
  root.dataset['theme'] = prefs.theme;
  root.dataset['layout'] = prefs.layout;
}
