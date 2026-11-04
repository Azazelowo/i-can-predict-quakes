#!/usr/bin/env python3
"""獨立驗證：只依 docs/MODELS.md，用 Python（只用標準函式庫）把 v1 的計算重新實作一次。

為什麼要有這支程式
------------------
網頁程式（src/modes/）和這支程式各自依 docs/MODELS.md 實作。tests/golden.test.ts 用網頁程式計算
tests/golden/claims.json 的同一批預言，再和這裡產生的 tests/golden/expected.json 逐欄比對。
兩邊不一致，代表其中一邊讀錯了規格，或是規格本身沒寫清楚（那就要回頭補 MODELS.md）。

所以這支程式刻意「不看」src/modes/、src/stats/、src/claim/：只用 MODELS.md、
src/core/ 的型別與常數（值抄在下面），以及 public/data/*.json。
規格沒寫清楚的地方選最簡單的解讀，列在 INTERPRETATIONS，也會寫進 expected.json，
方便和網頁程式的選擇逐條對照。

用法
----
    python tools/golden.py           # 重新產生 tests/golden/expected.json，並印出與試算的對照
    python tools/golden.py --check   # 只重新計算並和現有的 expected.json 比對，不寫檔

輸出的浮點數用 Python 的 repr（最短且可完整還原的十進位表示），JavaScript 的 JSON.parse
會讀回同一個 double。Infinity 寫成字串 "Infinity"（JSON 沒有 Infinity）。
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "public" / "data"
CLAIMS_PATH = ROOT / "tests" / "golden" / "claims.json"
EXPECTED_PATH = ROOT / "tests" / "golden" / "expected.json"

# ================================================================== 常數
# 值與 src/core/constants.ts 相同（MODELS.md：兩邊用相同的值）。改那邊就要改這裡。

TAIWAN_BOX = {"latMin": 21.0, "latMax": 26.0, "lonMin": 119.0, "lonMax": 123.0}
MIN_ML = 4.0
DEFAULT_BUFFER_KM = 30
BOOTSTRAP_REPLICATES = 1000
BOOTSTRAP_SEED = 20261104

SPECTRUM: list[tuple[str, dict[str, Any]]] = [
    ("felt", {"kind": "intensity", "value": 1}),
    ("i3", {"kind": "intensity", "value": 3}),
    ("i4", {"kind": "intensity", "value": 4}),
    ("i5", {"kind": "intensity", "value": 5}),
    ("i6", {"kind": "intensity", "value": 6}),
    ("m4.5", {"kind": "magnitude", "value": 4.5, "tolerance": "strict"}),
    ("m5", {"kind": "magnitude", "value": 5.0, "tolerance": "strict"}),
    ("m5.5", {"kind": "magnitude", "value": 5.5, "tolerance": "strict"}),
    ("m6", {"kind": "magnitude", "value": 6.0, "tolerance": "strict"}),
    ("m6.5", {"kind": "magnitude", "value": 6.5, "tolerance": "strict"}),
    ("m7", {"kind": "magnitude", "value": 7.0, "tolerance": "strict"}),
]

MATRIX_MAGNITUDES = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0]
MATRIX_WINDOWS = [1, 3, 7, 14, 30, 90, 365]
SHOTGUN_NS = [1, 4, 12, 52]
BAYES_DEFAULTS = {"prior": 0.01, "target": 0.95, "skill": 1.0}

LEVELS: list[tuple[str, float]] = [
    ("benefactor", 0.9),
    ("worry", 0.5),
    ("coin", 0.2),
    ("something", 0.05),
    ("rare", 0.01),
    ("oracle", 0.0),
]

# (id, num, den)；p = num / den（與 constants.ts 一樣用浮點除法）
ANALOGIES: list[tuple[str, int, int]] = [
    ("not-ten-heads", 1023, 1024),
    ("not-spade-ace", 51, 52),
    ("not-double-six", 35, 36),
    ("not-six", 5, 6),
    ("one-head-in-two", 3, 4),
    ("one-to-four", 2, 3),
    ("coin", 1, 2),
    ("one-or-two", 1, 3),
    ("heart", 1, 4),
    ("six", 1, 6),
    ("birth-month", 1, 12),
    ("double-six", 1, 36),
    ("card", 1, 52),
    ("birthday", 1, 365),
    ("ten-heads", 1, 1024),
    ("twenty-heads", 1, 1048576),
]

# MODELS.md 附錄 A、B 與第 4 節的已知值（自我檢查用）
MULBERRY32_VECTOR = [0.686575185275, 0.025461189216, 0.660663346294, 0.854467261815, 0.441696755122]
GARWOOD_TABLE = {0: (0.0, 3.688879), 1: (0.025318, 5.571643), 5: (1.623486, 11.668332), 10: (4.795389, 18.390356)}
BAYES_TABLE = [(0.946, 136), (0.754, 27), (0.412, 9), (0.059, 3), (0.004, 2)]

# 單元測試的輸入（tests/golden.test.ts 逐項比對）
UNIT_GARWOOD_NS = [0, 1, 5, 10, 100, 1223]
UNIT_LEVEL_PS = [0.95, 0.9, 0.8999, 0.5, 0.2, 0.05, 0.01, 0.0099, 0.5000001, 0.0, 1.0]

# 規格沒寫清楚、這裡選定的解讀（寫進 expected.json，給整合時和網頁程式的選擇對照）
INTERPRETATIONS: list[str] = [
    "期間：startDay = localDay(meta.period.startUnix)、endDay = localDay(meta.period.endUnix)；"
    "L = endDay − startDay、Y = L / 365.25。期間外的地震不影響 h(d)，nEvents 也只數資料裡的筆數（目前資料沒有期間外的紀錄）。",
    "Results.flags：size-below-min 的條件是「門檻（strict = 值，lenient = 值 − 0.5）< 4.0」；門檻剛好 4.0（例如 M4.5 寬鬆）不加。",
    "regionApplied：規模型一律為 true（地區是 taiwan 也算有套用矩形範圍），震度型為 false。",
    "headline.range：只有 source = 'spectrum' 時有值；'empirical' 與 'poisson-upper' 時為 null。",
    "M1 拔靴法：同一條 mulberry32 序列依序使用，第 1 個複本先抽完 K 個年份，再換第 2 個複本，依此類推。",
    "M1 slots：共 floor(L / T) 格，第 s 格 = h(startDay + s·T)。",
    "M2 Garwood 二分法：每次迭代前先檢查「hi − lo < 1e−12 × max(1, hi)」（hi 是目前區間的上端），"
    "最多 200 次，回傳 (lo + hi) / 2。F(mid) > 目標值時 lo = mid，否則 hi = mid。log-sum-exp 依 i = 0…k 的順序加總。",
    "M2：ci95 是「命中機率」的區間（μ_L、μ_U 換成 λ 再代入 p），不是 μ 或 λ 的區間；units.garwood 才是 μ 的區間。",
    "headline 為 poisson-upper 時，主數字 = poisson.ci95[1]（n = 0 的 μ_U 也用同一個二分法，不另用 −ln 0.025 的封閉解）。",
    "M4a 光譜與 M4b 矩陣的規模項一律套用預言的地區（震度型預言也一樣，地區只對震度本身不適用）；光譜與矩陣在大小沒說時照樣計算。",
    "M4b claimCell 用有效門檻 m*（被夾到 4.0 的也算，例如 M3.5 嚴格 → m* = 4.0 → 第 0 列），T 用夾過的窗口長度。",
    "M4c from 一律是原預言的 M1 p̂（不是主數字）；主數字為 poisson-upper 時 p̂ = 0，所以沒有任何灌水成分。",
    "M4c time：alt.time = { kind: 'date', start: 原 start, end: 原 start, days: 1 }，其他欄位不變。",
    "M4c region（taiwan → 單一縣市）：alt.region = { kind: 'counties', ids: [id], bufferKm: 30 }，不帶 group；"
    "依 meta.counties.items 的順序逐一計算，嚴格大於目前最大值才換人（同值取較前者）。",
    "M4c region（多縣市 → 單一縣市）：alt.region = { kind: 'counties', ids: [id], bufferKm: 原值 }，不帶 group；依 ids 順序，同值取較前者。",
    "M4c region（單一縣市、外推 > 0）：alt.region 為原 region 只把 bufferKm 改成 0（其他欄位保留）。單一縣市且外推 = 0 時不做。",
    "M4c size：規模型 alt.size.value = 值 + 1.0（tolerance 不變），值 + 1.0 > 9 時不做；震度型 value + 1，> 7 時不做。",
    "M4c 排序：ratio 由大到小，null 視為最大；同值（含都為 null）依 time、region、size、tolerance 的順序（穩定排序）。",
    "M8：yearRun 的 n 若 n_year·T > L 改用 floor(L / T)；歷史分布用 d ∈ [startDay, endDay − n·T] 的 k(d)。",
    "M8 二項分布：在對數空間用 ln C(n,k) + k·ln p + (n−k)·ln(1−p) 計算；p = 0 或 p = 1 時直接用定義"
    "（0^0 = 1，即 p = 0 → [1, 0, …]、p = 1 → […, 0, 1]），避免 0 × ln 0 = NaN。",
    "M10：posterior_k = 1 / (1 + exp(−logit_k))，logit_k = ln(π/(1−π)) + k·ln(s/p0)；p0 = 0 時 k ≥ 1 的後驗為 1。"
    "expected.json 只記 p0、posteriorAfterOne、hitsNeeded、曲線長度（K + 1）與最後一點。",
    "M12：logit(x) = ln(x / (1 − x))；類比距離嚴格小於目前最小值才換人（同距離取清單中較前者）。",
    "M13：bits = −log2(p)，p = 0 時為 Infinity（JSON 寫成字串 \"Infinity\"）；p = 1 時為 −0。",
    "M14：diff = poisson.p − replay.p。",
]


# ================================================================== 時間（同 src/core/time.ts）

_EPOCH = date(1970, 1, 1)
SECONDS_PER_DAY = 86400
TAIPEI_OFFSET_S = 8 * 3600


def local_day(unix: int | float) -> int:
    """unix 秒 → 台灣日序：floor((unix + 28800) / 86400)。"""
    if isinstance(unix, int):
        return (unix + TAIPEI_OFFSET_S) // SECONDS_PER_DAY
    return math.floor((unix + TAIPEI_OFFSET_S) / SECONDS_PER_DAY)


def iso_to_day(iso: str) -> int:
    y, m, d = (int(x) for x in iso.split("-"))
    return (date(y, m, d) - _EPOCH).days


def day_to_iso(day: int) -> str:
    return (_EPOCH + timedelta(days=day)).isoformat()


def year_of_day(day: int) -> int:
    return (_EPOCH + timedelta(days=day)).year


# ================================================================== 亂數（附錄 A）

_U32 = 0xFFFFFFFF


def mulberry32(seed: int) -> Callable[[], float]:
    """位元層級與 JavaScript 版相同。

    所有中間值都以「無號 32 位元」保存：Math.imul 的結果只有低 32 位元有意義，
    有號／無號只是同一組位元的兩種讀法；>>> 是對無號值右移，所以這裡直接用 >>。
    """
    a = seed & _U32

    def next_float() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & _U32
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & _U32  # Math.imul(t ^ (t >>> 15), t | 1)
        t = (t ^ ((t + (((t ^ (t >> 7)) * (t | 61)) & _U32)) & _U32)) & _U32  # t ^= t + Math.imul(...)
        return ((t ^ (t >> 14)) & _U32) / 4294967296

    return next_float


# ================================================================== Poisson（附錄 B）


def poisson_cdf(k: int, mu: float) -> float:
    """F(k; μ) = Σ_{i=0}^{k} exp(−μ + i·ln μ − ln i!)，在對數空間累加。μ = 0 時 F = 1。"""
    if mu == 0:
        return 1.0
    if k < 0:
        return 0.0
    ln_mu = math.log(mu)
    logt = -mu
    terms = [logt]
    for i in range(1, k + 1):
        logt = logt + ln_mu - math.log(i)
        terms.append(logt)
    m = max(terms)
    s = 0.0
    for x in terms:
        s += math.exp(x - m)
    return math.exp(m + math.log(s))


def _bisect_decreasing(f: Callable[[float], float], target: float, hi: float) -> float:
    """在 [0, hi] 找 f(μ) = target（f 遞減）。"""
    lo = 0.0
    for _ in range(200):
        if hi - lo < 1e-12 * max(1.0, hi):
            break
        mid = (lo + hi) / 2
        if f(mid) > target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def poisson_count_ci(n: int) -> tuple[float, float]:
    """Garwood 95% 精確區間 [μ_L, μ_U]（事件數 n 的期望值 μ）。"""
    hi0 = n + 10 * math.sqrt(n + 1) + 10
    lower = 0.0 if n == 0 else _bisect_decreasing(lambda mu: poisson_cdf(n - 1, mu), 0.975, hi0)
    upper = _bisect_decreasing(lambda mu: poisson_cdf(n, mu), 0.025, hi0)
    return lower, upper


# ================================================================== 資料與地區


def region_key(region: dict[str, Any]) -> tuple[Any, ...]:
    if region["kind"] == "taiwan":
        return ("taiwan",)
    if region["kind"] == "counties":
        return ("counties", tuple(region["ids"]), float(region["bufferKm"]))
    raise ValueError(f"未知的地區類型：{region!r}")


def size_key(size: dict[str, Any]) -> tuple[Any, ...]:
    if size["kind"] == "magnitude":
        return ("magnitude", float(size["value"]), size["tolerance"])
    if size["kind"] == "intensity":
        return ("intensity", float(size["value"]))
    return ("unspecified",)


def raw_threshold(size: dict[str, Any]) -> float:
    """規模型的門檻（夾到 4.0 之前）：strict = 值、lenient = 值 − 0.5。"""
    return size["value"] if size["tolerance"] == "strict" else size["value"] - 0.5


def effective_threshold(size: dict[str, Any]) -> float:
    """m* = max(4.0, 門檻)。"""
    return max(MIN_ML, raw_threshold(size))


class Data:
    def __init__(self, data_dir: Path) -> None:
        def read(name: str) -> Any:
            with open(data_dir / name, encoding="utf-8") as f:
                return json.load(f)

        self.catalog = read("catalog.json")
        self.felt = read("felt.json")
        self.meta = read("meta.json")

        period = self.meta["period"]
        self.start_unix: int = period["startUnix"]
        self.end_unix: int = period["endUnix"]
        self.start_day = local_day(self.start_unix)
        self.end_day = local_day(self.end_unix)
        self.length = self.end_day - self.start_day  # L
        self.years = self.length / 365.25  # Y

        self.county_ids: list[str] = [it["id"] for it in self.meta["counties"]["items"]]
        self.county_index = {cid: i for i, cid in enumerate(self.county_ids)}

        cat = self.catalog
        self.n_catalog = len(cat["t"])
        self.cat_day = [local_day(t) for t in cat["t"]]
        self.felt_day = [local_day(t) for t in self.felt["t"]]

        near = cat["near"]
        self.near_by_county: list[list[tuple[int, float]]] = [[] for _ in self.county_ids]
        for e, c, km in zip(near["event"], near["county"], near["km"]):
            self.near_by_county[c].append((e, km))

        self._mask_cache: dict[tuple[Any, ...], list[int]] = {}
        self._qual_cache: dict[tuple[Any, ...], dict[str, Any]] = {}
        self._prefix_cache: dict[tuple[Any, ...], list[int]] = {}

    # ---------------------------------------------------------------- 1.4 地區

    def region_mask(self, region: dict[str, Any]) -> list[int]:
        key = region_key(region)
        cached = self._mask_cache.get(key)
        if cached is not None:
            return cached
        if region["kind"] == "taiwan":
            b = TAIWAN_BOX
            mask = [
                1 if (b["latMin"] <= la <= b["latMax"] and b["lonMin"] <= lo <= b["lonMax"]) else 0
                for la, lo in zip(self.catalog["lat"], self.catalog["lon"])
            ]
        else:
            buf = region["bufferKm"]
            mask = [0] * self.n_catalog
            for cid in region["ids"]:
                ci = self.county_index[cid]  # 不存在的縣市代碼直接報錯
                for e, km in self.near_by_county[ci]:
                    if km <= buf:
                        mask[e] = 1
        self._mask_cache[key] = mask
        return mask

    # ---------------------------------------------------------------- 1.6 符合條件的地震

    def qualifying(self, size: dict[str, Any], region: dict[str, Any]) -> dict[str, Any]:
        key = (size_key(size), region_key(region) if size["kind"] == "magnitude" else None)
        cached = self._qual_cache.get(key)
        if cached is not None:
            return cached
        if size["kind"] == "magnitude":
            m_star = effective_threshold(size)
            mask = self.region_mask(region)
            ml = self.catalog["ml"]
            idx = [i for i in range(self.n_catalog) if mask[i] and ml[i] >= m_star]
            days = sorted({self.cat_day[i] for i in idx})
            q = {"days": days, "nEvents": len(idx), "threshold": m_star, "regionApplied": True}
        elif size["kind"] == "intensity":
            v = size["value"]
            idx = [i for i, x in enumerate(self.felt["intensity"]) if x >= v]
            days = sorted({self.felt_day[i] for i in idx})
            q = {"days": days, "nEvents": len(idx), "threshold": v, "regionApplied": False}
        else:
            raise ValueError("大小沒說時沒有單一的「符合條件的地震」")
        q["key"] = key
        self._qual_cache[key] = q
        return q

    # ---------------------------------------------------------------- 1.7 窗口命中

    def _prefix(self, q: dict[str, Any]) -> list[int]:
        """prefix[i] = 期間第 0..i−1 天中「有符合條件地震」的天數。"""
        cached = self._prefix_cache.get(q["key"])
        if cached is not None:
            return cached
        mark = bytearray(self.length)
        for e in q["days"]:
            if self.start_day <= e < self.end_day:
                mark[e - self.start_day] = 1
        prefix = [0] * (self.length + 1)
        s = 0
        for i in range(self.length):
            s += mark[i]
            prefix[i + 1] = s
        self._prefix_cache[q["key"]] = prefix
        return prefix

    def window_length(self, days: int) -> int:
        """T = max(1, min(time.days, endDay − startDay))。"""
        return max(1, min(days, self.length))

    def hit_series(self, q: dict[str, Any], T: int) -> list[int]:
        """h(d)，d = startDay … endDay − T（索引 0 … N − 1）。"""
        prefix = self._prefix(q)
        n_windows = self.length - T + 1
        return [1 if prefix[i + T] > prefix[i] else 0 for i in range(n_windows)]

    def p_hat(self, size: dict[str, Any], region: dict[str, Any], T: int) -> float:
        h = self.hit_series(self.qualifying(size, region), T)
        return sum(h) / len(h)


# ================================================================== M1 歷史回放


def compute_replay(data: Data, q: dict[str, Any], T: int) -> tuple[dict[str, Any], list[int]]:
    h = data.hit_series(q, T)
    hits = sum(h)
    windows = len(h)
    p = hits / windows

    per_year: dict[int, list[int]] = {}
    for i, v in enumerate(h):
        y = year_of_day(data.start_day + i)
        acc = per_year.setdefault(y, [0, 0])
        acc[0] += v
        acc[1] += 1
    years = sorted(y for y, acc in per_year.items() if acc[1] > 0)
    hits_y = [per_year[y][0] for y in years]
    windows_y = [per_year[y][1] for y in years]
    K = len(years)

    B = BOOTSTRAP_REPLICATES
    rng = mulberry32(BOOTSTRAP_SEED)  # 每次呼叫 M1 都重新設定種子
    reps: list[float] = []
    for _ in range(B):
        sh = 0
        sw = 0
        for _ in range(K):
            j = math.floor(rng() * K)
            sh += hits_y[j]
            sw += windows_y[j]
        reps.append(sh / sw)
    reps.sort()
    lo_i = math.floor(0.025 * B)
    hi_i = math.ceil(0.975 * B) - 1
    assert (lo_i, hi_i) == (25, 974)
    ci95 = [reps[lo_i], reps[hi_i]]

    n_slots = data.length // T  # 直到 startDay + (s+1)·T > endDay
    slots = [h[s * T] for s in range(n_slots)]

    replay = {
        "p": p,
        "hits": hits,
        "windows": windows,
        "nEvents": q["nEvents"],
        "threshold": q["threshold"],
        "regionApplied": q["regionApplied"],
        "windowDays": T,
        "ci95": ci95,
        "byYear": [{"year": y, "hits": hy, "windows": wy} for y, hy, wy in zip(years, hits_y, windows_y)],
        "slotsLength": len(slots),
        "slotsSum": sum(slots),
        "slotsHead": slots[:64],
    }
    return replay, h


# ================================================================== M2 固定速率


def window_p(rate_per_year: float, T: int) -> float:
    return 1 - math.exp(-rate_per_year * T / 365.25)


def compute_poisson(data: Data, n: int, T: int) -> dict[str, Any]:
    Y = data.years
    rate = n / Y
    mu_lo, mu_hi = poisson_count_ci(n)
    return {
        "n": n,
        "years": Y,
        "ratePerYear": rate,
        "p": window_p(rate, T),
        "ci95": [window_p(mu_lo / Y, T), window_p(mu_hi / Y, T)],
        "windowDays": T,
    }


# ================================================================== M4a 解讀光譜


def compute_spectrum(data: Data, region: dict[str, Any], T: int) -> list[dict[str, Any]]:
    items = []
    for sid, size in SPECTRUM:
        q = data.qualifying(size, region)
        h = data.hit_series(q, T)
        items.append({"id": sid, "p": sum(h) / len(h), "nEvents": q["nEvents"], "regionApplied": q["regionApplied"]})
    items.sort(key=lambda it: -it["p"])  # Python 的排序是穩定的：同值保持原順序
    return items


# ================================================================== M4b 敏感度矩陣


def compute_matrix(data: Data, claim: dict[str, Any], T: int) -> dict[str, Any]:
    region = claim["region"]
    p = [
        [data.p_hat({"kind": "magnitude", "value": m, "tolerance": "strict"}, region, data.window_length(w))
         for w in MATRIX_WINDOWS]
        for m in MATRIX_MAGNITUDES
    ]
    cell = None
    size = claim["size"]
    if size["kind"] == "magnitude":
        m_star = effective_threshold(size)
        if m_star in MATRIX_MAGNITUDES and T in MATRIX_WINDOWS:
            cell = [MATRIX_MAGNITUDES.index(m_star), MATRIX_WINDOWS.index(T)]
    return {"magnitudes": MATRIX_MAGNITUDES, "windowDays": MATRIX_WINDOWS, "p": p, "claimCell": cell}


# ================================================================== M4c 灌水成分


def _with(claim: dict[str, Any], **changes: Any) -> dict[str, Any]:
    alt = json.loads(json.dumps(claim))  # 深拷貝
    alt.update(changes)
    return alt


def compute_factors(data: Data, claim: dict[str, Any], T: int, p_from: float) -> list[dict[str, Any]]:
    size = claim["size"]
    region = claim["region"]
    if size["kind"] == "unspecified":
        return []

    def p_of(alt: dict[str, Any]) -> float:
        return data.p_hat(alt["size"], alt["region"], data.window_length(alt["time"]["days"]))

    candidates: list[tuple[str, dict[str, Any]]] = []

    # time
    if T > 1:
        start = claim["time"]["start"]
        candidates.append(("time", _with(claim, time={"kind": "date", "start": start, "end": start, "days": 1})))

    # region（震度型不做：地區不適用）
    if size["kind"] == "magnitude":
        if region["kind"] == "taiwan":
            best: dict[str, Any] | None = None
            best_p = -1.0
            for cid in data.county_ids:
                alt = _with(claim, region={"kind": "counties", "ids": [cid], "bufferKm": DEFAULT_BUFFER_KM})
                pa = p_of(alt)
                if pa > best_p:
                    best, best_p = alt, pa
            assert best is not None
            candidates.append(("region", best))
        elif len(region["ids"]) >= 2:
            best = None
            best_p = -1.0
            for cid in region["ids"]:
                alt = _with(claim, region={"kind": "counties", "ids": [cid], "bufferKm": region["bufferKm"]})
                pa = p_of(alt)
                if pa > best_p:
                    best, best_p = alt, pa
            assert best is not None
            candidates.append(("region", best))
        elif region["bufferKm"] > 0:
            new_region = dict(region)
            new_region["bufferKm"] = 0
            candidates.append(("region", _with(claim, region=new_region)))

    # size
    if size["kind"] == "magnitude":
        v = size["value"] + 1.0
        if v <= 9:
            candidates.append(("size", _with(claim, size={"kind": "magnitude", "value": v, "tolerance": size["tolerance"]})))
    elif size["kind"] == "intensity":
        v = size["value"] + 1
        if v <= 7:
            candidates.append(("size", _with(claim, size={"kind": "intensity", "value": v})))

    # tolerance
    if size["kind"] == "magnitude" and size["tolerance"] == "lenient":
        candidates.append(("tolerance", _with(claim, size={"kind": "magnitude", "value": size["value"], "tolerance": "strict"})))

    factors = []
    for dim, alt in candidates:
        to = p_of(alt)
        if to < p_from:
            factors.append({"dimension": dim, "from": p_from, "to": to, "ratio": (p_from / to) if to > 0 else None, "alt": alt})
    # ratio 由大到小，null 視為最大；穩定排序保留 time、region、size、tolerance 的順序
    factors.sort(key=lambda f: (0, 0.0) if f["ratio"] is None else (1, -f["ratio"]))
    return factors


# ================================================================== M8 亂槍打鳥


def binomial_pmf(n: int, p: float) -> list[float]:
    if p <= 0:
        return [1.0] + [0.0] * n
    if p >= 1:
        return [0.0] * n + [1.0]
    lp = math.log(p)
    lq = math.log(1 - p)
    return [math.exp(math.log(math.comb(n, k)) + k * lp + (n - k) * lq) for k in range(n + 1)]


def compute_shotgun(data: Data, p: float, h: list[int], T: int) -> dict[str, Any]:
    L = data.length
    n_windows = len(h)  # = L − T + 1
    n_year = max(1, 365 // T)
    ns = {n for n in SHOTGUN_NS if n * T <= L}
    if n_year * T <= L:
        ns.add(n_year)

    # suffix[i] = h[i] + h[i+T] + h[i+2T] + …；k(d) = suffix[d] − suffix[d + n·T]
    suffix = [0] * n_windows
    for i in range(n_windows - 1, -1, -1):
        suffix[i] = h[i] + (suffix[i + T] if i + T < n_windows else 0)

    def k_values(n: int) -> list[int]:
        count = L - n * T + 1  # d ∈ [startDay, endDay − n·T]
        return [suffix[i] - (suffix[i + n * T] if i + n * T < n_windows else 0) for i in range(count)]

    rows = []
    for n in sorted(ns):
        ks = k_values(n)
        rows.append({
            "n": n,
            "independent": 1 - (1 - p) ** n,
            "historical": sum(1 for k in ks if k >= 1) / len(ks),
            "expectedHits": n * p,
            "historicalMeanHits": sum(ks) / len(ks),
        })

    n_run = n_year if n_year * T <= L else L // T
    ks = k_values(n_run)
    counts = [0] * (n_run + 1)
    for k in ks:
        counts[k] += 1
    return {
        "p": p,
        "rows": rows,
        "yearRun": {"n": n_run, "binomial": binomial_pmf(n_run, p), "historical": [c / len(ks) for c in counts]},
    }


# ================================================================== M10 要連中幾次才可信


def _sigmoid(x: float) -> float:
    if -x > 709:  # exp 溢位：JavaScript 會得到 1 / (1 + Infinity) = 0
        return 0.0
    return 1 / (1 + math.exp(-x))


def compute_bayes(p0: float, prior: float = 0.01, target: float = 0.95, skill: float = 1.0) -> dict[str, Any]:
    post1 = prior * skill / (prior * skill + (1 - prior) * p0)
    if prior >= target:
        need: int | None = 0
    elif p0 == 0:
        need = 1
    elif skill <= p0:
        need = None
    else:
        x = math.log((target / (1 - target)) / (prior / (1 - prior))) / math.log(skill / p0)
        need = math.ceil(x - 1e-9)
    K = min(max((need if need is not None else 0) + 2, 10), 200)
    prior_logit = math.log(prior / (1 - prior))
    curve = []
    for k in range(K + 1):
        if p0 == 0:
            post = prior if k == 0 else 1.0
        else:
            post = _sigmoid(prior_logit + k * math.log(skill / p0))
        curve.append({"k": k, "posterior": post})
    return {"prior": prior, "target": target, "skill": skill, "p0": p0,
            "posteriorAfterOne": post1, "hitsNeeded": need, "curve": curve}


# ================================================================== M12、M13


def level_of(p: float) -> str:
    for lid, lo in LEVELS:
        if p >= lo:
            return lid
    return LEVELS[-1][0]


def _logit(x: float) -> float:
    return math.log(x / (1 - x))


def analogy_of(p: float) -> str:
    q = min(max(p, 1e-9), 1 - 1e-9)
    lq = _logit(q)
    best_id = ""
    best_d = math.inf
    for aid, num, den in ANALOGIES:
        d = abs(lq - _logit(num / den))
        if d < best_d:
            best_id, best_d = aid, d
    return best_id


def information_bits(p: float) -> float:
    return math.inf if p == 0 else -math.log2(p)


# ================================================================== 全部模式


def compute_claim(data: Data, claim: dict[str, Any]) -> dict[str, Any]:
    t = claim["time"]
    if iso_to_day(t["end"]) - iso_to_day(t["start"]) + 1 != t["days"]:
        raise ValueError(f"time.days 與 start/end 不一致：{t!r}")
    size = claim["size"]
    region = claim["region"]
    T = data.window_length(t["days"])

    flags: list[str] = []
    if size["kind"] == "magnitude" and raw_threshold(size) < MIN_ML:
        flags.append("size-below-min")
    if size["kind"] == "intensity" and region["kind"] != "taiwan":
        flags.append("size-intensity-region-ignored")

    spectrum = compute_spectrum(data, region, T)
    matrix = compute_matrix(data, claim, T)
    out: dict[str, Any] = {
        "period": {"startDay": data.start_day, "endDay": data.end_day, "years": data.years},
        "T": T,
        "headline": None,
        "flags": flags,
        "replay": None,
        "poisson": None,
        "spectrum": spectrum,
        "matrix": matrix,
        "factors": [],
        "shotgun": None,
        "bayes": None,
        "level": None,
        "analogy": None,
        "information": None,
        "compare": None,
    }

    if size["kind"] == "unspecified":
        ps = [it["p"] for it in spectrum]
        out["headline"] = {"p": None, "range": [min(ps), max(ps)], "source": "spectrum"}
        return out

    q = data.qualifying(size, region)
    replay, h = compute_replay(data, q, T)
    poisson = compute_poisson(data, q["nEvents"], T)
    if q["nEvents"] > 0:
        headline = {"p": replay["p"], "range": None, "source": "empirical"}
    else:
        headline = {"p": poisson["ci95"][1], "range": None, "source": "poisson-upper"}
    p = headline["p"]

    bayes = compute_bayes(p, **BAYES_DEFAULTS)
    out.update({
        "headline": headline,
        "replay": replay,
        "poisson": poisson,
        "factors": compute_factors(data, claim, T, replay["p"]),
        "shotgun": compute_shotgun(data, p, h, T),
        "bayes": {
            "prior": bayes["prior"],
            "target": bayes["target"],
            "skill": bayes["skill"],
            "p0": bayes["p0"],
            "posteriorAfterOne": bayes["posteriorAfterOne"],
            "hitsNeeded": bayes["hitsNeeded"],
            "curveLength": len(bayes["curve"]),
            "curveLast": bayes["curve"][-1]["posterior"],
        },
        "level": level_of(p),
        "analogy": analogy_of(p),
        "information": information_bits(p),
        "compare": {
            "empirical": replay["p"],
            "empiricalCi": replay["ci95"],
            "poisson": poisson["p"],
            "poissonCi": poisson["ci95"],
            "diff": poisson["p"] - replay["p"],
        },
    })
    return out


def compute_units() -> dict[str, Any]:
    rng = mulberry32(BOOTSTRAP_SEED)
    first5 = [rng() for _ in range(5)]
    garwood = []
    for n in UNIT_GARWOOD_NS:
        lo, hi = poisson_count_ci(n)
        garwood.append({"n": n, "ci": [lo, hi]})
    return {
        "mulberry32": {"seed": BOOTSTRAP_SEED, "values": first5},
        "garwood": garwood,
        "bayesHitsNeeded": [
            {"p0": p0, "hitsNeeded": compute_bayes(p0, **BAYES_DEFAULTS)["hitsNeeded"]} for p0, _ in BAYES_TABLE
        ],
        "levelAnalogy": [
            {"p": p, "level": level_of(p), "analogy": analogy_of(p), "bits": information_bits(p)} for p in UNIT_LEVEL_PS
        ],
    }


# ================================================================== 自我檢查


def self_check(units: dict[str, Any], results: dict[str, dict[str, Any]], data: Data) -> list[str]:
    """與 MODELS.md 附錄 A、B 與第 4 節的已知值比對。回傳錯誤訊息（空 = 通過）。"""
    errors: list[str] = []
    for got, want in zip(units["mulberry32"]["values"], MULBERRY32_VECTOR):
        if round(got, 12) != want:
            errors.append(f"mulberry32：{got!r} 四捨五入到 12 位不是 {want}")
    for item in units["garwood"]:
        if item["n"] in GARWOOD_TABLE:
            for got, want, name in zip(item["ci"], GARWOOD_TABLE[item["n"]], ("μ_L", "μ_U")):
                if abs(got - want) > 1e-5:
                    errors.append(f"Garwood n={item['n']} {name}：{got!r}，附錄 B 為 {want}")
    for item, (_, want) in zip(units["bayesHitsNeeded"], BAYES_TABLE):
        if item["hitsNeeded"] != want:
            errors.append(f"M10 p0={item['p0']}：hitsNeeded {item['hitsNeeded']}，應為 {want}")

    def pct(x: float) -> float:
        return round(x * 100, 1)

    # MODELS.md 第 4 節（台灣及近海、T = 7）
    checks = [
        ({"kind": "magnitude", "value": 5.0, "tolerance": "strict"}, 41.2, 53.0, 1223),
        ({"kind": "magnitude", "value": 6.0, "tolerance": "strict"}, 5.9, 7.5, 126),
        ({"kind": "intensity", "value": 1}, 94.6, None, None),
    ]
    for size, want_m1, want_m2, want_n in checks:
        q = data.qualifying(size, {"kind": "taiwan"})
        replay, _ = compute_replay(data, q, 7)
        poisson = compute_poisson(data, q["nEvents"], 7)
        if pct(replay["p"]) != want_m1:
            errors.append(f"第 4 節 {size}：M1 {pct(replay['p'])}%，試算為 {want_m1}%")
        if want_m2 is not None and pct(poisson["p"]) != want_m2:
            errors.append(f"第 4 節 {size}：M2 {pct(poisson['p'])}%，試算為 {want_m2}%")
        if want_n is not None and q["nEvents"] != want_n:
            errors.append(f"第 4 節 {size}：n = {q['nEvents']}，試算為 {want_n}")

    r = results.get("tw-m5-strict-7d")
    if r is not None and (pct(r["replay"]["p"]) != 41.2 or pct(r["poisson"]["p"]) != 53.0 or r["poisson"]["n"] != 1223):
        errors.append("claims.json 的 tw-m5-strict-7d 和第 4 節的試算不一致")
    return errors


def print_design_tables(data: Data) -> None:
    """印出 DESIGN.md 3.1、3.2 的對照（只供人工檢查；試算用的是原始資料，可能有些微差異）。"""
    print("DESIGN.md 3.1（台灣及近海，嚴格）：門檻 | n | 7 天 Poisson | 7 天 歷史 | 30 天 Poisson | 30 天 歷史")
    for m in MATRIX_MAGNITUDES:
        size = {"kind": "magnitude", "value": m, "tolerance": "strict"}
        q = data.qualifying(size, {"kind": "taiwan"})
        cells = []
        for T in (7, 30):
            po = compute_poisson(data, q["nEvents"], T)["p"]
            h = data.hit_series(q, T)
            cells += [f"{po * 100:5.1f}%", f"{sum(h) / len(h) * 100:5.1f}%"]
        print(f"  ML ≥ {m:.1f} | {q['nEvents']:5d} | " + " | ".join(cells))
    print("DESIGN.md 3.2（下週、台灣及近海）：")
    for it in compute_spectrum(data, {"kind": "taiwan"}, 7):
        print(f"  {it['id']:5s} {it['p'] * 100:5.1f}%  (n = {it['nEvents']})")


# ================================================================== JSON 輸出


def _scalar(x: Any) -> str:
    if isinstance(x, float):
        if math.isnan(x):
            raise ValueError("expected.json 不應出現 NaN")
        if math.isinf(x):
            return '"Infinity"' if x > 0 else '"-Infinity"'
        return repr(x)  # 最短且可完整還原的表示，和 json.dumps 相同
    return json.dumps(x, ensure_ascii=False)


def _inline(obj: Any) -> str | None:
    """短、只含純量（或純量陣列）的物件放同一行；其他回傳 None。"""
    if isinstance(obj, list):
        if all(not isinstance(x, (dict, list)) for x in obj):
            return "[" + ", ".join(_scalar(x) for x in obj) + "]"
        return None
    if isinstance(obj, dict):
        parts = []
        for k, v in obj.items():
            if isinstance(v, dict):
                return None
            s = _inline(v) if isinstance(v, list) else _scalar(v)
            if s is None:
                return None
            parts.append(f"{json.dumps(k, ensure_ascii=False)}: {s}")
        text = "{" + ", ".join(parts) + "}"
        return text if len(text) <= 160 else None
    return _scalar(obj)


def dump_json(obj: Any, indent: int = 0) -> str:
    """物件換行縮排；純量陣列與短物件放同一行，長的字串清單一行一項（diff 比較好讀）。"""
    pad = "  " * indent
    if isinstance(obj, dict):
        if not obj:
            return "{}"
        body = ",\n".join(f"{pad}  {json.dumps(k, ensure_ascii=False)}: {dump_json(v, indent + 1)}" for k, v in obj.items())
        return "{\n" + body + "\n" + pad + "}"
    if isinstance(obj, list):
        flat = _inline(obj)
        if flat is not None and not (any(isinstance(x, str) for x in obj) and len(flat) > 160):
            return flat
        items = [(_inline(v) if isinstance(v, dict) else None) or dump_json(v, indent + 1) for v in obj]
        body = ",\n".join(f"{pad}  {s}" for s in items)
        return "[\n" + body + "\n" + pad + "]"
    return _scalar(obj)


def build(data: Data, claims: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    ids = [c["id"] for c in claims]
    if len(set(ids)) != len(ids):
        raise ValueError("claims.json 的 id 有重複")
    results = {c["id"]: compute_claim(data, c["claim"]) for c in claims}
    doc = {
        "generator": "tools/golden.py",
        "spec": "docs/MODELS.md",
        "data": {
            "startUnix": data.start_unix,
            "endUnix": data.end_unix,
            "catalogCount": data.n_catalog,
            "feltCount": len(data.felt["t"]),
        },
        "interpretations": INTERPRETATIONS,
        "units": compute_units(),
        "claims": [{"id": c["id"], "claim": c["claim"], **results[c["id"]]} for c in claims],
    }
    return doc, results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="只比對現有的 expected.json，不寫檔")
    args = parser.parse_args()

    data = Data(DATA_DIR)
    with open(CLAIMS_PATH, encoding="utf-8") as f:
        claims = json.load(f)
    doc, results = build(data, claims)
    text = dump_json(doc) + "\n"

    errors = self_check(doc["units"], results, data)
    print(f"期間 {day_to_iso(data.start_day)} … {day_to_iso(data.end_day)}（不含），L = {data.length} 天，Y = {data.years!r} 年")
    for c in claims:
        r = results[c["id"]]
        hp = r["headline"]["p"]
        head = f"{hp * 100:7.3f}%" if hp is not None else "  range "
        extra = ""
        if r["replay"] is not None:
            extra = (f"M1 {r['replay']['p'] * 100:6.2f}% [{r['replay']['ci95'][0] * 100:.2f}, {r['replay']['ci95'][1] * 100:.2f}]"
                     f"  M2 {r['poisson']['p'] * 100:6.2f}%  n = {r['replay']['nEvents']}")
        print(f"  {c['id']:26s} T = {r['T']:3d} {r['headline']['source']:13s} {head}  {extra}")
    print_design_tables(data)

    if errors:
        print("\n自我檢查失敗：", file=sys.stderr)
        for e in errors:
            print("  - " + e, file=sys.stderr)
        return 1

    if args.check:
        current = EXPECTED_PATH.read_text(encoding="utf-8") if EXPECTED_PATH.exists() else ""
        if current != text:
            print(f"\n{EXPECTED_PATH.relative_to(ROOT)} 和重新計算的結果不同（請執行 python tools/golden.py）", file=sys.stderr)
            return 1
        print(f"\n{EXPECTED_PATH.relative_to(ROOT)} 是最新的。")
        return 0

    EXPECTED_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(EXPECTED_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"\n已寫入 {EXPECTED_PATH.relative_to(ROOT)}（{len(claims)} 則預言）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
