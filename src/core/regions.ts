/**
 * 縣市與分區。id 是內政部縣市代碼（COUNTYID），和 public/data/meta.json 的 counties.items 一致。
 * 名稱統一用「臺」；別名表給解析器用（解析時要先比對較長的別名）。
 */
import type { GroupId } from './types';

export interface CountyDef {
  id: string;
  name: string;
  aliases: readonly string[];
}

export const COUNTIES: readonly CountyDef[] = [
  { id: 'A', name: '臺北市', aliases: ['臺北市', '台北市', '臺北', '台北', '北市'] },
  { id: 'B', name: '臺中市', aliases: ['臺中市', '台中市', '臺中', '台中'] },
  { id: 'C', name: '基隆市', aliases: ['基隆市', '基隆'] },
  { id: 'D', name: '臺南市', aliases: ['臺南市', '台南市', '臺南', '台南'] },
  { id: 'E', name: '高雄市', aliases: ['高雄市', '高雄'] },
  { id: 'F', name: '新北市', aliases: ['新北市', '新北'] },
  { id: 'G', name: '宜蘭縣', aliases: ['宜蘭縣', '宜蘭'] },
  { id: 'H', name: '桃園市', aliases: ['桃園市', '桃園'] },
  { id: 'I', name: '嘉義市', aliases: ['嘉義市'] },
  { id: 'J', name: '新竹縣', aliases: ['新竹縣', '竹北'] },
  { id: 'K', name: '苗栗縣', aliases: ['苗栗縣', '苗栗'] },
  { id: 'M', name: '南投縣', aliases: ['南投縣', '南投'] },
  { id: 'N', name: '彰化縣', aliases: ['彰化縣', '彰化'] },
  { id: 'O', name: '新竹市', aliases: ['新竹市'] },
  { id: 'P', name: '雲林縣', aliases: ['雲林縣', '雲林'] },
  { id: 'Q', name: '嘉義縣', aliases: ['嘉義縣'] },
  { id: 'T', name: '屏東縣', aliases: ['屏東縣', '屏東'] },
  { id: 'U', name: '花蓮縣', aliases: ['花蓮縣', '花蓮'] },
  { id: 'V', name: '臺東縣', aliases: ['臺東縣', '台東縣', '臺東', '台東'] },
  { id: 'W', name: '金門縣', aliases: ['金門縣', '金門'] },
  { id: 'X', name: '澎湖縣', aliases: ['澎湖縣', '澎湖'] },
  { id: 'Z', name: '連江縣', aliases: ['連江縣', '連江', '馬祖'] },
];

/** 同名的縣與市：只寫「新竹」「嘉義」時兩者都算（旗標 region-ambiguous） */
export const AMBIGUOUS_PLACES: Readonly<Record<string, readonly string[]>> = {
  新竹: ['O', 'J'],
  嘉義: ['I', 'Q'],
};

export interface GroupDef {
  id: GroupId;
  name: string;
  ids: readonly string[];
  aliases: readonly string[];
}

/** 常見分區（約略；依中央氣象署天氣分區的習慣用法） */
export const GROUPS: readonly GroupDef[] = [
  { id: 'north', name: '北部', ids: ['C', 'A', 'F', 'H', 'O', 'J'],
    aliases: ['北部', '北台灣', '北臺灣', '台灣北部', '臺灣北部'] },
  { id: 'central', name: '中部', ids: ['K', 'B', 'N', 'M', 'P'],
    aliases: ['中部', '中台灣', '中臺灣', '台灣中部', '臺灣中部'] },
  { id: 'south', name: '南部', ids: ['I', 'Q', 'D', 'E', 'T'],
    aliases: ['南部', '南台灣', '南臺灣', '台灣南部', '臺灣南部'] },
  { id: 'east', name: '東部', ids: ['G', 'U', 'V'],
    aliases: ['東部', '東台灣', '東臺灣', '台灣東部', '臺灣東部', '東半部', '後山'] },
  { id: 'huadong', name: '花東', ids: ['U', 'V'], aliases: ['花東'] },
];

/** 台灣常見的縣市合稱（沒有對應的分區 id） */
export const COUNTY_COMBOS: Readonly<Record<string, readonly string[]>> = {
  宜花東: ['G', 'U', 'V'],
  北北基桃: ['A', 'F', 'C', 'H'],
  北北基: ['A', 'F', 'C'],
  桃竹苗: ['H', 'O', 'J', 'K'],
  中彰投: ['B', 'N', 'M'],
  雲嘉南: ['P', 'I', 'Q', 'D'],
  高屏: ['E', 'T'],
};

/** 代表「整個台灣」的說法 */
export const TAIWAN_ALIASES: readonly string[] = [
  '全台灣', '全臺灣', '台灣', '臺灣', '全台', '全臺', '寶島',
];

/** 代表「外海、海域」的修飾語：外推距離改用 60 公里 */
export const OFFSHORE_WORDS: readonly string[] = ['外海', '海域', '近海', '海上', '外洋'];

/** 國外或範圍大於台灣的地名：v1 只算台灣，遇到時加上 region-out-of-scope 旗標 */
export const OUT_OF_SCOPE_PLACES: readonly string[] = [
  '日本', '琉球', '沖繩', '與那國', '菲律賓', '中國', '大陸', '印尼', '韓國', '美國',
  '緬甸', '尼泊爾', '馬來西亞', '巴布亞紐幾內亞', '越南', '土耳其', '智利', '紐西蘭',
  '東南亞', '亞洲', '環太平洋', '全世界', '全球', '世界',
];

export function countyById(id: string): CountyDef | undefined {
  return COUNTIES.find((c) => c.id === id);
}

export function groupById(id: GroupId): GroupDef | undefined {
  return GROUPS.find((g) => g.id === id);
}
