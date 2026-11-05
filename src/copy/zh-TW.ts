/**
 * 所有給使用者看的文字（繁體中文、台灣用語）。
 *
 * 規則（AGENTS.md）：
 * - 數字只由程式產生：這裡只放模板，數字由呼叫端格式化成字串後傳進來。
 * - 模式只回傳數字與代碼，文字都集中在這裡；之後要加英文，照這個檔案的形狀再寫一份即可。
 * - 文案一律寫「隨便猜也會中的機率」，不寫成「發生地震的機率」，也不用警報式的字眼。
 */
import {
  BOOTSTRAP,
  MAX_WINDOW_DAYS,
  MIN_ML,
  OFFSHORE_BUFFER_KM,
  TAIWAN_BOX,
} from '../core/constants';
import { MAGNITUDE_TYPES, officialTerm } from '../core/terms';
import type { Flag, LevelId } from '../core/types';

// ================================================================ 單位

export const UNITS = {
  points: (x: string) => `${x} 個百分點`,
  times: (x: string) => `${x} 次`,
  days: (x: string) => `${x} 天`,
  bits: (x: string) => `${x} bits`,
} as const;

// ================================================================ 網站

export const SITE = {
  name: '我也會地震預測',
  tagline: '輸入一則地震預言，看看隨便亂猜有多容易中',
  notForecastLink: '這不是地震預報',
  skipLink: '跳到主要內容',
} as const;

export const EXPLAINER = {
  title: '怎麼玩',
  steps: [
    { title: '貼上一則預言', text: '例如「某某說下週會大地震」，或點下面的例子。' },
    { title: '確認我們的理解', text: '時間、地點、大小怎麼解讀，全部攤開給你看，不對可以直接改。' },
    { title: '看看亂猜有多容易中', text: '用中央氣象署的地震目錄，算出就算完全不懂地震、隨便亂猜也會中的機率。' },
  ],
} as const;

// ================================================================ 輸入卡

export const INPUT = {
  title: '輸入一則地震預言',
  label: '預言內容',
  placeholder: '例：某某說下週會大地震',
  submit: '算算看',
  shortcut: '也可以按 Ctrl＋Enter（Mac：⌘＋Enter）送出。',
  examplesLabel: '或試試這些例子：',
  examples: [
    '某某說下週會大地震',
    '老師說這個月花蓮會有規模 6 以上的地震',
    '三天內台灣會有 M7 地震',
    '近期東部外海會有強震',
    '下週會有震度 4 級以上的地震',
    '年底前台北會有有感地震',
  ],
  privacy: '你輸入的文字只留在你的瀏覽器裡，不會送出。',
  scope: '目前只支援台灣及近海（縣市、鄉鎮、分區）的地震預言；國外地區之後再加。',
  clear: '清空',
  clearLabel: '清空內容，重新輸入',
  empty: '先輸入一則預言，再按「算算看」。',
  loading: '正在載入地震資料…',
  waiting: '地震資料還在載入，好了會自動幫你算。',
  loadFailed: (message: string) => `地震資料載入失敗（${message}）。請確認網路連線，再試一次。`,
  retry: '重新載入',
  parseFailed: (message: string) => `這句話暫時解析不了（${message}）。換個說法試試看？`,
  computeFailed: (message: string) => `計算時出了點問題（${message}）。可以調整下面的設定，或換一則預言再試。`,
} as const;

// ================================================================ 確認卡

export type SlotName = 'time' | 'region' | 'size' | 'modifier';

export const CONFIRM = {
  title: '我們這樣理解這則預言',
  intro: '每一項都可以直接修改，改完會立刻重算。',
  originalLabel: '原文',
  legendLabel: '標示說明',
  fromLink: '這則預言是從分享連結打開的。為了保護隱私，連結只記錄我們的解讀，不含原文：',
  slotNames: { time: '時間', region: '地點', size: '大小', modifier: '修飾語' } satisfies Record<SlotName, string>,
  edited: '（已修改）',
  notesTitle: '小提醒',
} as const;

// ================================================================ 時間

/** 星期：0 = 週一 … 6 = 週日（與 src/core/time.ts 的 weekdayMon0 一致） */
export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const;

export const TIME = {
  presetLabel: '說法',
  /** 確認卡下拉選單的預設選項 */
  presets: {
    today: '今天',
    tomorrow: '明天',
    thisWeek: '本週',
    nextWeek: '下週',
    thisMonth: '本月',
    nextMonth: '下個月',
    thisYear: '今年內',
    withinDays: 'N 天內',
    dateRange: '自訂起訖',
  },
  /** 顯示用的名稱（解析器可能產生、但不在預設選項裡的類型也在這裡） */
  names: {
    today: '今天',
    tomorrow: '明天',
    dayAfterTomorrow: '後天',
    thisWeek: '本週',
    nextWeek: '下週',
    weekend: '週末',
    thisMonth: '本月',
    nextMonth: '下個月',
    thisYear: '今年內',
    date: '指定日期',
    dateRange: '指定期間',
    vague: '近期',
    unspecified: '沒說時間',
  },
  /** 解析結果的時間類型不在選單裡時（例如「近期」「週末」），選單多一個「目前」選項 */
  current: (label: string) => `目前：${label}`,
  withinDays: (n: string) => `${n} 天內`,
  month: (m: string) => `${m} 月`,
  until: (date: string) => `${date} 前`,
  date: (m: string, d: string, weekday: string) => `${m}/${d}（${weekday}）`,
  dateWithYear: (y: string, m: string, d: string, weekday: string) => `${y}/${m}/${d}（${weekday}）`,
  dateCompact: (m: string, d: string) => `${m}/${d}`,
  dateCompactWithYear: (y: string, m: string, d: string) => `${y}/${m}/${d}`,
  range: (a: string, b: string) => `${a}～${b}`,
  summary: (label: string, dates: string, days: string) => `${label}：${dates}，共 ${days} 天`,
  short: (label: string, dates: string) => `${label}（${dates}）`,
  daysLabel: '天數 N',
  startLabel: '開始日',
  endLabel: '結束日',
  issuedLabel: '預言發布日',
  errors: {
    days: `天數要是 1 到 ${MAX_WINDOW_DAYS} 之間的整數。`,
    order: '結束日不能早於開始日。',
    tooLong: `時間太長了，最多只能算 ${MAX_WINDOW_DAYS} 天。`,
    invalid: '日期格式不正確，請再選一次。',
    issued: '這個發布日和預言的日期對不上（例如結束日比發布日還早），請再確認一次。',
  },
} as const;

