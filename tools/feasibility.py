"""可行性試算：地震預言的「瞎猜命中率」。

重現 docs/rumor-odds/DESIGN.md 第 3 節的所有數字。只用 Python 標準函式庫。

    # 台灣：CWA 地震目錄（E-A0073）＋ CWA 有感地震彙整 CSV；資料夾由 --data-dir 或環境變數 EQ_DATA_DIR 指定
    python tools/rumor-odds/feasibility.py taiwan

    # 每日報告追蹤的「30 天內、9 個國家／地區、M7.0」範本預言（USGS ComCat，需連網）
    python tools/rumor-odds/feasibility.py template

為什麼同時算兩種機率：
- Poisson：假設地震以固定速率、彼此獨立地發生，P = 1 - exp(-λT)。
- 歷史實際：把過去每一天都當成預言的起點，數「長度 T 的窗口裡至少有一次地震」的比例。
  地震會成群發生，所以短窗口的實際比例通常比 Poisson 低；這個差距是網頁要解釋的重點之一。
"""
from __future__ import annotations

import argparse
import bisect
import csv
import json
import math
import os
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

DAY_S = 86400.0


def to_days(dt: datetime) -> float:
    return dt.timestamp() / DAY_S


def poisson_p(rate_per_year: float, window_days: float) -> float:
    return 1.0 - math.exp(-rate_per_year * window_days / 365.25)


def sliding_hit_rate(times: list[float], t_start: float, t_end: float, window_days: float) -> float:
    """以每一天為起點、長度 window_days 的窗口中，至少含一個事件的比例。times 必須已排序（單位：天）。

    窗口彼此重疊，所以這個比例不能當成獨立樣本去算二項式信賴區間。
    """
    hits = n = 0
    d = t_start
    while d + window_days <= t_end:
        i = bisect.bisect_left(times, d)
        hits += i < len(times) and times[i] < d + window_days
        n += 1
        d += 1.0
    return hits / n


# ---------------------------------------------------------------- taiwan

CWA_NS = "{urn:cwa:gov:tw:cwacommon:0.1}"
TW_BOX = (21.0, 26.0, 119.0, 123.0)  # lat_min, lat_max, lon_min, lon_max（與 B3 基準模型的研究區相同）
# 2020 年起 CWA 震度 5、6 級拆成弱／強；這裡把「5 弱」視為 5、「6 弱」視為 6。
# 2014 年 7 月有幾筆小區域有感地震沒填最大震度，有感代表至少 1 級，記為 1（與 build_data.py 相同）。
INTENSITY = {"": 1, "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "5弱": 5, "5強": 5.5,
             "6": 6, "6弱": 6, "6強": 6.5, "7": 7}


def load_cwa_catalog(data_dir: Path, y0: int, y1: int) -> list[tuple[float, float]]:
    """讀取 E-A0073 年度 XML，回傳研究區內的 (時間[天], ML)，依時間排序。"""
    out = []
    for year in range(y0, y1 + 1):
        path = data_dir / "E-A0073-002" / f"CWA-EQ-Catalog-{year}.xml"
        for _, el in ET.iterparse(path):
            if el.tag != CWA_NS + "EarthquakeInfo":
                continue
            lat = float(el.findtext(CWA_NS + "EpicenterLatitude"))
            lon = float(el.findtext(CWA_NS + "EpicenterLongitude"))
            if TW_BOX[0] <= lat <= TW_BOX[1] and TW_BOX[2] <= lon <= TW_BOX[3]:
                t = datetime.fromisoformat(el.findtext(CWA_NS + "OriginTime").strip())  # 含 +08:00
                out.append((to_days(t), float(el.findtext(CWA_NS + "LocalMagnitude"))))
            el.clear()
    return sorted(out)


