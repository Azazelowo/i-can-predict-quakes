/**
 * 確認卡下方的小提醒（旗標）管理（純函式）。
 *
 * 解析器的旗標描述的是「原文怎麼被解讀」。使用者在確認卡改了某一項之後，那一項的舊旗標就不再成立
 * （例如改成「下週」之後，「沒說時間」的提醒就該消失），所以旗標依欄位分組，改哪一項就換掉哪一組。
 * 計算時產生的旗標（Results.flags）每次重算都是新的，顯示時再合併、去重。
 */
import type { Claim, Flag, FlagCode } from '../core/types';

export type NoteSlot = 'time' | 'region' | 'size' | 'other';
export type Notes = Record<NoteSlot, Flag[]>;

/** 顯示順序（與 FlagCode 的定義順序相同） */
const ORDER: readonly FlagCode[] = [
  'time-unspecified',
  'time-vague',
  'time-past',
  'time-clamped',
  'region-unspecified',
  'region-out-of-scope',
  'region-offshore',
  'region-ambiguous',
  'size-unspecified',
  'size-level-ambiguous',
  'size-below-min',
  'size-intensity-region-ignored',
  'repeat-mentioned',
];

export function slotOf(code: FlagCode): NoteSlot {
  if (code.startsWith('time-')) return 'time';
  if (code.startsWith('region-')) return 'region';
  if (code.startsWith('size-')) return 'size';
  return 'other';
}

export function emptyNotes(): Notes {
  return { time: [], region: [], size: [], other: [] };
}

export function bucketFlags(flags: readonly Flag[]): Notes {
  const notes = emptyNotes();
  for (const f of flags) notes[slotOf(f.code)].push({ ...f });
  return notes;
}

/**
 * 從分享連結還原時沒有原文，只能由 Claim 本身推得的提醒（時間沒說或模糊、大小沒說）。
 */
export function notesForRestoredClaim(claim: Claim): Notes {
  const notes = emptyNotes();
  if (claim.time.kind === 'unspecified') notes.time.push({ code: 'time-unspecified' });
  if (claim.time.kind === 'vague') notes.time.push({ code: 'time-vague' });
  if (claim.size.kind === 'unspecified') notes.size.push({ code: 'size-unspecified' });
  return notes;
}

export function withoutCodes(flags: readonly Flag[], codes: readonly FlagCode[]): Flag[] {
  return flags.filter((f) => !codes.includes(f.code));
}

export function withCode(flags: readonly Flag[], flag: Flag): Flag[] {
  return flags.some((f) => f.code === flag.code) ? [...flags] : [...flags, flag];
}

/** 要顯示的提醒：各欄位的旗標加上計算旗標，依固定順序、同代碼只留第一個。 */
export function visibleFlags(notes: Notes, computed: readonly Flag[]): Flag[] {
  const seen = new Set<FlagCode>();
  const out: Flag[] = [];
  for (const f of [...notes.time, ...notes.region, ...notes.size, ...notes.other, ...computed]) {
    if (seen.has(f.code)) continue;
    seen.add(f.code);
    out.push(f);
  }
  return out.sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
}