// ================================================================ 地點

export const REGION = {
  selectLabel: '範圍',
  optgroups: { taiwan: '台灣及近海', groups: '分區', counties: '縣市' },
  taiwanName: '台灣及近海',
  taiwanOption: `台灣及近海（北緯 ${TAIWAN_BOX.latMin}–${TAIWAN_BOX.latMax} 度、東經 ${TAIWAN_BOX.lonMin}–${TAIWAN_BOX.lonMax} 度）`,
  current: (names: string) => `目前：${names}`,
  groupMembers: (group: string, names: string) => `${group}包含：${names}。`,
  bufferLabel: '縣界外推',
  bufferOption: (km: number) => (km === 0 ? '0 公里（只算縣內）' : `${km} 公里`),
  bufferHelp: '震央在縣界外這個距離內，也算在範圍裡。',
  joiner: '、',
  withBuffer: (names: string, km: string) => `${names}（含縣界外 ${km} 公里）`,
  insideOnly: (names: string) => `${names}（只算縣內）`,
  map: {
    aria: (region: string, from: string, to: string, minMl: string, total: string, inside: string) =>
      `地圖：範圍是${region}。圓點是 ${from}–${to} 年規模 ${minMl} 以上的地震，共 ${total} 筆，其中 ${inside} 筆在範圍內。`,
    ariaTaiwanBox: '方框是「台灣及近海」的經緯度範圍（南邊延伸到地圖外）。',
    legendInside: '範圍內的地震',
    legendOutside: '範圍外的地震',
    caption: (from: string, to: string, minMl: string) => `圓點：${from}–${to} 年規模 ${minMl} 以上的地震（越大顆規模越大）`,
    unavailable: '暫時無法標出範圍內的地震。',
  },
} as const;

// ================================================================ 大小

export const SIZE = {
  kindLegend: '用什麼衡量',
  kinds: { magnitude: '規模', intensity: '震度', unspecified: '沒說' },
  valueLabel: '門檻',
  magnitudeOption: (v: string) => `規模 ${v}`,
  intensityOption: (name: string) => `震度 ${name}`,
  toleranceLegend: '怎樣算中',
  strict: (said: string, threshold: string) => `嚴格：說 ${said} 就要 ${threshold} 以上`,
  lenient: (said: string, threshold: string) => `寬鬆：說 ${said}，${threshold} 以上也算中`,
  unspecifiedHelp: '沒說多大時，先看結果裡的「解讀光譜」：點一種解讀，或在這裡選規模或震度。',
  magnitudeStrict: (v: string) => `規模 ${v} 以上`,
  magnitudeLenient: (v: string, threshold: string) => `規模 ${v}（${threshold} 以上也算中）`,
  intensity: (name: string) => `震度 ${name}以上`,
  unspecified: '沒說多大',
  /** 震度的顯示名稱：1–4 → N 級；5 → 5 弱；5.5 → 5 強；6 → 6 弱；6.5 → 6 強；7 → 7 級 */
  intensityName(v: number): string {
    if (v === 5) return '5 弱';
    if (v === 5.5) return '5 強';
    if (v === 6) return '6 弱';
    if (v === 6.5) return '6 強';
    return `${v} 級`;
  },
} as const;

// ================================================================ 旗標（確認卡下方的小提醒）

/** days：目前時間窗的天數（「我們先用 N 天計算」的 N） */
export function flagText(flag: Flag, days: number): string {
  const detail = (flag.detail ?? '').trim();
  switch (flag.code) {
    case 'time-unspecified':
      return `沒說什麼時候。沒有期限的預言遲早會「中」，我們先用 ${days} 天計算。`;
    case 'time-vague':
      return detail
        ? `「${detail}」沒有明確天數，我們先用 ${days} 天計算。`
        : `這個時間說法沒有明確天數，我們先用 ${days} 天計算。`;
    case 'time-past':
      return '這個日期已經過了，我們照樣用它計算。';
    case 'time-clamped':
      return `時間太長，最多算 ${MAX_WINDOW_DAYS} 天。`;
    case 'region-unspecified':
      return '沒說地點，我們用「台灣及近海」計算。';
    case 'region-out-of-scope':
      return detail
        ? `提到國外（${detail}）。目前只算台灣；把國外也算進來，命中率只會更高。`
        : '提到國外。目前只算台灣；把國外也算進來，命中率只會更高。';
    case 'region-offshore':
      return `提到外海，範圍改成縣界外推 ${OFFSHORE_BUFFER_KM} 公里。`;
    case 'region-ambiguous':
      return detail
        ? `「${detail}」可能是縣也可能是市，兩個都算。`
        : '這個地名可能是縣也可能是市，兩個都算。';
    case 'size-unspecified': {
      const official = officialTerm(detail);
      const base = detail
        ? `沒說多大（「${detail}」）。「大」沒有標準，我們把常見的解讀都算出來了。`
        : '沒說多大。「大」沒有標準，我們把常見的解讀都算出來了。';
      return official ? `${base}參考：${official.meaning}。` : base;
    }
    case 'size-level-ambiguous':
      return '「幾級」可能是規模也可能是震度，我們先當成規模；可以在下面改成震度。';
    case 'size-below-min':
      return `規模 ${MIN_ML} 以下的小地震太多、早期紀錄也不完整，我們用 ${MIN_ML.toFixed(1)} 計算（實際命中率只會更高）。`;
    case 'size-intensity-region-ignored':
      return '震度資料只有「全台任一地點的最大震度」，所以不套用地點。';
    case 'time-multiple':
      return `提到好幾個時間（${detail}），我們先用最先出現的那個；可以在上面改。`;
    case 'region-foreign-only':
      return '這則預言只提到國外，沒有台灣的地名。本網站目前只算台灣及近海。';
    case 'region-town':
      return `提到鄉鎮（${detail}），我們用它所在的縣市計算（含縣界外的範圍），範圍會比鄉鎮大一些。`;
    case 'region-union':
      return `提到好幾個地點（${detail}），我們全部合在一起算：任何一個地方發生都算中，所以命中率會比只說一個地方高。`;
    case 'size-multiple':
      return `提到好幾個不同的大小（${detail}），我們先用最先出現的那個；可以在下面改。`;
    case 'size-magnitude-type': {
      const name = MAGNITUDE_TYPES[detail.toLowerCase()] ?? detail;
      return `你寫的是${name}。本網站用中央氣象署的近震規模 ML，兩種規模的數值不同（例如 1999 年集集地震 ML 7.3、Mw 7.7），這裡直接把數字當成 ML 計算。`;
    }
    case 'size-official-term': {
      const official = officialTerm(detail);
      if (!official) return `「${detail}」是中央氣象署的分級名稱，我們照官方定義計算。`;
      const size = official.size;
      // 我們的判定一律是「≥ 門檻」：寫出實際用的門檻，不說「照定義計算」（微小地震、小地震是一個範圍）
      const threshold =
        size === null
          ? ''
          : size.kind === 'magnitude'
            ? `規模 ${size.value.toFixed(1)} 以上`
            : size.kind === 'intensity'
              ? `震度 ${size.value} 級以上`
              : '';
      return threshold
        ? `「${detail}」是${official.meaning}。這裡當成「${threshold}」計算；可以在下面改。`
        : `「${detail}」是${official.meaning}。`;
    }
    case 'size-unsupported-term':
      return `「${detail}」這類量（地表加速度等）本網站沒有計算，我們只算規模與震度。`;
    case 'repeat-mentioned':
      return '他不只說過一次？看看下面的「亂槍打鳥」。';
  }
}

