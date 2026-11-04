/**
 * 把新的 HTML 字串「套」到現有的 DOM 上（簡化版 morph）。
 *
 * 為什麼不直接 innerHTML：確認卡和結果每改一次就重畫，直接取代會讓正在輸入的欄位失去焦點、
 * 拖到一半的滑桿跳掉、展開的卡片收起來。這裡逐一比對節點，只改有變的屬性和文字；
 * 有焦點的文字欄位與滑桿不覆寫它們的值。元素可以用 data-key 標記身分，條件出現的欄位前後
 * 的元素就能正確對上。
 */
import type { SafeHtml } from './html';

/** 用新的標記取代 container 的子節點（盡量沿用既有節點）。 */
export function morphChildren(container: Element, markup: SafeHtml | string): void {
  const tpl = document.createElement('template');
  tpl.innerHTML = typeof markup === 'string' ? markup : markup.value;
  patchChildren(container, tpl.content);
}

/** 用新的標記（單一根元素）更新 target 本身。標籤不同時直接取代。 */
export function morphElement(target: Element, markup: SafeHtml | string): void {
  const tpl = document.createElement('template');
  tpl.innerHTML = (typeof markup === 'string' ? markup : markup.value).trim();
  const next = tpl.content.firstElementChild;
  if (!next) return;
  if (sameKind(target, next)) patchNode(target, next);
  else target.replaceWith(next);
}

function keyOf(node: Node): string | null {
  return node instanceof Element ? node.getAttribute('data-key') : null;
}

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (!(a instanceof Element) || !(b instanceof Element)) return true;
  if (a.tagName !== b.tagName) return false;
  if (keyOf(a) !== keyOf(b)) return false;
  if (a instanceof HTMLInputElement && b instanceof HTMLInputElement && a.type !== b.type) return false;
  return true;
}

function patchChildren(from: Node, to: Node): void {
  let cur: ChildNode | null = from.firstChild;
  let next: ChildNode | null = to.firstChild;
  while (next) {
    const after: ChildNode | null = next.nextSibling;
    if (cur && sameKind(cur, next)) {
      patchNode(cur, next);
      cur = cur.nextSibling;
    } else {
      // 有 data-key 的元素：往後找同一個元素；找到就把中間被刪掉的節點移除，保留它本身（含焦點）。
      const key = keyOf(next);
      let match: ChildNode | null = null;
      if (key !== null) {
        for (let s: ChildNode | null = cur; s; s = s.nextSibling) {
          if (sameKind(s, next)) {
            match = s;
            break;
          }
        }
      }
      if (match) {
        while (cur && cur !== match) {
          const n: ChildNode | null = cur.nextSibling;
          from.removeChild(cur);
          cur = n;
        }
        patchNode(match, next);
        cur = match.nextSibling;
      } else {
        from.insertBefore(next, cur);
      }
    }
    next = after;
  }
  while (cur) {
    const n: ChildNode | null = cur.nextSibling;
    from.removeChild(cur);
    cur = n;
  }
}

function patchNode(from: Node, to: Node): void {
  if (!(from instanceof Element) || !(to instanceof Element)) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  patchAttributes(from, to);
  if (from instanceof HTMLTextAreaElement) {
    if (from !== document.activeElement) from.value = to.textContent ?? '';
    return;
  }
  patchChildren(from, to);
  patchFormState(from, to);
}

function patchAttributes(from: Element, to: Element): void {
  for (const attr of Array.from(to.attributes)) {
    if (from.getAttribute(attr.name) !== attr.value) from.setAttribute(attr.name, attr.value);
  }
  for (const attr of Array.from(from.attributes)) {
    if (!to.hasAttribute(attr.name)) from.removeAttribute(attr.name);
  }
}

function patchFormState(from: Element, to: Element): void {
  if (from instanceof HTMLInputElement && to instanceof HTMLInputElement) {
    if (from.type === 'checkbox' || from.type === 'radio') {
      const want = to.hasAttribute('checked');
      if (from.checked !== want) from.checked = want;
    } else if (from !== document.activeElement) {
      const want = to.getAttribute('value') ?? '';
      if (from.value !== want) from.value = want;
    }
  } else if (from instanceof HTMLSelectElement) {
    const options = Array.from(to.querySelectorAll('option'));
    const chosen = options.find((o) => o.hasAttribute('selected')) ?? options[0];
    if (chosen) {
      const want = chosen.getAttribute('value') ?? chosen.textContent ?? '';
      if (from.value !== want) from.value = want;
    }
  }
}

/** 使用者是否偏好減少動態效果。 */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 捲動到元素（尊重減少動態效果的設定）。 */
export function scrollToElement(el: Element): void {
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

/** 依 data-focus 找回焦點（用於整塊重畫後）。 */
export function focusByKey(root: ParentNode, key: string): void {
  const el = root.querySelector<HTMLElement>(`[data-focus="${CSS.escape(key)}"]`);
  el?.focus({ preventScroll: true });
}
