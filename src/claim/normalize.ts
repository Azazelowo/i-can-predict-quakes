/**
 * 前處理（docs/MODELS.md 2.1）：逐字轉換、長度不變。
 *
 * 輸出的第 i 個 UTF-16 code unit 一定來自原文的第 i 個 code unit，所以在正規化字串上找到的
 * [start, end) 可以直接拿來切原文（span 對回原文、旗標 detail 取原文用詞）。
 *
 * - 全形 ASCII（U+FF01–U+FF5E）→ 半形（例如「１１／１５」→「11/15」、「～」→「~」、「＋」→「+」）
 * - 全形空白 U+3000 → 半形空白
 * - 「台」→「臺」：比對時視為同一字（詞表也用同一個函式正規化）
 * - 「周」→「週」：MODELS 2.2 註明「周＝週」；只在比對時使用（規格未列在 2.1，於此一併處理，見 notes）
 * - 「恒」→「恆」、「峯」→「峰」：地名常見的異體字（「恒春」「霧峯」），鄉鎮表用的是後者
 *
 * 不做大小寫轉換：規模的「M／ML／Mw」在 size.ts 以不分大小寫比對。
 */
export function normalize(text: string): string {
  const out: string[] = new Array<string>(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xff01 && code <= 0xff5e) out[i] = String.fromCharCode(code - 0xfee0);
    else if (code === 0x3000) out[i] = ' ';
    else if (code === 0x53f0) out[i] = '臺'; // 台
    else if (code === 0x5468) out[i] = '週'; // 周
    else if (code === 0x6052) out[i] = '恆'; // 恒
    else if (code === 0x5cef) out[i] = '峰'; // 峯
    else out[i] = String.fromCharCode(code); // lone surrogates stay one code unit
  }
  return out.join('');
}