// ================================================================ 解讀光譜、等級、生活換算

/** M4a 解讀光譜的名稱（id 對應 src/core/constants.ts 的 SPECTRUM） */
export const SPECTRUM_LABELS: Readonly<Record<string, string>> = {
  felt: '有感地震（震度 1 級以上）',
  i3: '震度 3 級以上',
  i4: '震度 4 級以上',
  i5: '震度 5 弱以上',
  i6: '震度 6 弱以上',
  'm4.5': '規模 4.5 以上',
  m5: '規模 5.0 以上',
  'm5.5': '規模 5.5 以上',
  m6: '規模 6.0 以上',
  'm6.5': '規模 6.5 以上',
  m7: '規模 7.0 以上',
};

/** M12 算命師等級 */
export const LEVEL_TEXT: Readonly<Record<LevelId, { name: string; meaning: string }>> = {
  benefactor: { name: '🔮 你今年會遇到貴人', meaning: '幾乎必中，猜中不代表任何能力。' },
  worry: { name: '你最近有點煩惱', meaning: '冷讀術等級，猜中很正常。' },
  coin: { name: '擲硬幣', meaning: '猜中算運氣不錯，但不稀奇。' },
  something: { name: '有點東西', meaning: '單次猜中值得記一筆，但還要看他猜過幾次。' },
  rare: { name: '稀有', meaning: '猜中會讓人驚訝，值得認真檢驗。' },
  oracle: { name: '神諭', meaning: '真的猜中、而且只猜這一次，才是值得研究的訊號。' },
};

/** M12 生活機率換算（id 對應 src/core/constants.ts 的 ANALOGIES） */
export const ANALOGY_TEXT: Readonly<Record<string, string>> = {
  'not-ten-heads': '連續擲 10 次硬幣，不是全部正面',
  'not-spade-ace': '從整副撲克牌抽一張，不是黑桃 A',
  'not-double-six': '擲兩顆骰子，不是兩顆都 6 點',
  'not-six': '擲一顆骰子，不是 6 點',
  'one-head-in-two': '擲兩次硬幣，至少一次正面',
  'one-to-four': '擲骰子出現 1 到 4 點',
  coin: '擲硬幣出現正面',
  'one-or-two': '擲骰子出現 1 或 2 點',
  heart: '從撲克牌抽到紅心',
  six: '擲骰子出現 6 點',
  'birth-month': '猜中陌生人的生日月份',
  'double-six': '擲兩顆骰子都是 6 點',
  card: '從整副撲克牌抽中指定的一張',
  birthday: '猜中陌生人的生日是哪一天',
  'ten-heads': '連續擲 10 次硬幣都是正面',
  'twenty-heads': '連續擲 20 次硬幣都是正面',
};

// ================================================================ 性質標記

export type Nature = 'fact' | 'model' | 'assumption';

export const NATURE: Readonly<Record<Nature, { tag: string; meaning: string }>> = {
  fact: { tag: '【事實】', meaning: '由資料直接計數' },
  model: { tag: '【模型】', meaning: '依模型假設計算' },
  assumption: { tag: '【假設】', meaning: '我們選擇的解讀方式' },
};

// ================================================================ 總覽

export const OVERVIEW = {
  title: '結果總覽',
  computing: '這則預言：',
  empiricalLead: (p: string) => `就算隨便亂猜，這種預言也有 ${p} 的機率會中`,
  empiricalSub: (years: string, from: string, to: string, p: string) =>
    `過去 ${years} 年（${from}–${to}）裡，任選一天當作預言發布日，有 ${p} 的時候真的應驗。`,
  upperPrefix: '最多約',
  upperLead: (years: string, p: string) => `過去 ${years} 年從沒發生過；依平均速率估計，最多約 ${p}。`,
  upperSub: '「從沒發生過」不代表不可能；這個上限來自固定速率模型（M2）的 95% 區間。',
  spectrumLead: '看你怎麼定義「大」：',
  spectrumSub: '同一句話，「大」可以是有感就算，也可以是非常強的地震。命中率差這麼多，所以先給你整條光譜。',
  spectrumInvite: '點一種解讀就能看到完整分析；也可以在上面的確認卡直接選規模或震度。',
  analogy: (text: string, num: string, den: string) => `≈ ${text}（${num}/${den}）`,
  analogyLabel: '生活換算',
  levelLabel: '算命師等級',
  consensusTitle: '模型共識',
  consensusHelp: '兩種算法各自的估計與 95% 區間。為什麼不一樣，請看下面的 M14。',
  factorsTitle: '灌水成分',
  factorsHelp: '一次只把一個條件收緊，看命中率掉多少：掉得越多，代表這則預言越靠這一招變得容易中。',
  factorsNone: '這則預言已經說得很具體，沒有可以再收緊的條件。',
  factorDims: { time: '時間', region: '地點', size: '大小', tolerance: '判定' },
  factorChange: {
    time: '如果只說某一天',
    region: (region: string) => `如果只說${region}`,
    size: (size: string) => `如果只說${size}`,
    tolerance: (size: string) => `如果改成嚴格判定（${size}）`,
  },
  factorLine: (dim: string, change: string, from: string, to: string, ratio: string) =>
    `${dim}：${change}，命中率從 ${from} 降到 ${to}（×${ratio}）`,
  factorNever: (dim: string, change: string, years: string) => `${dim}：${change}，收緊後 ${years} 年來從沒發生過`,
  factorBarsLabel: (from: string, to: string) => `原本 ${from}，收緊後 ${to}`,
  bayesTitle: '要連中幾次才值得相信？',
  bayesCount: (k: string) => `${k} 次`,
  bayesLine: (prior: string, k: string, target: string) =>
    `如果一開始只有 ${prior} 相信他真的會預測，他要連續猜中 ${k} 次，你才有 ${target} 的把握他不是亂猜。`,
  bayesNever: '再怎麼猜中都無法和亂猜區分',
  bayesNeverDetail: '這種預言亂猜也幾乎都會中，猜中再多次也證明不了什麼。',
  bayesZero: '一開始就已經達到目標把握，不用再猜。',
  infoTitle: '資訊量',
  infoLine: (bits: string) => `這則預言的資訊量約 ${bits} bits，相當於連續猜中 ${bits} 次擲硬幣`,
  infoLineLow: (bits: string) => `這則預言的資訊量約 ${bits} bits，連猜中一次擲硬幣都不到`,
  notForecast: '這是「隨便亂猜也會中」的歷史頻率，不是這段期間真的會發生地震的機率，也不是地震預報。',
  everyN: (n: string) => `平均每猜 ${n} 次，就會中 1 次。`,
  everyNAlmost: '幾乎每次都會中。',
  compareTitle: '對照組：其他說法亂猜會中多少？',
  compareHelp: '同樣用過去的資料、同樣的算法。這則預言排在哪裡，一看就知道。',
  compareThis: '（這則預言）',
  compareRefs: {
    weekFelt: '下週台灣會發生有感地震',
    monthM5: '一個月內台灣會有規模 5 以上',
    weekHualienM6: '下週花蓮會有規模 6 以上',
    dayTaipeiM6: '明天台北會有規模 6 以上',
    yearM7: '一年內台灣會有規模 7 以上',
  },
  copy: '複製結果',
  copied: '已複製結果和連結，可以貼給朋友了。',
  copyFailed: '無法自動複製；可以直接複製網址列的連結。',
  linkNote: '網址會跟著更新：複製網址就能分享同一則解讀，連結裡不含原文。',
} as const;

