"""產生鄉鎮市區對照表 src/core/towns.ts（鄉鎮 → 所屬縣市）。只用 Python 標準函式庫。

來源：node_modules/taiwan-atlas/towns-10t.json（內政部 鄉鎮市區界線，經 taiwan-atlas 轉換）。

為什麼要排除一些名稱：
- 全名重複（例如好幾個市都有「東區」「中正區」）：分不出是哪個縣市，不收。
- 簡稱（去掉鄉、鎮、市、區）只在「全台唯一」而且「不是常用詞」時才收：
  「成功」「和平」「清水」「三星」都是日常用語，「關西」「松山」「三峽」也是國外地名，
  收進來會把「世界和平」讀成臺中市和平區。寧可漏掉，也不要誤判（使用者可以在確認卡上自己選縣市）。

用法：
  python tools/build_towns.py
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ATLAS = ROOT / "node_modules" / "taiwan-atlas" / "towns-10t.json"
OUT = ROOT / "src" / "core" / "towns.ts"

SUFFIXES = "鄉鎮市區"

# 簡稱和日常用語、人名、國外或中國大陸地名撞名：不收簡稱（全名仍然收）
STOP_SHORT = set(
    """
    成功 和平 光復 仁愛 復興 太平 信義 中正 中山 大安 大同 新興 永和 中和 安樂 暖暖 永安
    大城 田中 清水 龍井 布袋 水上 六甲 大內 將軍 北門 安定 山上 三民 大樹 橋頭 桃源 琉球
    春日 獅子 牡丹 滿州 三星 大湖 關西 新城 和美 新市 東山 萬里 松山 樹林 三峽 泰山 石門
    觀音 龜山 峨眉 公館 泰安 銅鑼 西湖 花壇 北斗 潮州 白沙 金城 香山 彌陀 福興 竹田 大村
    橫山 長治 大社 內湖 南港 新豐 新港 八德 大園 新屋 楊梅 龍潭 大溪 湖口 寶山 造橋 神岡
    大雅 新社 大肚 秀水 田尾 溪口 大林 太保 新化 仁德 永康 安南 安平 鼓山 小港 岡山 燕巢
    杉林 內門 茂林 高樹 金沙 金湖 金山 新店 五股 深坑 三重 虎尾 鹽水 文山 中埔 大埔 西港
    """.split()
)

# 地震新聞常出現、而且不會和常用詞撞名的簡稱：即使在上面的清單裡也要收
KEEP_SHORT = set(
    """
    秀林 吉安 壽豐 鳳林 豐濱 瑞穗 萬榮 玉里 卓溪 富里 池上 關山 卑南 鹿野 東河 長濱 太麻里
    大武 綠島 蘭嶼 海端 延平 金峰 達仁 南澳 蘇澳 羅東 冬山 礁溪 頭城 埔里 集集 魚池 水里
    竹山 鹿谷 名間 美濃 甲仙 六龜 恆春 霧峰 梅山 阿里山 斗六 北港 淡水 北投 士林 汐止 瑞芳
    """.split()
)


def main() -> None:
    topo = json.loads(ATLAS.read_text(encoding="utf-8"))
    towns = [g["properties"] for g in topo["objects"]["towns"]["geometries"]]

    full_count: dict[str, int] = defaultdict(int)
    short_counties: dict[str, set[str]] = defaultdict(set)
    for p in towns:
        name = p["TOWNNAME"].replace("台", "臺")
        full_count[name] += 1
        if name[-1] in SUFFIXES and len(name) >= 3:
            short_counties[name[:-1]].add(p["COUNTYID"])

    rows = []
    for p in sorted(towns, key=lambda p: p["TOWNCODE"]):
        name = p["TOWNNAME"].replace("台", "臺")
        if full_count[name] > 1:
            continue  # 全名重複，分不出縣市
        short = None
        if name[-1] in SUFFIXES and len(name) >= 3:
            s = name[:-1]
            unique = len(short_counties[s]) == 1
            if unique and (s in KEEP_SHORT or s not in STOP_SHORT):
                short = s
        rows.append((name, short, p["COUNTYID"]))

    lines = [
        "/**",
        " * 鄉鎮市區 → 所屬縣市（內政部鄉鎮市區界線，經 taiwan-atlas）。",
        " * 由 tools/build_towns.py 產生，請勿手動修改；排除規則寫在那支程式裡。",
        " * short：去掉鄉、鎮、市、區的簡稱，只有全台唯一、而且不是常用詞時才有值。",
        " */",
        "export interface TownDef {",
        "  name: string;",
        "  short: string | null;",
        "  county: string;",
        "}",
        "",
        "export const TOWNS: readonly TownDef[] = [",
    ]
    for name, short, county in rows:
        short_text = "null" if short is None else f"'{short}'"
        lines.append(f"  {{ name: '{name}', short: {short_text}, county: '{county}' }},")
    lines.append("];")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    with_short = sum(1 for _, s, _ in rows if s)
    print(f"towns: {len(rows)} (dropped {len(towns) - len(rows)} duplicate full names), with short name: {with_short}")


if __name__ == "__main__":
    main()
