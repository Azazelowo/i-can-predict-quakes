/**
 * 數字（docs/MODELS.md 2.1）：阿拉伯數字與中文數字。
 *
 * 中文數字用〇零一二兩三四五六七八九十百，例如「十五」= 15、「三十」= 30、「一百」= 100、
 * 「一百零五」= 105；小數用「點」，例如「六點五」= 6.5。「半」不在這裡處理（只用在「半年」，見 time.ts）。
 *
 * 規格沒寫、我們的解讀（見 notes）：
 * - 「兩三」「三五」「一兩」這類兩個遞增的個位數相連，是口語的約數。回傳較大的那個並標記 approx；
 *   只有時間採用（「兩三天內」= 3 天，窗口寧長勿短，不低估瞎猜的命中率），規模、震度不採用。
 * - 逐字讀的年份（「二〇二六」）在 time.ts 處理，這裡不接受。
 */

const DIGIT: Readonly<Record<string, number>> = {
  '〇': 0,
  '零': 0,
  '一': 1,
  '二': 2,
  '兩': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
};

/** 中文數字用字（放進 regex 字元類別） */
export const CN_NUM_CHARS = '〇零一二兩三四五六七八九十百';
/** 小數與逐字年份可用的字（不含「兩」） */
export const CN_PLAIN_DIGITS = '〇零一二三四五六七八九';

/** 一個數字：阿拉伯數字（可帶小數）或一串中文數字（可用「點」帶小數）。由 parseNumber 驗證。 */
export const NUM_SRC = `(?:\\d+(?:\\.\\d+)?|[${CN_NUM_CHARS}]+(?:點[${CN_PLAIN_DIGITS}]+)?)`;

/**
 * 數字的左邊界：不能從另一個數字的中間開始（「15天」不能讀成「5天」、「1.5」不能讀成「5」、
 * 「十五」不能讀成「五」、「六點五」不能讀成「五」）。句點後面接數字（「地震.3天內」）仍然可以。
 */
export const NUM_LEFT = `(?<!\\d)(?<!\\d\\.)(?<![${CN_NUM_CHARS}點])`;

export interface ParsedNumber {
  value: number;
  /** 阿拉伯數字寫法，例如 "6.5"；給 toTenths 做精確的四捨五入 */
  decimal: string;
  /** 「兩三」這類約數（value 是較大的那個） */
  approx: boolean;
}

/** 單一個中文數字字的值（〇零一二兩三四五六七八九）；其他字回傳 undefined。 */
export function digitValue(ch: string): number | undefined {
  return DIGIT[ch];
}

/** 解析 NUM_SRC 比對到的字串；不合文法（例如「十十」「二三十」）時回傳 null。 */
export function parseNumber(token: string): ParsedNumber | null {
  if (/^\d+(?:\.\d+)?$/.test(token)) return { value: Number(token), decimal: token, approx: false };

  const parts = token.split('點');
  if (parts.length > 2) return null;
  const int = parseChineseInt(parts[0] ?? '');
  if (int === null) return null;
  const frac = parts[1];
  if (frac === undefined) return { value: int.value, decimal: String(int.value), approx: int.approx };
  if (int.approx || frac.length === 0) return null;

  let digits = '';
  for (const ch of frac) {
    const d = DIGIT[ch];
    if (d === undefined || ch === '兩') return null;
    digits += String(d);
  }
  const decimal = `${int.value}.${digits}`;
  return { value: Number(decimal), decimal, approx: false };
}

function parseChineseInt(s: string): { value: number; approx: boolean } | null {
  if (s.length === 0) return null;

  if (!s.includes('十') && !s.includes('百')) {
    const digits: number[] = [];
    for (const ch of s) {
      const d = DIGIT[ch];
      if (d === undefined) return null;
      digits.push(d);
    }
    const [a, b] = digits;
    if (digits.length === 1 && a !== undefined) return { value: a, approx: false };
    // 約數：兩個遞增的個位數（一兩、兩三、三五）
    if (digits.length === 2 && a !== undefined && b !== undefined && a >= 1 && b > a) {
      return { value: b, approx: true };
    }
    return null;
  }

  // 位值寫法：百、十由大到小各出現一次；位值前的數字可省略（「十五」）；「零」只當佔位（「一百零五」）
  let total = 0;
  let pending: number | null = null;
  let lastUnit = Infinity;
  for (const ch of s) {
    if (ch === '十' || ch === '百') {
      const unit = ch === '十' ? 10 : 100;
      if (unit >= lastUnit || pending === 0) return null;
      total += (pending ?? 1) * unit;
      pending = null;
      lastUnit = unit;
      continue;
    }
    const d = DIGIT[ch];
    if (d === undefined) return null;
    if (pending !== null && pending !== 0) return null; // 兩個數字相連（「二三十」）
    pending = d;
  }
  return { value: total + (pending ?? 0), approx: false };
}

/**
 * 四捨五入到一位小數，回傳「十分之一」為單位的整數（"6.55" → 66、"7" → 70）。
 * 用字串計算，避免二進位浮點數的誤差（6.55 × 10 不一定剛好是 65.5）。
 */
export function toTenths(decimal: string): number {
  const [intText = '0', fracText = ''] = decimal.split('.');
  const first = fracText.length > 0 ? Number(fracText[0]) : 0;
  const second = fracText.length > 1 ? Number(fracText[1]) : 0;
  return Number(intText) * 10 + first + (second >= 5 ? 1 : 0);
}