/** 分享文字：永遠不含原文（原文可能有人名） */
export const SHARE = {
  empirical: (time: string, region: string, size: string, p: string, level: string, url: string) =>
    `【我也會地震預測】${time}、${region}、${size}：就算隨便亂猜也有 ${p} 會中（${level}）。${url}`,
  upper: (time: string, region: string, size: string, years: string, p: string, level: string, url: string) =>
    `【我也會地震預測】${time}、${region}、${size}：過去 ${years} 年從沒發生過，隨便亂猜最多約 ${p} 會中（${level}）。${url}`,
  spectrum: (time: string, region: string, low: string, high: string, url: string) =>
    `【我也會地震預測】${time}、${region}、沒說多大：看「大」怎麼定義，隨便亂猜有 ${low}～${high} 會中。${url}`,
} as const;

/** 螢幕報讀器的狀態更新 */
export const STATUS = {
  updated: (claim: string, result: string) => `已更新：${claim}。${result}`,
  empirical: (p: string) => `就算隨便亂猜也有 ${p} 會中。`,
  upper: (p: string) => `過去從沒發生過，依平均速率估計最多約 ${p}。`,
  spectrum: (low: string, high: string) => `看怎麼定義「大」，命中率從 ${low} 到 ${high}。`,
} as const;

// ================================================================ 模式卡共用

export const MODES = {
  title: '深入看看：每種算法怎麼算',
  intro: '每張卡片回答一個不同的問題。點開可以看圖表、代入這則預言數字的公式、假設和資料來源。',
  introUnspecified: '沒說多大時，單一機率沒有意義；先看解讀光譜（M4）和模型比較（M14）。選定大小之後，其他算法就會出現。',
  natureLegend: '標記：',
  formula: '公式（代入這則預言）',
  assumptions: '假設與限制',
  sourceMagnitude: (source: string, region: string, threshold: string, from: string, to: string) =>
    `資料：${source}；${region}、規模 ML ≥ ${threshold}；${from}–${to} 年。`,
  sourceIntensity: (source: string, intensity: string, from: string, to: string) =>
    `資料：${source}；全台任一地點最大震度 ≥ ${intensity}；${from}–${to} 年。`,
  sourceBoth: (catalog: string, felt: string, from: string, to: string) =>
    `資料：${catalog}（規模）；${felt}（震度）；${from}–${to} 年。`,
  sourceHeadline: '用總覽的主數字當作單次命中率 p。',
} as const;

export const M1 = {
  code: 'M1',
  title: '歷史回放',
  question: (years: string) => `過去 ${years} 年，同樣長度的窗口有幾成真的發生？`,
  explain: (from: string, to: string, days: string, windows: string, hits: string, p: string) =>
    `把 ${from} 到 ${to} 年的每一天都當成「預言發布後的第一天」，往後數 ${days} 天，看這段期間有沒有發生符合條件的地震。全部 ${windows} 個窗口裡，有 ${hits} 個真的發生了，所以亂猜的命中率是 ${p}。這個方法不需要任何模型，地震成群發生的特性也自動算在裡面。`,
  chartTitle: (days: string) => `日曆熱圖：每一格是不重疊的 ${days} 天，塗色代表那段期間真的發生了`,
  heatmapAria: (days: string, slots: string, hits: string, share: string) =>
    `日曆熱圖：從資料期間第一天起每 ${days} 天一格，共 ${slots} 格，其中 ${hits} 格有符合條件的地震（${share}）。`,
  legendHit: '有發生（猜中）',
  legendMiss: '沒有發生',
  tableCaption: '每年的窗口命中情況',
  tableHead: ['年份', '命中的窗口', '窗口數', '比例'],
  /** result 含等號或不等號，例如「= 41.2%」「> 99.9%」（見 src/ui/format.ts 的 percentResult） */
  formula: (hits: string, windows: string, result: string) => `p̂ = 命中的窗口 ÷ 全部窗口 = ${hits} ÷ ${windows} ${result}`,
  ciLine: (low: string, high: string) =>
    `95% 區間：以「年」為單位重新抽樣 ${BOOTSTRAP.replicates.toLocaleString('zh-TW')} 次（年區塊拔靴法）→ ${low}～${high}`,
  assumptions: (events: string) => [
    '每一天都可能是預言發布日，機會均等。',
    '窗口彼此重疊、不是獨立樣本，所以區間用年區塊拔靴法估計，不直接套二項分布。',
    '沒有去除餘震：預言「猜中」餘震也算中。',
    `期間內符合條件的地震共 ${events} 筆。`,
  ],
} as const;