def load_felt(data_dir: Path, y0: int, y1: int) -> list[tuple[float, float]]:
    """讀取 CWA 有感地震彙整（Big5），回傳 (時間[天], 全台最大震度)。"""
    path = data_dir / "earthquake_data" / "processed" / "地震活動彙整_cwa_earthquake_1990_2026.csv"
    out = []
    with open(path, encoding="big5", errors="replace", newline="") as fh:
        rows = csv.reader(fh)
        next(rows)  # 編號,地震時間,經度,緯度,規模,深度,最大震度,位置
        for row in rows:
            try:
                t = datetime.fromisoformat(row[1].strip() + "+08:00")
            except (ValueError, IndexError):
                continue
            level = INTENSITY.get(row[6].strip())
            if y0 <= t.year <= y1 and level is not None:
                out.append((to_days(t), level))
    return sorted(out)


def run_taiwan(args: argparse.Namespace) -> None:
    data_dir = Path(args.data_dir or os.environ.get("EQ_DATA_DIR", ""))
    if not (data_dir / "E-A0073-002").is_dir():
        sys.exit("找不到 E-A0073-002/：請用 --data-dir 或環境變數 EQ_DATA_DIR 指向資料所在資料夾")
    y0, y1 = args.start_year, args.end_year
    t_start = to_days(datetime.fromisoformat(f"{y0}-01-01T00:00:00+08:00"))
    t_end = to_days(datetime.fromisoformat(f"{y1 + 1}-01-01T00:00:00+08:00"))
    years = (t_end - t_start) / 365.25

    events = load_cwa_catalog(data_dir, y0, y1)
    print(f"## CWA 地震目錄 {y0}–{y1}，研究區 {TW_BOX}，{len(events)} 筆，{years:.2f} 年\n")
    print("| 門檻 | 事件數 | 年發生率 | 7 天 Poisson | 7 天 歷史實際 | 30 天 Poisson | 30 天 歷史實際 |")
    print("|---|---|---|---|---|---|---|")
    for m in (4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0):
        times = [t for t, ml in events if ml >= m]
        lam = len(times) / years
        print(f"| ML ≥ {m:.1f} | {len(times)} | {lam:.2f} | {poisson_p(lam, 7):.1%} "
              f"| {sliding_hit_rate(times, t_start, t_end, 7):.1%} | {poisson_p(lam, 30):.1%} "
              f"| {sliding_hit_rate(times, t_start, t_end, 30):.1%} |")

    # 大地震隔天才預言「下週還會有」：窗口 (t0 + 1 天, t0 + 8 天)
    big = [t for t, ml in events if ml >= 6.0]
    print(f"\n## 剛發生 ML ≥ 6.0 之後（{len(big)} 次），隔天起 7 天\n")
    print("| 預言內容 | 條件機率 | 平時（歷史實際） | 倍數 |")
    print("|---|---|---|---|")
    for m in (5.0, 5.5, 6.0):
        times = [t for t, ml in events if ml >= m]
        hits = 0
        for t0 in big:
            i = bisect.bisect_left(times, t0 + 1)
            hits += i < len(times) and times[i] < t0 + 8
        base = sliding_hit_rate(times, t_start, t_end, 7)
        print(f"| ML ≥ {m:.1f} | {hits}/{len(big)} = {hits / len(big):.1%} | {base:.1%} | {hits / len(big) / base:.1f}× |")

    felt = load_felt(data_dir, y0, y1)
    print(f"\n## 有感地震彙整 {y0}–{y1}，{len(felt)} 筆（全台任一地點的最大震度）\n")
    print("| 全台最大震度 | 事件數 | 7 天 歷史實際 | 30 天 歷史實際 |")
    print("|---|---|---|---|")
    for level in (1, 3, 4, 5, 6):
        times = [t for t, v in felt if v >= level]
        print(f"| ≥ {level} | {len(times)} | {sliding_hit_rate(times, t_start, t_end, 7):.1%} "
              f"| {sliding_hit_rate(times, t_start, t_end, 30):.1%} |")


# ---------------------------------------------------------------- template

