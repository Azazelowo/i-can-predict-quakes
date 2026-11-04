"""產生網頁要載入的靜態資料：public/data/*.json。只用 Python 標準函式庫。

輸入（原始資料不放進這個 repo，見 README「重建資料」）：
  $EQ_DATA_DIR/E-A0073-002/CWA-EQ-Catalog-YYYY.xml
      中央氣象署 地震目錄（開放資料，ML ≥ 3.0，東經 118–124 度、北緯 20–27 度）
  $EQ_DATA_DIR/earthquake_data/processed/地震活動彙整_cwa_earthquake_1990_2026.csv
      中央氣象署 有感地震彙整（Big5，含全台最大震度）
  node_modules/taiwan-atlas/counties-10t.json
      內政部 直轄市、縣市界線（經 taiwan-atlas 轉成 TopoJSON）

輸出：
  public/data/catalog.json  ML ≥ 4.0 的地震，以及每個地震到附近縣市的距離（near 索引）
  public/data/felt.json     有感地震與全台最大震度
  public/data/map.json      簡化過的縣市界，只用來畫圖
  public/data/meta.json     期間、筆數、來源、授權、輸入檔的 SHA-256

為什麼預先算好「地震到各縣市的距離」：
  判斷「震央在花蓮縣內，或在縣界外 30 公里內」需要多邊形運算。在這裡算一次，
  網頁和驗證程式（tools/golden.py）就都只要查表，兩邊的結果不會因為幾何實作不同而有出入。

用法：
  EQ_DATA_DIR=<資料夾> python tools/build_data.py
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
ATLAS = ROOT / "node_modules" / "taiwan-atlas" / "counties-10t.json"

TZ = timezone(timedelta(hours=8))  # Asia/Taipei，沒有日光節約時間
CWA_NS = "{urn:cwa:gov:tw:cwacommon:0.1}"
FELT_CSV = Path("earthquake_data") / "processed" / "地震活動彙整_cwa_earthquake_1990_2026.csv"

MIN_ML = 4.0            # 低於 4.0 的早期紀錄不完整，網頁最低只算到 4.0
MAX_BUFFER_KM = 60.0    # near 索引只記錄 60 公里內的縣市，也是網頁「縣界外推距離」的上限
KM_PER_DEG = math.pi / 180.0 * 6371.0
SIMPLIFY_NEAR_KM = 0.2  # 算距離用的縣市界簡化容許誤差
SIMPLIFY_MAP_KM = 1.0   # 畫圖用的縣市界簡化容許誤差

# 2020 年起震度 5、6 級拆成弱／強。弱視為整數級，強記為 +0.5，讓「≥ 5」同時涵蓋 5 弱與 5 強。
INTENSITY = {"0": 0.0, "1": 1.0, "2": 2.0, "3": 3.0, "4": 4.0, "5": 5.0, "5弱": 5.0, "5強": 5.5,
             "6": 6.0, "6弱": 6.0, "6強": 6.5, "7": 7.0}

SCRIPT_VERSION = 1


def unix_local_midnight(year: int, month: int = 1, day: int = 1) -> int:
    return int(datetime(year, month, day, tzinfo=TZ).timestamp())


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ------------------------------------------------------------------ catalog

def load_catalog(data_dir: Path, y0: int, y1: int, inputs: list) -> list[dict]:
    events = []
    for year in range(y0, y1 + 1):
        path = data_dir / "E-A0073-002" / f"CWA-EQ-Catalog-{year}.xml"
        inputs.append({"file": f"E-A0073-002/{path.name}", "sha256": sha256(path)})
        for _, el in ET.iterparse(path):
            if el.tag != CWA_NS + "EarthquakeInfo":
                continue
            ml = float(el.findtext(CWA_NS + "LocalMagnitude"))
            if ml >= MIN_ML:
                t = datetime.fromisoformat(el.findtext(CWA_NS + "OriginTime").strip())
                events.append({
                    "t": int(t.timestamp()),
                    "lat": round(float(el.findtext(CWA_NS + "EpicenterLatitude")), 3),
                    "lon": round(float(el.findtext(CWA_NS + "EpicenterLongitude")), 3),
                    "depth": round(float(el.findtext(CWA_NS + "FocalDepth")), 1),
                    "ml": round(ml, 1),
                })
            el.clear()
    events.sort(key=lambda e: (e["t"], e["lat"], e["lon"]))
    return events


def load_felt(data_dir: Path, t0: int, t1: int, inputs: list) -> tuple[list[dict], int, int, int]:
    """回傳 (紀錄, 無法解析而略過的筆數, 缺最大震度而記為 1 級的筆數, 最大震度 0 級而排除的筆數)。

    2014 年 7 月有幾筆「小區域有感地震」沒有填最大震度。它們既然是有感地震，震度至少 1 級，
    所以記為 1（最保守）：只影響「有感」這個解讀，不會灌高「震度 3 級以上」等較高門檻。
    最大震度 0 級代表沒有任何測站有感，不是有感地震，所以排除（所有門檻都 ≥ 1，排除與否不影響計算）。
    """
    path = data_dir / FELT_CSV
    inputs.append({"file": FELT_CSV.as_posix(), "sha256": sha256(path)})
    rows, skipped, blank, zero = [], 0, 0, 0
    with open(path, encoding="big5", errors="replace", newline="") as fh:
        reader = csv.reader(fh)
        next(reader)  # 編號,地震時間,經度,緯度,規模,深度,最大震度,位置
        for row in reader:
            try:
                t = int(datetime.fromisoformat(row[1].strip() + "+08:00").timestamp())
                raw = row[6].strip()
                level = 1.0 if raw == "" else INTENSITY[raw]
                ml = round(float(row[4]), 1)
            except (ValueError, KeyError, IndexError):
                skipped += 1
                continue
            if t0 <= t < t1:
                if level == 0:
                    zero += 1
                    continue
                rows.append({"t": t, "intensity": level, "ml": ml})
                blank += raw == ""
    rows.sort(key=lambda r: (r["t"], -r["intensity"]))
    return rows, skipped, blank, zero


# ------------------------------------------------------------------ counties

def decode_topology(topo: dict) -> list[list[tuple[float, float]]]:
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    return arcs


def simplify(points: list[tuple[float, float]], tol_km: float) -> list[tuple[float, float]]:
    """Douglas–Peucker（經度乘上 cos 緯度後以公里計）。逐條 arc 簡化，所以相鄰縣市的共用邊界仍然一致。"""
    if len(points) < 3:
        return points[:]
    cos = math.cos(math.radians(23.5))
    xy = [(lon * cos * KM_PER_DEG, lat * KM_PER_DEG) for lon, lat in points]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = xy[a], xy[b]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = xy[i]
            if seg2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                u = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
                d = math.hypot(px - (ax + u * dx), py - (ay + u * dy))
            if d > best:
                best, idx = d, i
        if best > tol_km:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def build_rings(geometry: dict, arcs: list) -> list[list[tuple[float, float]]]:
    def ring(arc_ids):
        out = []
        for i, a in enumerate(arc_ids):
            pts = arcs[a] if a >= 0 else arcs[~a][::-1]
            out.extend(pts if i == 0 else pts[1:])
        return out

    if geometry["type"] == "Polygon":
        polys = [geometry["arcs"]]
    elif geometry["type"] == "MultiPolygon":
        polys = geometry["arcs"]
    else:
        raise ValueError(f"unexpected geometry {geometry['type']}")
    return [ring(r) for poly in polys for r in poly]


def load_counties(inputs: list) -> tuple[list[dict], list[dict]]:
    """回傳 (算距離用的縣市, 畫圖用的縣市)。縣市順序依 COUNTYCODE 排序，固定不變。"""
    inputs.append({"file": "node_modules/taiwan-atlas/counties-10t.json", "sha256": sha256(ATLAS)})
    topo = json.loads(ATLAS.read_text(encoding="utf-8"))
    raw_arcs = decode_topology(topo)
    near_arcs = [simplify(a, SIMPLIFY_NEAR_KM) for a in raw_arcs]
    map_arcs = [simplify(a, SIMPLIFY_MAP_KM) for a in raw_arcs]
    geoms = sorted(topo["objects"]["counties"]["geometries"], key=lambda g: g["properties"]["COUNTYCODE"])
    near, draw = [], []
    for g in geoms:
        p = g["properties"]
        name = p["COUNTYNAME"].replace("台", "臺")  # 統一用「臺」
        rings = build_rings(g, near_arcs)
        lats = [lat for r in rings for _, lat in r]
        lons = [lon for r in rings for lon, _ in r]
        near.append({"id": p["COUNTYID"], "name": name, "rings": rings,
                     "bbox": (min(lats), max(lats), min(lons), max(lons))})
        draw_rings = [r for r in build_rings(g, map_arcs) if len(r) >= 4]
        draw.append({"id": p["COUNTYID"], "name": name, "nameEn": p["COUNTYENG"],
                     "rings": [[v for lon, lat in r for v in (round(lon, 3), round(lat, 3))] for r in draw_rings]})
    return near, draw


def inside(lon: float, lat: float, rings: list) -> bool:
    """偶奇規則：同時處理多個島嶼與內洞。"""
    hit = False
    for r in rings:
        n = len(r)
        j = n - 1
        for i in range(n):
            xi, yi = r[i]
            xj, yj = r[j]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                hit = not hit
            j = i
    return hit


def distance_km(lon: float, lat: float, rings: list) -> float:
    """點到多邊形邊界的最短距離（以點為中心的等距圓柱投影；100 公里內誤差遠小於 1%）。"""
    cos = math.cos(math.radians(lat))
    best = float("inf")
    for r in rings:
        px, py = (r[0][0] - lon) * cos * KM_PER_DEG, (r[0][1] - lat) * KM_PER_DEG
        for qlon, qlat in r[1:]:
            qx, qy = (qlon - lon) * cos * KM_PER_DEG, (qlat - lat) * KM_PER_DEG
            dx, dy = qx - px, qy - py
            seg2 = dx * dx + dy * dy
            u = 0.0 if seg2 == 0 else max(0.0, min(1.0, -(px * dx + py * dy) / seg2))
            d = math.hypot(px + u * dx, py + u * dy)
            if d < best:
                best = d
            px, py = qx, qy
    return best


def near_index(events: list[dict], counties: list[dict]) -> dict:
    ev, co, km = [], [], []
    for ei, e in enumerate(events):
        lat, lon = e["lat"], e["lon"]
        dlat = MAX_BUFFER_KM / KM_PER_DEG
        for ci, c in enumerate(counties):
            la0, la1, lo0, lo1 = c["bbox"]
            dlon = MAX_BUFFER_KM / (KM_PER_DEG * math.cos(math.radians(max(abs(la0), abs(la1)) + dlat)))
            if not (la0 - dlat <= lat <= la1 + dlat and lo0 - dlon <= lon <= lo1 + dlon):
                continue
            d = 0.0 if inside(lon, lat, c["rings"]) else distance_km(lon, lat, c["rings"])
            if d <= MAX_BUFFER_KM:
                ev.append(ei)
                co.append(ci)
                km.append(round(d, 1))
    return {"maxKm": MAX_BUFFER_KM, "event": ev, "county": co, "km": km}


# ------------------------------------------------------------------ main

def write_json(name: str, obj) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    (OUT / name).write_text(text + "\n", encoding="utf-8")
    return len(text.encode("utf-8"))


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", help="原始資料所在資料夾（預設讀環境變數 EQ_DATA_DIR）")
    ap.add_argument("--start-year", type=int, default=1995)
    ap.add_argument("--end-year", type=int, default=2025)
    args = ap.parse_args()
    data_dir = Path(args.data_dir or os.environ.get("EQ_DATA_DIR", ""))
    if not (data_dir / "E-A0073-002").is_dir():
        sys.exit("找不到 E-A0073-002/：請用 --data-dir 或環境變數 EQ_DATA_DIR 指向原始資料所在資料夾")
    if not ATLAS.exists():
        sys.exit("找不到 taiwan-atlas：請先執行 npm install")

    y0, y1 = args.start_year, args.end_year
    t0, t1 = unix_local_midnight(y0), unix_local_midnight(y1 + 1)
    inputs: list = []

    events = load_catalog(data_dir, y0, y1, inputs)
    dup = len(events) - len({(e["t"], e["lat"], e["lon"]) for e in events})
    felt, felt_skipped, felt_blank, felt_zero = load_felt(data_dir, t0, t1, inputs)
    counties, draw = load_counties(inputs)
    near = near_index(events, counties)

    sizes = {
        "catalog.json": write_json("catalog.json", {
            "version": SCRIPT_VERSION,
            "t": [e["t"] for e in events],
            "lat": [e["lat"] for e in events],
            "lon": [e["lon"] for e in events],
            "depth": [e["depth"] for e in events],
            "ml": [e["ml"] for e in events],
            "near": near,
        }),
        "felt.json": write_json("felt.json", {
            "version": SCRIPT_VERSION,
            "t": [r["t"] for r in felt],
            "intensity": [r["intensity"] for r in felt],
            "ml": [r["ml"] for r in felt],
        }),
        "map.json": write_json("map.json", {
            "version": SCRIPT_VERSION,
            "counties": draw,
        }),
    }
    meta = {
        "version": SCRIPT_VERSION,
        "period": {"start": f"{y0}-01-01", "end": f"{y1}-12-31", "timezone": "Asia/Taipei",
                   "startUnix": t0, "endUnix": t1},
        "catalog": {"count": len(events), "minML": MIN_ML, "duplicates": dup,
                    "magnitudeType": "ML（中央氣象署近震規模）",
                    "source": "交通部中央氣象署 地震目錄（開放資料 E-A0073）",
                    "url": "https://opendata.cwa.gov.tw/"},
        "felt": {"count": len(felt), "skipped": felt_skipped, "missingIntensityAsOne": felt_blank,
                 "droppedZeroIntensity": felt_zero,
                 "note": "全台任一地點的最大震度；2020 年起 5、6 級分弱／強，5 弱記為 5、5 強記為 5.5；"
                         "缺最大震度的小區域有感地震記為 1",
                 "source": "交通部中央氣象署 有感地震報告彙整",
                 "url": "https://scweb.cwa.gov.tw/"},
        "counties": {"items": [{"id": c["id"], "name": c["name"]} for c in counties],
                     "source": "內政部 直轄市、縣市界線（TWD97 經緯度），經 taiwan-atlas 套件轉換",
                     "url": "https://data.gov.tw/dataset/7442",
                     "nearSimplifyKm": SIMPLIFY_NEAR_KM, "mapSimplifyKm": SIMPLIFY_MAP_KM},
        "licenses": [
            "中央氣象署資料依其「政府網站資料開放宣告」及政府資料開放授權條款提供，使用時須註明出處：https://www.cwa.gov.tw/V8/C/information.html",
            "內政部縣市界線依政府資料開放授權條款－第 1 版提供：https://data.gov.tw/dataset/7442",
        ],
        "inputs": inputs,
        "files": sizes,
        "builder": {"script": "tools/build_data.py", "version": SCRIPT_VERSION},
    }
    write_json("meta.json", meta)

    print(f"catalog: {len(events)} events (ML ≥ {MIN_ML}), duplicates={dup}, near pairs={len(near['event'])}")
    print(f"felt: {len(felt)} records, skipped={felt_skipped}, missing intensity counted as 1: {felt_blank}, "
          f"dropped intensity 0: {felt_zero}")
    print(f"counties: {len(counties)}, map points={sum(len(r) // 2 for c in draw for r in c['rings'])}")
    print("sizes (bytes):", sizes)


if __name__ == "__main__":
    main()