export const M2 = {
  code: 'M2',
  title: '固定速率（Poisson）',
  question: '如果地震以平均速率、彼此獨立地發生，機率是多少？',
  explain: (years: string, n: string, rate: string, days: string) =>
    `${years} 年裡符合條件的地震共 ${n} 次，平均每年 ${rate} 次。假設地震像隨機落下的雨滴，以固定速率、彼此獨立地發生，${days} 天內一次都沒有的機率是 e^(−λT)，至少一次的機率就是 1 減掉它。`,
  chartTitle: (days: string, mean: string) => `模型裡，${days} 天內發生 0、1、2…次的機率（平均 ${mean} 次）`,
  chartAria: (days: string, mean: string, zero: string) =>
    `固定速率模型下，${days} 天內平均發生 ${mean} 次；一次都沒有的機率是 ${zero}。`,
  legendZero: '一次都沒有（沒中）',
  legendSome: '至少一次（中了）',
  axisCount: '發生次數',
  /** 次數分布最後一欄：K 次以上 */
  tickAtLeast: (k: string) => `≥${k}`,
  countAtLeast: (k: string) => `${k} 次以上`,
  tableCaption: '固定速率模型下，窗口內發生次數的機率',
  tableHead: ['發生次數', '機率'],
  rate: (n: string, years: string, rate: string) => `λ = n ÷ Y = ${n} ÷ ${years} = ${rate} 次／年`,
  /** result 含等號或不等號，例如「= 53.0%」「> 99.9%」 */
  prob: (rate: string, days: string, result: string) =>
    `p = 1 − exp(−λ × T ÷ 365.25) = 1 − exp(−${rate} × ${days} ÷ 365.25) ${result}`,
  ciLine: (low: string, high: string) => `95% 區間（Garwood 精確區間）：${low}～${high}`,
  vsHigher: (diff: string) =>
    `比歷史回放（M1）高 ${diff}：地震常常成群發生，同一段時間一次來好幾個，所以「至少一次」的窗口比固定速率模型少。`,
  vsLower: (diff: string) =>
    `比歷史回放（M1）低 ${diff}：這比較少見，代表這類地震在歷史上分布得比「完全隨機」還平均。`,
  vsSame: '和歷史回放（M1）幾乎一樣。',
  assumptions: (years: string) => [
    '地震以固定速率發生、彼此獨立（實際上會成群發生）。',
    `速率用 ${years} 年的平均，不考慮最近是否特別活躍。`,
    '區間只反映「資料只有這幾年」的不確定性，不包含模型本身的誤差。',
  ],
} as const;

export const M4 = {
  code: 'M4',
  title: '解讀光譜與敏感度',
  question: '「大地震」到底多大？換個說法，命中率差多少？',
  explain: (count: string) =>
    `同一句話，「大」可以是有感地震，也可以是非常強的地震。我們把 ${count} 種常見的解讀都用歷史回放算一次；再把規模和天數排成表格，看每一格的命中率；最後一次只收緊一個條件，看這則預言靠哪一招變得容易中。`,
  spectrumTitle: '解讀光譜',
  spectrumHelp: '點一列，就改用那種解讀重算。',
  spectrumAria: (count: string, low: string, high: string) =>
    `解讀光譜：${count} 種解讀的命中率，從 ${low} 到 ${high}。每一列都是按鈕，可以改用那種解讀。`,
  spectrumRowAria: (label: string, p: string, current: boolean) =>
    `${label}：${p}${current ? '（目前的解讀）' : '。點一下改用這個解讀'}`,
  spectrumCurrent: '目前',
  legendMagnitude: '規模（套用預言的地區）',
  legendIntensity: '震度（全台任一地點最大震度）',
  matrixTitle: '敏感度矩陣：規模門檻 × 天數',
  matrixHelp: (region: string) => `地區：${region}；規模用嚴格判定。框起來的格子是這則預言。`,
  matrixCaption: '敏感度矩陣：每一列是規模門檻、每一欄是天數，格子裡是歷史回放的命中率',
  matrixCorner: '規模 ＼ 天數',
  matrixDays: (d: string) => `${d} 天`,
  matrixMag: (m: string) => `≥ ${m}`,
  matrixClaim: '（這則預言）',
  factorsTitle: '灌水成分',
  factorsUnspecified: '沒說多大時不計算灌水成分：先在上面的光譜點一種解讀，或在確認卡選規模或震度。',
  factorsAria: (count: string) => `灌水成分：${count} 個條件各自收緊後的命中率變化`,
  legendFrom: '原本',
  legendTo: '收緊後',
  factorShort: {
    time: '只說某一天',
    region: (region: string) => `只說${region}`,
    size: (size: string) => `只說${size}`,
    tolerance: '改成嚴格判定',
  },
  factorsTableCaption: '灌水成分：收緊前後的命中率',
  factorsTableHead: ['收緊哪個條件', '原本', '收緊後', '倍數'],
  formula: (days: string) => [
    `每一項都是 M1 的 p̂ = 命中的窗口 ÷ 全部窗口（同樣 T = ${days} 天）`,
    '灌水倍數 = 原本的命中率 ÷ 收緊後的命中率',
  ],
  assumptions: [
    '規模一律用嚴格判定（說 6 就要 6.0 以上）。',
    '震度是「全台任一地點的最大震度」，不套用地區。',
    '矩陣和規模類解讀都套用預言的地區。',
    '收緊時一次只改一個條件，其他維持原樣。',
  ],
} as const;

