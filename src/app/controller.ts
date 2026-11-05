/**
 * 控制器：狀態 → 畫面的單向流程。
 *
 *   使用者操作（事件委派） → 修改 state → recompute()（computeAll）→ syncHash() → invalidate()
 *   invalidate() 用 requestAnimationFrame 合併多次更新，再以 morph 套到 DOM 上（保留焦點與輸入中的值）。
 *
 * 隱私：原文只存在 state.text / state.source 裡；網址 hash 只放 encodeClaim(claim)，
 * 分享文字只由 Claim 與結果組成（src/app/share.ts）。整個程式不會把輸入送到任何地方。
 */
import { parseClaim } from '../claim/parse';
import { SPECTRUM } from '../core/constants';
import { todayIso } from '../core/time';
import type { Claim, Flag, FlagCode, ParseResult, SizeSpec, Tolerance } from '../core/types';
import { INPUT } from '../copy/zh-TW';
import { loadData } from '../data/load';
import { computeAll } from '../modes/index';
import { confirmCardHtml } from '../ui/confirm';
import { morphChildren, morphElement, scrollToElement } from '../ui/dom';
import { footerHtml } from '../ui/footer';
import { explainerHtml, headerHtml } from '../ui/header';
import { html, type SafeHtml } from '../ui/html';
import { inputCardHtml } from '../ui/input';
import { miniMapHtml } from '../ui/map';
import { resultsHtml, singleCardHtml } from '../ui/results';
import {
  applyBuffer,
  applyRegionValue,
  chooseTimeKind,
  isPastWindow,
  setDays,
  setIssuedAt,
  setRange,
  sizeOfKind,
  sizeWithTolerance,
  sizeWithValue,
  type TimeEdit,
} from './edit';
import { bucketFlags, emptyNotes, notesForRestoredClaim, withCode, withoutCodes } from './notes';
import {
  LAYOUTS,
  THEMES,
  TERMS_VERSION,
  applyPrefs,
  loadPrefs,
  savePrefs,
  termsAccepted,
  type LayoutId,
  type ThemeId,
} from './prefs';
import { assessParse } from './quality';
import { shareText, shareUrl } from './share';
import { initialState, isCardId, type AppState, type CardId, type SpanSlot } from './state';
import { decodeClaim, encodeClaim } from './url';
import { sliderValue, type BayesParam } from '../ui/sliders';
import { gateHtml } from '../ui/gate';
import { termsHtml } from '../ui/terms';
import { whyHtml } from '../ui/why';

interface Slots {
  header: HTMLElement;
  main: HTMLElement;
  probe: HTMLElement;
  explainer: HTMLElement;
  input: HTMLElement;
  confirm: HTMLElement;
  results: HTMLElement;
  why: HTMLElement;
  footer: HTMLElement;
  terms: HTMLElement;
}

/** 雙欄版面生效的螢幕寬度（要和 styles.css 的 @media (min-width: 1100px) 一致） */
const WIDE_QUERY = '(min-width: 1100px)';

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

