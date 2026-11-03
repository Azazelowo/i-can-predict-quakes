# AGENTS.md — 我也會地震預測

> 給在這個 repo 工作的人與 AI 代理的專案規則。通用的回應風格與研究原則沿用使用者的全域 AGENTS.md；這裡只寫本專案特有的規則。

## 這是什麼

輸入一則地震預言（例如「某某說下週會大地震」），網頁算出「就算隨便亂猜，這種預言有多大機率會中」，並用多種模式解釋為什麼。
屬於實務專題「基於地球物理與多維觀測資料打造地震風險評估 APP」的預期成果 4「民間前兆假說的量化驗證」，以獨立 repo 公開。

## 單一真相來源

| 內容 | 檔案 |
|---|---|
| 每個數字的定義、公式、解析規則 | `docs/MODELS.md` |
| 型別契約 | `src/core/types.ts` |
| 固定參數（門檻、清單、種子） | `src/core/constants.ts` |
| 縣市、分區、地名詞表 | `src/core/regions.ts` |
| 產品設計、決策紀錄 | `docs/DESIGN.md` |

改規則時，**文件、型別、常數、實作、測試要一起改**。

## 結構

```text
src/core/      共用：型別、常數、縣市表、台灣日期換算
src/claim/     解析器：自由文字 → Claim（規則式，不用 LLM）
src/modes/     各模式的計算（只回傳數字與代碼，不含文字）
src/data/      載入 public/data/*.json
src/app/       狀態、網址同步
src/ui/        畫面、圖表（SVG）
src/copy/      所有給使用者看的文字（zh-TW）
public/data/   tools/build_data.py 產生的資料（進版控）
tools/         Python：資料建置、獨立驗證（golden）、可行性試算
tests/         Vitest；tests/golden/ 是 Python 算出的對照答案
```

## 規則

1. **數字只由程式產生**。說明文字用模板加變數，不手寫數字。
2. **模式只回傳數字與代碼**，文字放 `src/copy/zh-TW.ts`，之後要加英文只改這裡。
3. **不送出、不保存使用者輸入**。全部計算在瀏覽器完成；網址與分享文字只放結構化的 Claim，**不放原文**（原文可能有人名）。
4. **不點名真實的預言來源**（例如 quakeforecast）。測試案例可以用它的範本句型，但畫面上不出現來源名稱。
5. **v1 只做台灣**。國外地名只加旗標提醒，不計算。
6. **不是預報**。不做「今天」的即時機率；文案一律寫「隨便猜也會中的機率」，並附中央氣象署連結。
7. 語言：繁體中文、台灣用語；程式註解可用英文或中文。
8. 不用外部 CDN 或追蹤碼；圖表用自己產生的 SVG。

## 開發

Windows 上請用 `C:\Program Files\nodejs` 的 Node 24（PATH 裡 emsdk 的 Node 20 太舊，Vite 8 不支援）。

```bash
npm install
npm run dev          # 開發伺服器
npm run check        # 型別檢查 + 測試 + 建置，提交前必跑
```

重建資料（原始資料不在 repo 裡，放在實務專題的資料夾）：

```bash
EQ_DATA_DIR=<含 E-A0073-002 與 earthquake_data 的資料夾> python tools/build_data.py
python tools/golden.py   # 重新產生獨立驗證的對照答案
npm test
```

## 驗證

- `tests/golden.test.ts`：`tools/golden.py` 只依 `docs/MODELS.md` 獨立實作，網頁程式的結果必須與它一致。
- 改了計算規則就要重跑 `python tools/golden.py`，並確認差異是預期的。
- 部署由 `.github/workflows/deploy.yml` 在 push 到 `main` 時執行：測試通過才會發布到 GitHub Pages。