export const M8 = {
  code: 'M8',
  title: '亂槍打鳥',
  question: '同一個人一直發同樣的預言，至少中一次的機率？',
  explain: (days: string) =>
    `預言家很少只說一次。如果他每 ${days} 天就說一次「接下來 ${days} 天會…」，說了很多次之後，至少中一次幾乎是必然的。我們用兩種方式算：假設每次互相獨立（模型），以及直接拿歷史上連續的窗口來數（事實，保留地震成群發生的特性）。`,
  tableCaption: '說了 n 次以後：至少中一次的機率，以及平均中幾次',
  tableHead: ['說了幾次', '至少中一次：獨立假設', '至少中一次：歷史實際', '平均中幾次：獨立假設', '平均中幾次：歷史實際'],
  /** 看得到的表格用兩層表頭（手機上比較不會擠成好幾行） */
  tableFirst: '說了幾次',
  tableGroups: ['至少中一次', '平均中幾次'],
  tableSub: ['獨立假設', '歷史實際'],
  times: (n: string) => `${n} 次`,
  /** 摘要列的重點數字：說 52 次，至少中一次的歷史比例 */
  peek: (n: string, p: string) => `說 ${n} 次：${p}`,
  yearTag: '（約一年份）',
  histTitle: (n: string) => `一年份（連續 ${n} 次）會中幾次？`,
  histAria: (n: string, mode: string) => `連續 ${n} 次預言的命中次數分布；歷史上最常見的是中 ${mode} 次。`,
  legendHistorical: '歷史實際',
  legendBinomial: '獨立假設（二項分布）',
  axisHits: '猜中次數',
  /** 次數太多、合併成區間時的標籤 */
  binRange: (a: string, b: string) => `${a}–${b}`,
  histTableCaption: '一年份預言的命中次數分布',
  histTableHead: ['猜中次數', '歷史實際', '獨立假設'],
  /** atLeastOne 含等號或不等號，例如「= 88.0%」「> 99.9%」 */
  formula: (p: string, n: string, atLeastOne: string, e: string) => [
    `至少中一次 = 1 − (1 − p)^n = 1 − (1 − ${p})^${n} ${atLeastOne}`,
    `平均中幾次 = n × p = ${n} × ${p} = ${e}`,
  ],
  assumptions: [
    '每次預言的窗口首尾相接、不重疊。',
    '「獨立假設」忽略地震成群發生；「歷史實際」直接用真實的地震序列。',
    'p 用總覽的主數字。',
  ],
} as const;

export const M10 = {
  code: 'M10',
  title: '要連中幾次才可信',
  question: '他猜中了，該多相信他真的會預測？',
  explain: (p0: string) =>
    `就算是亂猜，這種預言也有 ${p0} 的機率會中，所以猜中一次說明不了什麼。用貝氏定理來算：每猜中一次，「他真的有能力」的勝算就乘上「有能力的人猜中的機率 ÷ 亂猜猜中的機率」。要連中幾次，才能讓你有足夠的把握？`,
  sliders: {
    prior: '一開始相信他有能力的機率',
    target: '想要達到的把握',
    skill: '真有能力的人，每次猜中的機率',
  },
  resultLabel: '要連續猜中',
  result: (k: string) => `${k} 次`,
  resultNever: '再怎麼猜中都無法和亂猜區分',
  resultNeverWhy: '有能力的人猜中的機率，沒有比亂猜高，所以猜中不會增加可信度。',
  resultZero: '不用猜：一開始就已經達到目標把握',
  afterOne: (from: string, to: string) => `猜中一次後，相信他有能力的機率從 ${from} 變成 ${to}。`,
  chartTitle: '連續猜中 k 次後，相信他有能力的機率',
  chartAria: (k: string, target: string) => `連續猜中的次數與可信度；連中 ${k} 次後達到 ${target} 的把握。`,
  chartAriaNever: '連續猜中的次數與可信度；再怎麼猜中，可信度都不會提高。',
  targetLabel: (t: string) => `目標 ${t}`,
  hitLabel: (k: string) => `第 ${k} 次`,
  axisK: '連續猜中次數 k',
  tableCaption: '連續猜中 k 次後的可信度',
  tableHead: ['k', '相信他有能力的機率'],
  odds: (prior: string, target: string) =>
    `勝算 = 機率 ÷ (1 − 機率)：一開始的勝算 = ${prior}，目標勝算 = ${target}`,
  lr: (s: string, p0: string, lr: string) => `每猜中一次，勝算乘上 s ÷ p0 = ${s} ÷ ${p0} = ${lr}`,
  k: (x: string, k: string) => `k = ⌈ ln(目標勝算 ÷ 一開始的勝算) ÷ ln(s ÷ p0) ⌉ = ⌈ ${x} ⌉ = ${k}`,
  kNever: 's ÷ p0 ≤ 1：猜中不會讓勝算變大。',
  assumptions: [
    '一開始的相信程度、目標把握、能力者的命中率都是假設，請用滑桿調整。',
    '只算連續猜中、沒有失誤的情況；猜錯一次，可信度會大幅下降。',
    '前提是他每次預言都公開記錄，而不是只挑猜中的講。',
  ],
} as const;

export const M12 = {
  code: 'M12',
  title: '生活換算與算命師等級',
  question: '這個機率像什麼？',
  explain: '機率數字很抽象。我們把它換成生活中確切知道機率的事，再對照「算命師等級」：命中率越高，猜中越不稀奇。',
  ladderTitle: '算命師等級',
  ladderAtLeast: (p: string) => `${p} 以上`,
  ladderBetween: (low: string, high: string) => `${low}～${high}`,
  ladderBelow: (p: string) => `未滿 ${p}`,
  here: '這則預言在這裡',
  scaleTitle: '生活機率尺',
  scaleHelp: '越上面越容易發生；刻度依「勝算」的對數排列，所以很小和很大的機率都看得清楚。',
  scaleMarker: (p: string) => `這則預言：${p}`,
  scaleItem: (text: string, fraction: string) => `${text}（${fraction}）`,
  scaleAria: (p: string, closest: string) => `生活機率尺：這則預言的機率 ${p}，最接近「${closest}」。`,
  scaleTableCaption: '生活事件的機率',
  scaleTableHead: ['事件', '機率'],
  closest: '最接近',
  formula: [
    '等級：由上往下，找第一個「p ≥ 下限」的等級',
    '換算：選 |logit(p) − logit(a)| 最小的事件，logit(x) = ln(x ÷ (1 − x))',
  ],
  assumptions: [
    '等級的門檻和名稱是我們訂的，不是學術標準。',
    '生活事件都是精確機率（例如骰子 1/6）；生日類假設生日平均分布。',
  ],
} as const;

export const M13 = {
  code: 'M13',
  title: '資訊量',
  question: '這則預言提供了多少資訊？',
  explain:
    '資訊量衡量「猜中這件事有多不容易」，單位是 bit：擲硬幣猜中一次是 1 bit。越容易中的預言，資訊量越接近 0；連 1 bit 都不到的預言，等於沒說什麼。',
  chartTitle: '和生活事件比一比（bits 越多，越難猜中）',
  chartAria: (bits: string) => `這則預言的資訊量約 ${bits} bits，和幾個生活事件並列比較。`,
  thisClaim: '這則預言',
  tableCaption: '資訊量比較',
  tableHead: ['事件', '機率', '資訊量（bits）'],
  formula: (p: string, bits: string) => `bits = −log₂(p) = −log₂(${p}) = ${bits}`,
  assumptions: [
    '只看這則預言的背景機率，不代表預言者的能力。',
    '資訊量和機率是同一件事的兩種說法：每多 1 bit，機率就減半。',
  ],
} as const;

