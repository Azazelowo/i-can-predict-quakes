/**
 * 應用程式狀態（單一物件，由 controller.ts 修改、src/ui/ 唯讀地拿來畫面）。
 *
 * 原則：
 * - 使用者輸入的原文只存在記憶體裡（text、source.text），不寫進網址、不送出、不保存。
 * - claim 是唯一的「真相」：確認卡的每一項修改都產生新的 claim，再重算 results。
 * - version 每次重算加 1，畫面用它判斷要不要重畫比較重的區塊。
 */
import { BAYES_DEFAULTS } from '../core/constants';
import type { BayesParams, Claim, DataBundle, ParseResult, Results, Span } from '../core/types';
import type { TimeError } from './edit';
import { emptyNotes, type Notes } from './notes';

export type Phase = 'loading' | 'ready' | 'error';
export type SpanSlot = Span['slot'];

/** 模式卡的代號（顯示順序） */
export const CARD_IDS = ['m1', 'm2', 'm4', 'm8', 'm10', 'm12', 'm13', 'm14'] as const;
export type CardId = (typeof CARD_IDS)[number];

/** 大小沒說時只顯示這幾張卡 */
export const UNSPECIFIED_CARDS: readonly CardId[] = ['m4', 'm14'];

export function isCardId(value: string): value is CardId {
  return (CARD_IDS as readonly string[]).includes(value);
}

export interface InputMessage {
  kind: 'error' | 'info';
  text: string;
}

export interface AppState {
  phase: Phase;
  loadError: string | null;
  data: DataBundle | null;

  /** 輸入框目前的內容（草稿） */
  text: string;
  /** 新預言用的發布日；使用者在確認卡改過之後沿用 */
  issuedAt: string;
  issuedAtTouched: boolean;

  /** 最近一次解析的原文與結果（從分享連結還原時為 null，畫面改顯示由 claim 產生的描述） */
  source: { text: string; parse: ParseResult } | null;
  fromLink: boolean;

  claim: Claim | null;
  /** 確認卡下方的小提醒（依欄位分組，改哪一項就換掉哪一組） */
  notes: Notes;
  /** 使用者手動改過的欄位（原文標示改成虛線） */
  edited: Set<SpanSlot>;

  results: Results | null;
  /** 每次重算加 1 */
  version: number;

  inputMessage: InputMessage | null;
  computeError: string | null;
  timeError: TimeError | null;
  /** 資料還在載入時就按了「算算看」 */
  pendingSubmit: boolean;

  /** 展開中的模式卡 */
  open: Set<CardId>;
  /** M10 滑桿 */
  bayes: BayesParams;
  copyStatus: 'idle' | 'copied' | 'failed';

  /** 圖表可用的寬度（CSS px），由實際版面量得 */
  chartWidth: number;
}

export function initialState(issuedAt: string): AppState {
  return {
    phase: 'loading',
    loadError: null,
    data: null,
    text: '',
    issuedAt,
    issuedAtTouched: false,
    source: null,
    fromLink: false,
    claim: null,
    notes: emptyNotes(),
    edited: new Set(),
    results: null,
    version: 0,
    inputMessage: null,
    computeError: null,
    timeError: null,
    pendingSubmit: false,
    open: new Set(),
    bayes: { ...BAYES_DEFAULTS },
    copyStatus: 'idle',
    chartWidth: 320,
  };
}