function must<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing element ${selector}`);
  return el;
}

/** navigator.clipboard 不能用時（舊瀏覽器、非 https）的備案 */
function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

class App {
  private readonly state: AppState;
  private readonly root: HTMLElement;
  private slots!: Slots;
  private frame = 0;
  private fallbackTimer = 0;
  private afterRender: (() => void)[] = [];
  private resizeTimer = 0;
  /** 使用規範關掉後，焦點回到打開它的按鈕 */
  private termsReturnFocus: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    const prefs = loadPrefs();
    applyPrefs(prefs);
    // 第一次使用（或使用規範改版後）先看使用規範
    this.state = initialState(todayIso(), prefs, !termsAccepted(prefs));
  }

  start(): void {
    // 兩欄：左邊（說明、輸入、確認卡）、右邊（結果、為什麼看起來很準）。
    // 單欄時照 DOM 順序排下來，所以順序和原本一樣。
    this.root.innerHTML = html`${headerHtml(this.state.prefs)}
      <main id="main" class="wrap layout" tabindex="-1">
        <div class="col col-side">
          <div id="explainer-slot"></div>
          <div id="input-slot"></div>
          <div id="confirm-slot"></div>
        </div>
        <div class="col col-main">
          <div class="chart-probe" aria-hidden="true"></div>
          <div id="results-slot" class="results"></div>
          <div id="why-slot"></div>
        </div>
      </main>
      <footer class="site-footer" id="disclaimer" tabindex="-1"></footer>
      <div id="terms-slot"></div>`.value;
    this.slots = {
      header: must(this.root, '.site-header'),
      main: must(this.root, '#main'),
      probe: must(this.root, '.chart-probe'),
      explainer: must(this.root, '#explainer-slot'),
      input: must(this.root, '#input-slot'),
      confirm: must(this.root, '#confirm-slot'),
      results: must(this.root, '#results-slot'),
      why: must(this.root, '#why-slot'),
      footer: must(this.root, '#disclaimer'),
      terms: must(this.root, '#terms-slot'),
    };
    this.bind();
    this.restoreFromHash(window.location.hash);
    this.measure();
    this.render();
    void this.load();
  }

  // ============================================================== 資料

  private async load(): Promise<void> {
    const s = this.state;
    s.phase = 'loading';
    s.loadError = null;
    this.invalidate();
    try {
      const data = await loadData();
      s.data = data;
      s.phase = 'ready';
      if (s.inputMessage?.kind === 'info') s.inputMessage = null;
      if (s.claim) this.recompute();
      if (s.pendingSubmit) {
        s.pendingSubmit = false;
        this.submit();
      }
    } catch (err) {
      s.phase = 'error';
      s.loadError = errorMessage(err);
      if (s.pendingSubmit) {
        s.pendingSubmit = false;
        s.inputMessage = null;
      }
    }
    this.invalidate();
  }

  private recompute(): void {
    const s = this.state;
    s.version++;
    s.copyStatus = 'idle';
    if (!s.claim || !s.data) {
      s.results = null;
      s.computeError = null;
      return;
    }
    try {
      s.results = computeAll(s.claim, s.data);
      s.computeError = null;
    } catch (err) {
      s.results = null;
      s.computeError = INPUT.computeFailed(errorMessage(err));
    }
  }

  // ============================================================== 網址

  private syncHash(): void {
    const claim = this.state.claim;
    if (!claim) return;
    const hash = `#${encodeClaim(claim)}`;
    if (window.location.hash === hash) return;
    try {
      window.history.replaceState(window.history.state, '', hash);
    } catch {
      // 某些嵌入環境不允許改網址；不影響計算
    }
  }

  /** 從 hash 還原 Claim；hash 不合法時什麼都不做（回傳 false）。 */
  private restoreFromHash(hash: string): boolean {
    const claim = decodeClaim(hash);
    if (!claim) return false;
    const s = this.state;
    if (s.claim && encodeClaim(s.claim) === encodeClaim(claim)) return true;
    s.claim = claim;
    s.fromLink = true;
    s.source = null;
    // 連結不含原文；清掉輸入框裡上一則預言的文字，免得和確認卡上的解讀對不起來
    s.text = '';
    // 分享連結只有已經確認過的解讀，不需要再攔
    s.gate = null;
    s.issuedAt = claim.issuedAt;
    s.notes = notesForRestoredClaim(claim);
    s.edited = new Set();
    s.timeError = null;
    s.inputMessage = null;
    this.recompute();
    return true;
  }

  // ============================================================== 送出

  private submit(): void {
    const s = this.state;
    const text = s.text;
    if (!text.trim()) {
      s.inputMessage = { kind: 'error', text: INPUT.empty };
      this.invalidate();
      return;
    }
    if (!s.data) {
      if (s.phase === 'error') {
        s.inputMessage = { kind: 'error', text: INPUT.loadFailed(s.loadError ?? '') };
      } else {
        s.pendingSubmit = true;
        s.inputMessage = { kind: 'info', text: INPUT.waiting };
      }
      this.invalidate();
      return;
    }
    const issuedAt = s.issuedAtTouched ? s.issuedAt : todayIso();
    let parse: ParseResult;
    try {
      parse = parseClaim(text, issuedAt);
    } catch (err) {
      s.inputMessage = { kind: 'error', text: INPUT.parseFailed(errorMessage(err)) };
      this.invalidate();
      return;
    }
    s.source = { text, parse };
    s.fromLink = false;
    s.claim = parse.claim;
    s.issuedAt = parse.claim.issuedAt;
    s.notes = bucketFlags(parse.flags);
    s.edited = new Set();
    s.timeError = null;
    s.inputMessage = null;
    // 只提到國外、看不出是預言、說法互相矛盾：先請使用者確認，不直接給數字
    s.gate = assessParse(text, parse);
    this.recompute();
    this.syncHash();
    this.invalidate();
    this.afterRender.push(() => {
      // 兩欄時確認卡和結果並排：捲到整個內容的頂端，不然右欄的主數字會被捲出畫面
      const target = this.isTwoColumn() ? this.slots.main : document.getElementById('confirm-card');
      if (target) scrollToElement(target);
    });
  }

  /** 清空：回到剛打開網站的樣子（不動顯示設定） */
  private clear(): void {
    const s = this.state;
    s.text = '';
    s.source = null;
    s.fromLink = false;
    s.claim = null;
    s.results = null;
    s.notes = emptyNotes();
    s.edited = new Set();
    s.timeError = null;
    s.inputMessage = null;
    s.computeError = null;
    s.gate = null;
    s.open = new Set();
    s.copyStatus = 'idle';
    try {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    } catch {
      // 某些嵌入環境不允許改網址
    }
    this.invalidate();
    this.afterRender.push(() => {
      window.scrollTo({ top: 0 });
      document.getElementById('claim-text')?.focus();
    });
  }

  // ============================================================== 確認卡的修改

  private commit(next: Claim, slot: SpanSlot): void {
    const s = this.state;
    s.claim = next;
    s.edited.add(slot);
    // 在確認卡上改了任何一項，就算確認過了
    s.gate = null;
    this.recompute();
    this.syncHash();
    this.invalidate();
  }

  /** 時間的提醒：只改發布日時保留解析器的說明；改了說法或天數就換掉（time-past、time-clamped 重新判斷）。 */
  private timeNotes(next: Claim, kindChanged: boolean, clamped: boolean): Flag[] {
    let flags: Flag[] = kindChanged ? [] : withoutCodes(this.state.notes.time, ['time-past']);
    if (isPastWindow(next.time, next.issuedAt)) flags = withCode(flags, { code: 'time-past' });
    if (clamped) flags = withCode(flags, { code: 'time-clamped' });
    return flags;
  }

  private applyTime(edit: TimeEdit, opts: { issuedAt?: string; kindChanged: boolean }): void {
    const s = this.state;
    const claim = s.claim;
    if (!claim) return;
    if (!edit.ok) {
      s.timeError = edit.error;
      this.invalidate();
      return;
    }
    const next: Claim = { ...claim, issuedAt: opts.issuedAt ?? claim.issuedAt, time: edit.time };
    s.timeError = null;
    s.notes = { ...s.notes, time: this.timeNotes(next, opts.kindChanged, edit.clamped) };
    this.commit(next, 'time');
  }

  private parsedFlag(code: FlagCode): Flag | undefined {
    return this.state.source?.parse.flags.find((f) => f.code === code);
  }

  private applySize(size: SizeSpec, kindChanged: boolean): void {
    const s = this.state;
    const claim = s.claim;
    if (!claim) return;
    let flags: Flag[];
    if (size.kind === 'unspecified') {
      // 回到「沒說」：沿用解析器的原文用詞（例如「大地震」）
      flags = [this.parsedFlag('size-unspecified') ?? { code: 'size-unspecified' }];
    } else if (kindChanged) {
      flags = [];
    } else {
      flags = withoutCodes(s.notes.size, ['size-below-min', 'size-unspecified']);
    }
    s.notes = { ...s.notes, size: flags };
    this.commit({ ...claim, size }, 'size');
  }

  private pickSpectrum(id: string, fromOverview: boolean): void {
    const item = SPECTRUM.find((x) => x.id === id);
    const claim = this.state.claim;
    if (!item || !claim) return;
    this.applySize({ ...item.size }, true);
    if (fromOverview) {
      this.afterRender.push(() => {
        const headline = document.getElementById('headline');
        const overview = document.getElementById('overview');
        if (overview) scrollToElement(overview);
        headline?.focus({ preventScroll: true });
      });
    }
  }

  private onTimeRange(): void {
    const claim = this.state.claim;
    if (!claim) return;
    const start = this.root.querySelector<HTMLInputElement>('[data-action="time-start"]')?.value ?? '';
    const end = this.root.querySelector<HTMLInputElement>('[data-action="time-end"]')?.value ?? '';
    this.applyTime(setRange(start, end, claim), { kindChanged: true });
  }

  private onIssued(value: string): void {
    const s = this.state;
    const claim = s.claim;
    if (!claim) return;
    const edit = setIssuedAt(claim, value);
    if (edit.ok) {
      s.issuedAt = value;
      s.issuedAtTouched = true;
    }
    this.applyTime(edit, { issuedAt: value, kindChanged: false });
  }

  // ============================================================== 其他動作

  private async copyResult(): Promise<void> {
    const s = this.state;
    if (!s.results) return;
    const text = shareText(s.results, shareUrl(window.location.href, s.results.claim));
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = legacyCopy(text);
    s.copyStatus = ok ? 'copied' : 'failed';
    this.invalidate();
  }

  private setBayes(param: BayesParam, index: number): void {
    if (!Number.isFinite(index)) return;
    const value = sliderValue(param, index);
    if (this.state.bayes[param] === value) return;
    this.state.bayes = { ...this.state.bayes, [param]: value };
    this.renderCard('m10');
  }

  // ============================================================== 顯示設定與使用規範

  /** 兩欄版面是否真的生效（選了雙欄、而且螢幕夠寬；斷點和 styles.css 一致） */
  private isTwoColumn(): boolean {
    return (
      this.state.prefs.layout === 'wide' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(WIDE_QUERY).matches
    );
  }

  private setTheme(value: string): void {
    const theme = THEMES.find((t) => t === value);
    if (!theme || theme === this.state.prefs.theme) return;
    this.updatePrefs({ theme });
  }

  private setLayout(value: string): void {
    const layout = LAYOUTS.find((l) => l === value);
    if (!layout || layout === this.state.prefs.layout) return;
    this.updatePrefs({ layout });
    // 欄寬變了：重新量圖表寬度、重畫圖表
    this.measure();
    this.invalidate();
  }

  private updatePrefs(change: Partial<{ theme: ThemeId; layout: LayoutId; termsVersion: number }>): void {
    const s = this.state;
    s.prefs = { ...s.prefs, ...change };
    savePrefs(s.prefs);
    applyPrefs(s.prefs);
  }

  private openTerms(): void {
    const s = this.state;
    if (s.termsOpen) return;
    const active = document.activeElement;
    this.termsReturnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
    s.termsOpen = true;
    s.termsChecked = false;
    this.invalidate();
  }

  /** 關閉使用規範；只有同意過之後才能關（第一次一定要勾選並按「同意」）。 */
  private closeTerms(accept: boolean): void {
    const s = this.state;
    if (!s.termsOpen) return;
    if (accept) {
      if (!s.termsChecked) return;
      this.updatePrefs({ termsVersion: TERMS_VERSION });
    } else if (!termsAccepted(s.prefs)) {
      return;
    }
    s.termsOpen = false;
    s.termsChecked = false;
    const back = this.termsReturnFocus;
    this.termsReturnFocus = null;
    this.invalidate();
    this.afterRender.push(() => {
      const target = back && back.isConnected ? back : document.getElementById('claim-text');
      target?.focus({ preventScroll: true });
    });
  }

  // ============================================================== 事件

  private bind(): void {
    const root = this.root;
    root.addEventListener('submit', (e) => {
      const form = e.target;
      if (form instanceof HTMLFormElement && form.dataset['form'] === 'claim') {
        e.preventDefault();
        this.submit();
      }
    });
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('change', (e) => this.onChange(e));
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('keydown', (e) => this.onKeydown(e));
    // <details> 的 toggle 不會冒泡，用捕獲階段監聽
    root.addEventListener('toggle', (e) => this.onToggle(e), true);
    window.addEventListener('hashchange', () => {
      if (this.restoreFromHash(window.location.hash)) this.invalidate();
    });
    window.addEventListener('resize', () => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        if (this.measure()) this.invalidate();
      }, 150);
    });
  }

  private onInput(e: Event): void {
    const t = e.target;
    const s = this.state;
    if (t instanceof HTMLTextAreaElement && t.dataset['action'] === 'text') {
      s.text = t.value;
      if (s.inputMessage?.kind === 'error') {
        s.inputMessage = null;
        this.invalidate();
      }
      return;
    }
    if (!(t instanceof HTMLInputElement)) return;
    const action = t.dataset['action'];
    if (action === 'time-days' && s.claim) {
      // 輸入中只套用合法的值；不合法的值等到 change（離開欄位）時才顯示錯誤
      const edit = setDays(s.claim, t.value);
      if (edit.ok) this.applyTime(edit, { kindChanged: true });
    } else if (action === 'bayes') {
      const param = t.dataset['param'];
      if (param === 'prior' || param === 'target' || param === 'skill') this.setBayes(param, Number(t.value));
    }
  }

  private onChange(e: Event): void {
    const t = e.target;
    const s = this.state;
    if (!(t instanceof HTMLSelectElement || t instanceof HTMLInputElement)) return;
    const action = t.dataset['action'];
    const value = t.value;
    // 這幾項和預言無關：還沒有 claim 也要能用
    if (action === 'theme') {
      this.setTheme(value);
      return;
    }
    if (action === 'layout') {
      this.setLayout(value);
      return;
    }
    if (action === 'terms-check' && t instanceof HTMLInputElement) {
      s.termsChecked = t.checked;
      this.invalidate();
      return;
    }
    const claim = s.claim;
    if (!claim) return;
    switch (action) {
      case 'time-kind':
        if (value !== 'current') this.applyTime(chooseTimeKind(claim, value as Claim['time']['kind']), { kindChanged: true });
        break;
      case 'time-days': {
        const edit = setDays(claim, value);
        if (!edit.ok || edit.time.days !== claim.time.days || claim.time.kind !== 'withinDays') {
          this.applyTime(edit, { kindChanged: true });
        }
        break;
      }
      case 'time-start':
      case 'time-end':
        this.onTimeRange();
        break;
      case 'issued':
        this.onIssued(value);
        break;
      case 'region': {
        if (value === 'current') break;
        const region = applyRegionValue(claim.region, value);
        if (!region) break;
        // 改了地點：國外地名的提醒仍然成立，其餘（沒說地點、外海、縣市歧義）換掉
        s.notes = { ...s.notes, region: s.notes.region.filter((f) => f.code === 'region-out-of-scope') };
        this.commit({ ...claim, region }, 'region');
        break;
      }
      case 'buffer': {
        const region = applyBuffer(claim.region, Number(value));
        s.notes = { ...s.notes, region: withoutCodes(s.notes.region, ['region-offshore']) };
        this.commit({ ...claim, region }, 'region');
        break;
      }
      case 'size-kind':
        if (value === 'magnitude' || value === 'intensity' || value === 'unspecified') {
          this.applySize(sizeOfKind(claim.size, value), true);
        }
        break;
      case 'size-value': {
        const v = Number(value);
        if (Number.isFinite(v)) this.applySize(sizeWithValue(claim.size, v), false);
        break;
      }
      case 'tolerance': {
        const tolerance: Tolerance = value === 'lenient' ? 'lenient' : 'strict';
        this.applySize(sizeWithTolerance(claim.size, tolerance), false);
        break;
      }
      default:
        break;
    }
  }

  private onClick(e: MouseEvent): void {
    // 點對話框外面的暗色背景：同意過的人可以這樣關掉
    if (e.target instanceof HTMLElement && e.target.classList.contains('modal-backdrop')) {
      this.closeTerms(false);
      return;
    }
    const target = e.target instanceof Element ? e.target.closest<HTMLElement | SVGElement>('[data-action]') : null;
    if (!target) return;
    const action = target.dataset['action'];
    switch (action) {
      case 'clear':
        this.clear();
        break;
      case 'gate-continue':
        this.state.gate = null;
        this.invalidate();
        this.afterRender.push(() => {
          const overview = document.getElementById('overview');
          if (overview) scrollToElement(overview);
          document.getElementById('headline')?.focus({ preventScroll: true });
        });
        break;
      case 'terms-open':
        this.openTerms();
        break;
      case 'terms-close':
        this.closeTerms(false);
        break;
      case 'terms-accept':
        this.closeTerms(true);
        break;
      case 'example': {
        const text = INPUT.examples[Number(target.dataset['index'])];
        if (text === undefined) return;
        this.state.text = text;
        this.submit();
        this.invalidate();
        break;
      }
      case 'pick-spectrum':
        this.pickSpectrum(target.dataset['id'] ?? '', target.closest('#overview') !== null);
        break;
      case 'copy':
        void this.copyResult();
        break;
      case 'retry':
        void this.load();
        break;
      case 'to-disclaimer':
        // 不改網址的 hash（hash 用來記錄這則解讀）
        e.preventDefault();
        scrollToElement(this.slots.footer);
        this.slots.footer.focus({ preventScroll: true });
        break;
      case 'skip':
        e.preventDefault();
        this.slots.main.focus();
        break;
      default:
        break;
    }
  }

  private onKeydown(e: KeyboardEvent): void {
    const t = e.target;
    if (e.key === 'Escape' && this.state.termsOpen) {
      // 第一次（還沒同意）不能用 Esc 跳過
      e.preventDefault();
      this.closeTerms(false);
      return;
    }
    if (t instanceof HTMLTextAreaElement && t.dataset['action'] === 'text') {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.state.text = t.value;
        this.submit();
      }
      return;
    }
    // 光譜的每一列是 role="button" 的 <g>：Enter／空白鍵和點擊一樣
    if (t instanceof SVGElement && t.dataset['action'] === 'pick-spectrum' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.pickSpectrum(t.dataset['id'] ?? '', t.closest('#overview') !== null);
    }
  }

  private onToggle(e: Event): void {
    const el = e.target;
    if (!(el instanceof HTMLDetailsElement)) return;
    const id = el.dataset['card'];
    if (!id || !isCardId(id)) return;
    const s = this.state;
    const was = s.open.has(id);
    if (el.open) s.open.add(id);
    else s.open.delete(id);
    if (el.open !== was) this.renderCard(id);
  }

  // ============================================================== 畫面

  /** 量圖表可用寬度；有變化時回傳 true。 */
  private measure(): boolean {
    const w = Math.round(this.slots.probe.getBoundingClientRect().width);
    const width = Math.max(240, w > 0 ? w : 320);
    if (width === this.state.chartWidth) return false;
    this.state.chartWidth = width;
    return true;
  }

  /**
   * 合併多次更新、下一個畫格再重畫。背景分頁不會執行 requestAnimationFrame，
   * 所以另外設一個計時器當備案：資料在背景載入完成時，切回來就已經畫好了。
   */
  private invalidate(): void {
    if (this.frame || this.fallbackTimer) return;
    const run = (): void => {
      if (this.frame) window.cancelAnimationFrame(this.frame);
      if (this.fallbackTimer) window.clearTimeout(this.fallbackTimer);
      this.frame = 0;
      this.fallbackTimer = 0;
      this.render();
    };
    this.frame = window.requestAnimationFrame(run);
    this.fallbackTimer = window.setTimeout(run, 120);
  }

  /** 卡片的展開狀態以 DOM 為準（使用者點開與 toggle 事件之間如果剛好重畫，也不會被關回去）。 */
  private syncOpenFromDom(): void {
    for (const el of Array.from(this.slots.results.querySelectorAll<HTMLDetailsElement>('details[data-card]'))) {
      const id = el.dataset['card'];
      if (!id || !isCardId(id)) continue;
      if (el.open) this.state.open.add(id);
      else this.state.open.delete(id);
    }
  }

  private render(): void {
    const s = this.state;
    if (this.frame) {
      window.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    if (this.fallbackTimer) {
      window.clearTimeout(this.fallbackTimer);
      this.fallbackTimer = 0;
    }
    this.syncOpenFromDom();
    morphChildren(this.slots.explainer, explainerHtml(s.claim === null));
    morphChildren(this.slots.input, inputCardHtml(s));
    const map = s.claim && s.data ? miniMapHtml(s.claim, s.data) : html``;
    morphChildren(this.slots.confirm, confirmCardHtml(s, map));
    let results: SafeHtml;
    if (s.computeError) results = html`<div class="card error-box" role="alert">${s.computeError}</div>`;
    else if (s.gate && s.results) results = gateHtml(s.gate, s.source?.parse.flags ?? []);
    else results = resultsHtml(s);
    morphChildren(this.slots.results, results);
    morphChildren(this.slots.why, whyHtml(s.data));
    morphChildren(this.slots.footer, footerHtml(s.data?.meta ?? null));
    this.renderTerms();
    const callbacks = this.afterRender;
    this.afterRender = [];
    for (const cb of callbacks) cb();
  }

  /**
   * 使用規範對話框：打開時頁面其他部分設成 inert（不能點、不能 Tab 進去、螢幕報讀器也跳過），
   * 背景不捲動；剛打開時焦點移到對話框上。
   */
  private renderTerms(): void {
    const s = this.state;
    const wasOpen = this.slots.terms.firstElementChild !== null;
    morphChildren(this.slots.terms, termsHtml(s.termsOpen, termsAccepted(s.prefs), s.termsChecked));
    for (const el of Array.from(this.root.children)) {
      if (el !== this.slots.terms) el.toggleAttribute('inert', s.termsOpen);
    }
    document.body.classList.toggle('modal-open', s.termsOpen);
    if (s.termsOpen && !wasOpen) {
      document.getElementById('terms-dialog')?.focus({ preventScroll: true });
    }
  }

  private renderCard(id: CardId): void {
    const el = this.slots.results.querySelector(`details[data-card="${id}"]`);
    const markup = singleCardHtml(this.state, id);
    if (el && markup) morphElement(el, markup);
  }
}

export function startApp(root: HTMLElement): void {
  new App(root).start();
}