# 與 prompts/daily-earthquake-report.md 第 3.1(b) 節的地區代碼表相同
REGIONS = {
    "JP": ("Japan", 24, 46, 122, 154),
    "TW": ("Taiwan", 21, 26.5, 119, 123.5),
    "CN": ("China", 18, 54, 73, 135),
    "MM": ("Myanmar", 9.5, 28.5, 92, 101.5),
    "NP": ("Nepal", 26, 30.5, 80, 88.5),
    "PH": ("Philippines", 4, 21.5, 116, 127.5),
    "ID": ("Indonesia", -11.5, 6.5, 94.5, 141.5),
    "MY": ("Malaysia", 0.5, 7.5, 99.5, 119.5),
    "PG": ("Papua New Guinea", -12, 0, 140.5, 156),
}
USGS = "https://earthquake.usgs.gov/fdsnws/event/1/query?"


def place_rule(feature: dict, names: list[str]) -> bool:
    """每日報告的空間判定：place 含代碼表國名，或只寫海域名稱（沒有逗號）且已落在某個經緯度範圍內。"""
    place = feature["properties"].get("place") or ""
    return any(name in place for name in names) or "," not in place


def run_template(args: argparse.Namespace) -> None:
    codes = args.regions.split(",")
    unknown = [c for c in codes if c not in REGIONS]
    if unknown:
        sys.exit(f"代碼表沒有：{unknown}")
    selected = {c: REGIONS[c] for c in codes}
    names = [v[0] for v in selected.values()]
    events: dict[str, dict] = {}
    for name, la0, la1, lo0, lo1 in selected.values():
        query = urllib.parse.urlencode(dict(
            format="geojson", eventtype="earthquake", starttime=args.start, endtime=args.end,
            minmagnitude=6.5, minlatitude=la0, maxlatitude=la1, minlongitude=lo0, maxlongitude=lo1))
        with urllib.request.urlopen(USGS + query, timeout=60) as resp:
            for feature in json.load(resp)["features"]:
                events.setdefault(feature["id"], feature)  # 範圍彼此重疊，以 id 去重

    t_start = to_days(datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc))
    t_end = to_days(datetime.fromisoformat(args.end).replace(tzinfo=timezone.utc))
    years = (t_end - t_start) / 365.25
    print(f"## USGS {args.start} ~ {args.end}（{years:.2f} 年），{'+'.join(codes)} 的經緯度範圍聯集\n")
    print("| 規模門檻 | 空間判定 | 事件數 | 年發生率 | 30 天 Poisson | 30 天 歷史實際 | 35 天 Poisson | 35 天 歷史實際 |")
    print("|---|---|---|---|---|---|---|---|")
    for mmin, label in ((7.0, "M ≥ 7.0（嚴格）"), (6.5, "M ≥ 6.5（±0.5）")):
        for rule, keep in (("經緯度範圍", lambda f: True), ("place 字串", lambda f: place_rule(f, names))):
            sel = [f for f in events.values() if f["properties"]["mag"] >= mmin and keep(f)]
            lam = len(sel) / years
            times = sorted(f["properties"]["time"] / 1000.0 / DAY_S for f in sel)
            cells = []
            for window in (30, 35):
                cells += [f"{poisson_p(lam, window):.1%}", f"{sliding_hit_rate(times, t_start, t_end, window):.1%}"]
            print(f"| {label} | {rule} | {len(sel)} | {lam:.1f} | " + " | ".join(cells) + " |")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows 預設 cp950
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    tw = sub.add_parser("taiwan", help="台灣：CWA 目錄與有感地震彙整")
    tw.add_argument("--data-dir", help="含 E-A0073-002/ 與 earthquake_data/ 的資料夾（預設讀 EQ_DATA_DIR）")
    tw.add_argument("--start-year", type=int, default=1995)
    tw.add_argument("--end-year", type=int, default=2025)
    tp = sub.add_parser("template", help="「30 天、9 國、M7.0」範本預言（USGS）")
    tp.add_argument("--start", default="2016-11-04")
    tp.add_argument("--end", default="2026-11-04")
    tp.add_argument("--regions", default=",".join(REGIONS), help="逗號分隔的地區代碼（預設全部 9 個）")
    args = parser.parse_args()
    {"taiwan": run_taiwan, "template": run_template}[args.cmd](args)


if __name__ == "__main__":
    main()