export const M14 = {
  code: 'M14',
  title: '為什麼模型答案不一樣',
  question: '同一則預言，為什麼不同算法給出不同的數字？',
  explain: '「隨便猜」的機率，要看「隨機」怎麼定義。用不同的虛無模型會得到不同的答案，所以我們把它們並列，而不是只給一個看似精確的數字。',
  tableCaption: 'M1 與 M2 的結果',
  tableHead: ['算法', '命中率', '95% 區間', '區間怎麼算'],
  rowM1: 'M1 歷史回放',
  rowM2: 'M2 固定速率',
  ciM1: '年區塊拔靴法',
  ciM2: 'Garwood 精確區間',
  diff: (d: string) => `差距（M2 − M1）：${d}`,
  noSize: '選定大小之後，這裡會並列 M1 和 M2 的結果。',
  kindsTitle: '兩種「隨機」',
  kindsHead: ['', '回答什麼', '用在哪裡'],
  kinds: [
    { name: 'A. 預言固定、地震照常發生', answers: '這則預言本來就會中的機率', use: '單一則預言的背景機率（M1、M2、M4）' },
    { name: 'B. 地震固定、預言隨機亂發', answers: '亂猜的人能有多好看的戰績', use: '亂猜的人能有多好看的戰績（M8 的歷史實際）' },
  ],
  clustering:
    '虛無模型如果忽略地震會成群發生，預測方法會看起來比實際更準（Michael, 1997）。所以我們並列不考慮群聚的 M2 和保留真實群聚的 M1，而不是只給一個數字。',
  refsTitle: '參考文獻',
  assumptions: [
    'M1 與 M2 用的是同一批符合條件的地震，差別只在「隨機」的模型。',
    '兩者都沒有去除餘震，也都不是「今天」的即時機率。',
  ],
} as const;

export const REFERENCES: readonly { text: string; url: string }[] = [
  {
    text: 'Michael, A. J. (1997). Testing prediction methods: Earthquake clustering versus the Poisson model. Geophysical Research Letters, 24(15), 1891–1894.',
    url: 'https://doi.org/10.1029/97GL01928',
  },
  {
    text: 'Stark, P. B. (1997). Earthquake prediction: the null hypothesis. Geophysical Journal International, 131(3), 495–499.',
    url: 'https://doi.org/10.1111/j.1365-246X.1997.tb06593.x',
  },
  {
    text: 'Luen, B., & Stark, P. B. (2008). Testing earthquake predictions. IMS Collections: Probability and Statistics, Essays in Honor of David A. Freedman.',
    url: 'https://arxiv.org/abs/0805.3032',
  },
];

// ================================================================ 圖表共用

export const CHART = {
  consensusAria: (m1: string, m1Ci: string, m2: string, m2Ci: string) =>
    `模型共識：M1 歷史回放 ${m1}（95% 區間 ${m1Ci}）；M2 固定速率 ${m2}（95% 區間 ${m2Ci}）。`,
  consensusTableCaption: '模型共識',
  consensusTableHead: ['算法', '命中率', '95% 區間'],
  m1Label: 'M1 歷史回放',
  m2Label: 'M2 固定速率',
  probability: '機率',
} as const;

// ================================================================ 頁尾

export const FOOTER = {
  disclaimerTitle: '這不是地震預報',
  disclaimer:
    '這不是地震預報。這裡算的是「隨便猜也會中」的背景機率：任何一週都差不多，不代表這週特別危險。地震發生的時間、地點和規模，目前都無法準確預測；官方地震資訊請見中央氣象署。',
  privacy: '本網站不會傳送、也不會保存你輸入的內容，所有計算都在你的瀏覽器裡完成。',
  dataTitle: '資料來源與授權',
  licensesTitle: '授權',
  period: (from: string, to: string, timezone: string) => `資料期間：${from}～${to}（${timezone}）`,
  catalog: (source: string, count: string, type: string, minMl: string) =>
    `地震目錄：${source}，規模 ${minMl} 以上共 ${count} 筆（${type}）`,
  felt: (source: string, count: string) => `有感地震：${source}，共 ${count} 筆`,
  counties: (source: string) => `縣市界線：${source}`,
  loading: '資料載入後會在這裡列出來源與授權。',
  linksTitle: '連結',
  links: { cwa: '中央氣象署地震測報中心', methods: '方法說明', source: '原始碼' },
  termsLink: '使用規範',
  resourcesTitle: '延伸閱讀與官方資料',
  /** 每個網址都在 2026-11-05 確認過可以開啟 */
  resources: [
    { group: '中央氣象署地震百問', items: [
      { text: '地震百問（全部題目）', url: 'https://scweb.cwa.gov.tw/zh-tw/guidance/faq/' },
      { text: '政府是否能對地震做預報？', url: 'https://scweb.cwa.gov.tw/zh-TW/Guidance/FAQdetail/96' },
      { text: '如何以地震規模區分地震之大小？（微小、小、中、大地震）', url: 'https://scweb.cwa.gov.tw/zh-TW/Guidance/FAQdetail/34' },
      { text: '何謂震度？（震度分級表）', url: 'https://scweb.cwa.gov.tw/zh-TW/Guidance/FAQdetail/36' },
      { text: '各種地震規模的計算值都是一樣的嗎？（ML、Mw、Ms、mb）', url: 'https://scweb.cwa.gov.tw/zh-TW/Guidance/FAQdetail/28' },
      { text: '何謂局發、小區域、稍顯著地震及顯著地震？', url: 'https://scweb.cwa.gov.tw/zh-TW/Guidance/FAQdetail/17' },
    ] },
    { group: '防災準備', items: [
      { text: '地震前之準備事項為何？', url: 'https://scweb.cwa.gov.tw/zh-TW/Guidance/FAQdetail/109' },
      { text: '大地震發生時應注意哪些事項？', url: 'https://scweb.cwa.gov.tw/zh-TW/Guidance/FAQdetail/110' },
    ] },
    { group: '地震資料', items: [
      { text: '中央氣象署 地震資料', url: 'https://scweb.cwa.gov.tw/zh-tw/earthquake/data/' },
      { text: '中央氣象署 地震測站', url: 'https://scweb.cwa.gov.tw/zh-tw/stationnew/' },
      { text: '中央氣象署 氣象資料開放平臺', url: 'https://opendata.cwa.gov.tw/' },
      { text: '內政部 直轄市、縣市界線（政府資料開放平臺）', url: 'https://data.gov.tw/dataset/7442' },
      { text: '內政部 鄉鎮市區界線（政府資料開放平臺）', url: 'https://data.gov.tw/dataset/7441' },
      { text: 'taiwan-atlas（縣市、鄉鎮界線的 TopoJSON）', url: 'https://github.com/dkaoster/taiwan-atlas' },
    ] },
    { group: '授權', items: [
      { text: '中央氣象署 政府網站資料開放宣告', url: 'https://www.cwa.gov.tw/V8/C/information.html' },
      { text: '政府資料開放授權條款－第 1 版', url: 'https://data.gov.tw/license' },
    ] },
  ],
} as const;

