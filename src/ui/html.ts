/**
 * 產生 HTML 字串的小工具（純函式，可在 Node 測試）。
 *
 * 為什麼這樣做：畫面用字串模板產生，再交給 dom.ts 套用到頁面上。html`` 會把每個插值都跳脫，
 * 只有 SafeHtml（由 html`` 或 raw() 產生的片段）才會原樣輸出。所以使用者輸入的原文、資料裡的字串，
 * 不可能沒經過跳脫就進到 innerHTML。raw() 只用在程式自己產生、確定安全的片段（例如布林屬性）。
 */

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 跳脫 HTML 特殊字元；結果可以放在元素內容或用引號包住的屬性值裡。 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

export type HtmlValue = SafeHtml | string | number | boolean | null | undefined | readonly HtmlValue[];

function render(value: HtmlValue): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return (value as readonly HtmlValue[]).map(render).join('');
  // false / null / undefined 方便寫條件式：${cond && html`...`}；true 本身沒有意義，也輸出空字串。
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  return escapeHtml(String(value));
}

/** 模板標籤：插值一律跳脫（SafeHtml 與其陣列除外）。 */
export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) {
    out += render(values[i]) + (strings[i + 1] ?? '');
  }
  return new SafeHtml(out);
}

/** 標記為已知安全的片段（只給程式自己產生的固定字串用）。 */
export function raw(markup: string): SafeHtml {
  return new SafeHtml(markup);
}

/** 用分隔符號串起多個片段（各片段一樣會跳脫）。 */
export function join(parts: readonly HtmlValue[], separator: HtmlValue = ''): SafeHtml {
  return new SafeHtml(parts.map(render).join(render(separator)));
}

/** 布林屬性：條件成立時輸出屬性名稱（例如 checked、selected、open）。 */
export function flag(name: 'checked' | 'selected' | 'open' | 'disabled' | 'hidden', on: boolean): SafeHtml {
  return new SafeHtml(on ? ` ${name}` : '');
}
