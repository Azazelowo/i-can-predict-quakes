/**
 * 解析器共用的比對工具。所有比對都在 normalize() 之後的字串上做；因為正規化不改變長度，
 * 比對到的 [start, end) 可以直接用在原文上。
 */

/** 在位置 i 嘗試比對（re 必須帶 y 旗標）。 */
export function execAt(re: RegExp, s: string, i: number): RegExpExecArray | null {
  re.lastIndex = i;
  return re.exec(s);
}

/**
 * 依起點由左到右走過 re（必須帶 g 旗標）的每個比對，直到 visit 回傳 true。
 * 每次從上一個比對起點的下一格繼續找，所以「比對到但不合法」的片段不會把重疊的合法候選吃掉
 * （例如「13/11/15」裡不合法的「13/11」）。
 */
export function forEachMatch(re: RegExp, s: string, visit: (m: RegExpExecArray) => boolean): void {
  re.lastIndex = 0;
  for (;;) {
    const m = re.exec(s);
    if (m === null) return;
    if (visit(m)) return;
    re.lastIndex = m.index + 1;
  }
}

/** 起點最早者；起點相同時取較長者（「這週末」勝過「這週」）。同起點同長度時保留先給的。 */
export function pickEarliest<T extends { start: number; end: number }>(items: readonly (T | null)[]): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (item === null) continue;
    if (best === null || item.start < best.start || (item.start === best.start && item.end > best.end)) best = item;
  }
  return best;
}

export interface LexiconEntry {
  /** 正規化後的詞 */
  word: string;
}

/** 依第一個字分組、每組由長到短排序的詞表（長度相同時保留加入順序）。 */
export function buildLexicon<T extends LexiconEntry>(entries: readonly T[]): ReadonlyMap<string, readonly T[]> {
  const sorted = [...entries].sort((a, b) => b.word.length - a.word.length);
  const byFirst = new Map<string, T[]>();
  for (const entry of sorted) {
    const first = entry.word[0];
    if (first === undefined) continue;
    const bucket = byFirst.get(first);
    if (bucket) bucket.push(entry);
    else byFirst.set(first, [entry]);
  }
  return byFirst;
}

export interface LexiconHit<T> {
  start: number;
  end: number;
  entry: T;
}

/**
 * 由左到右掃描：每個位置先試最長的詞，比對到的字不再重複使用（docs/MODELS.md 2.3）。
 */
export function scanLexicon<T extends LexiconEntry>(s: string, lexicon: ReadonlyMap<string, readonly T[]>): LexiconHit<T>[] {
  const hits: LexiconHit<T>[] = [];
  let i = 0;
  while (i < s.length) {
    const bucket = lexicon.get(s[i] ?? '');
    const entry = bucket?.find((e) => s.startsWith(e.word, i));
    if (entry) {
      hits.push({ start: i, end: i + entry.word.length, entry });
      i += entry.word.length;
    } else {
      i += 1;
    }
  }
  return hits;
}