// ================================================================ 第一次使用：使用規範

export const TERMS = {
  title: '使用規範',
  intro: '開始之前，請花 30 秒看完這幾點。',
  items: [
    {
      title: '這不是地震預報',
      text: '本網站算的是「就算隨便亂猜，這種預言也會中」的歷史頻率，不是未來會不會發生地震的機率。中央氣象署指出，目前尚無法以科學方式準確預測地震發生的時間、位置及規模；地震資訊請以中央氣象署發布的為準。',
    },
    {
      title: '不要拿來製造恐慌，或攻擊特定的人',
      text: '結果只說明「這種說法本來就有多容易中」，不能證明任何人有或沒有預測能力，也不能當作防災決策的依據。分享時請不要斷章取義。',
    },
    {
      title: '資料與方法都有限制',
      text: '使用中央氣象署 1995–2025 年的地震目錄與有感地震報告，以及內政部的縣市、鄉鎮界線。解讀方式、假設與限制都寫在「方法說明」，數字可能和其他來源不同。',
    },
    {
      title: '隱私',
      text: '你輸入的文字只在你的瀏覽器裡計算，不會送出、也不會保存；分享連結只記錄我們的解讀，不含原文。',
    },
  ],
  sourceLink: '中央氣象署地震百問：政府是否能對地震做預報？',
  sourceUrl: 'https://scweb.cwa.gov.tw/zh-TW/Guidance/FAQdetail/96',
  methodsLink: '方法說明',
  checkbox: '我已閱讀並了解以上內容',
  accept: '同意並開始使用',
  close: '關閉',
  memoryNote: '「同意」只會記在這台裝置的瀏覽器裡；清除瀏覽資料後會再問一次。',
} as const;

// ================================================================ 顯示設定

export const PREFS = {
  label: '顯示設定',
  themeLabel: '主題',
  themes: { auto: '跟隨系統', light: '白天', dark: '黑夜', desert: '沙漠黃', jungle: '叢林綠', tech: '科技藍' },
  layoutLabel: '版面',
  layouts: { single: '單欄', wide: '雙欄（寬螢幕）' },
  layoutHelp: '雙欄：左邊輸入與確認、右邊看結果；螢幕太窄時自動改回單欄。',
} as const;

// ================================================================ 先確認再算

export const GATE = {
  foreignTitle: '這則預言說的不是台灣',
  foreignText: (places: string) =>
    `原文提到${places}，但本網站只有中央氣象署的台灣地震資料，算不出國外的命中率。`,
  foreignHint: '想知道「同樣的說法放在台灣」有多容易中，可以改用台灣及近海試算。',
  foreignContinue: '改用台灣及近海試算',
  notQuakeTitle: '這看起來不像一則地震預言',
  notQuakeText: '原文裡找不到和地震有關的字（例如地震、震度、規模、有感），可能是貼錯內容，或只是在測試。',
  notQuakeHint: '如果真的是一則地震預言，可以先在上面的確認卡選好時間、地點和大小，再按下面的按鈕。',
  notProphecyTitle: '這看起來不是一則預言',
  notProphecyText: '原文像是在講地震演練、保險或防災準備，沒有預言會發生多大的地震。',
  notProphecyHint: '如果真的是一則預言，可以先在上面的確認卡選好時間、地點和大小，再按下面的按鈕。',
  emptyTitle: '這句話沒有說什麼時候、在哪裡、多大',
  emptyText: '一則預言至少要說出時間、地點或大小其中一項，才能判斷「中」或「不中」。',
  emptyHint: '可以在上面的確認卡補上，或換一句完整的預言，例如「下週花蓮會有規模 6 以上的地震」。',
  pastTitle: '這句話說的好像是已經發生的地震',
  pastText: '原文提到過去的時間（例如去年、昨天、某個已經過去的年份），卻沒有說未來什麼時候。已經發生的地震不需要猜，所以沒有「猜中」的問題。',
  pastHint: '如果這是一則預言，請在上面的確認卡選好時間；或按下面的按鈕，照目前的設定（未來 30 天）計算。',
  conflictTitle: '這則預言的說法互相矛盾',
  conflictText: (list: string) =>
    `原文同時提到好幾種說法（${list}）。什麼都說的預言，等於什麼都沒說：不管發生什麼，都能找到一種說法算「中」。`,
  conflictHint: '請在上面的確認卡選定一種；或照確認卡上目前的解讀計算。',
  continue: '照目前的設定算算看',
  clear: '清空，重新輸入',
} as const;

// ================================================================ 為什麼預言常常看起來很準

export const WHY = {
  title: '為什麼預言常常看起來很準？',
  intro: '不需要任何超能力，只要做到下面幾點，「猜中」就會很常見。',
  quakesTitle: '地震本來就常發生',
  quakesText: (years: string, rate: string) =>
    `過去 ${years} 年，台灣及近海規模 5 以上的地震平均每年約 ${rate} 次；有感地震更多。`,
  quakesTextLoading: '台灣位在板塊交界，有感地震幾乎每週都有。',
  items: [
    { icon: '🌫️', title: '預言寫得很模糊', text: '不說多大、不說在哪、不說哪幾天，發生什麼都能算「中」。看「解讀光譜」。' },
    { icon: '🎯', title: '只記得猜中的', text: '猜中的會被截圖、轉傳；猜錯的沒有人記得，也沒有人追蹤。' },
    { icon: '🔁', title: '一直重複說', text: '同一句話每幾天發一次，總有一次會碰上。看「亂槍打鳥」。' },
    { icon: '🪄', title: '事後重新解讀', text: '「我說的大地震就是指這個」：判定標準可以在事後放寬。看「灌水成分」。' },
  ],
} as const;
