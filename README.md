# 潮汐監控 (Tide PWA)

台灣沿海 21 個測站的潮汐預報視覺化 PWA。以 Chart.js 繪製整月潮位曲線，標註滿潮／乾潮時間與潮高，並以橘色垂直線即時顯示當下時間。

🔗 **線上版本**：https://yisinluo.github.io/tide-pwa/

## 功能

- **測站切換** — 從基隆到宜蘭，涵蓋西岸、南端與東岸共 21 個測站
- **整月預報** — 圖表寬度依天數動態計算（每天約 600px），可水平滑動瀏覽
- **漲退潮配色** — 上升段藍色 `#0066ff`、下降段綠色 `#008000`
- **潮汐標註** — 每個滿潮／乾潮點標示「大／中／小潮」、潮高 (m)、日期(星期) 時間
- **現在時間線** — 橘色垂直線，每分鐘自動更新位置
- **PWA** — 可加入主畫面離線使用，service worker 快取靜態資源

## 專案結構

```
tide-pwa/
├── index.html         # 頁面骨架 + 樣式 + service worker 註冊
├── app.js             # 資料抓取、解析、Chart.js 繪圖邏輯
├── manifest.json      # PWA manifest（名稱、圖示、主題色）
├── service-worker.js  # 快取策略
├── icon-192.png       # PWA 圖示
├── icon-512.png
├── data/
│   └── tide.json      # 潮汐資料，由 GitHub Actions 每日產生
├── .github/workflows/
│   └── update-tide.yml
└── gas/
    └── Code.gs        # 舊版 GAS proxy（已停用，保留作備援）
```

無建置流程、無 npm 依賴。Chart.js 由 CDN 載入（jsDelivr）。

## 資料來源與架構

資料在**建置期**取得，執行期只讀靜態檔：

```
GitHub Actions（每日 cron）
   └→ 中央氣象署 API（只要 21 站，jq 瘦身）
       └→ commit data/tide.json
           └→ Pages CDN → 瀏覽器
```

前端**不持有任何 API 金鑰** — 金鑰存放於 GitHub Secrets，只在 Actions runner 內使用。使用的資料集為氣象署 **F-A0021-001**（潮汐預報）。

資料來源寫在 `app.js:8`：

```js
const API_URL = "./data/tide.json";
```

### 為什麼不即時呼叫 API

實測三種做法的差距很大：

| 做法 | 延遲 | 傳輸量 |
|------|------|--------|
| GAS 轉發全部 266 站（舊版） | 23,000 ms | 4.8 MB |
| 氣象署 API 直連，全部 266 站 | 3,700 ms | 4.8 MB |
| 氣象署 API 直連，只取 21 站 | 593 ms | 387 KB |
| **靜態檔（現行）** | **~120 ms** | 269 KB |

兩個瓶頸疊加：舊版抓了 266 站卻只用 21 站（浪費 92% 傳輸量），且 GAS 轉發 4.8 MB 就要吃掉約 19 秒。潮汐是 32 天滾動預報、一天最多更新一次，預先產生成靜態檔最划算。

### 資料更新機制

`.github/workflows/update-tide.yml` 每日 21:00 UTC（台灣 05:00）執行，也可從 **Actions → Update tide data → Run workflow** 手動觸發。

流程為：呼叫氣象署 API（帶 `LocationName` 只取 21 站）→ **驗證** `success` 為 true 且站數為 21 → 用 `jq` 只保留 `app.js` 會用到的欄位（省 30%）→ 內容有變才 commit。

> 驗證步驟不可省略。若氣象署回傳錯誤或空資料，工作流程會中斷而非把壞檔案 commit 上去，`data/tide.json` 保留前一版可用資料。

設定 Secret：Repo **Settings → Secrets and variables → Actions → New repository secret**，名稱 `CWA_API_KEY`，值為[氣象署開放資料平臺](https://opendata.cwa.gov.tw/)申請的授權碼（格式 `CWA-XXXXXXXX-...`）。

> ⚠️ GitHub 規定 repo 連續 60 天無活動時會自動停用排程工作流程（bot commit 不一定計入）。若長期未手動推送，需留意 Actions 是否仍在執行。

### 舊版 GAS Proxy（已停用）

前一版透過 Google Apps Script 代為呼叫氣象署 API。**目前已不再使用**，但 GAS 部署可保留不刪，作為 Actions 故障時的手動備援。程式碼備份於 [`gas/Code.gs`](gas/Code.gs)：

```js
function doGet(e) {
  // 1. 從腳本屬性中讀取 API Key
  var apiKey = PropertiesService.getScriptProperties().getProperty('CWA_API_KEY');

  // 2. 準備氣象局 API 網址
  var url = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0021-001?Authorization=' + apiKey;

  try {
    // 3. 發送請求給氣象局
    var response = UrlFetchApp.fetch(url, {
      'method': 'get',
      'muteHttpExceptions': true
    });

    // 4. 直接將氣象局回傳的 JSON 丟回給前端
    return ContentService.createTextOutput(response.getContentText())
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // 錯誤處理
    var errorJson = JSON.stringify({ error: error.toString() });
    return ContentService.createTextOutput(errorJson)
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

若要重新啟用作為備援：於 [script.google.com](https://script.google.com) 建立專案貼上程式碼 → **專案設定 → 指令碼屬性**新增 `CWA_API_KEY` → **部署為網頁應用程式**（執行身分：我；誰可以存取：**所有人**）→ 把產生的 `/exec` 網址填回 `app.js` 的 `API_URL`。

### 資料格式

`data/tide.json` 維持氣象署原始結構，`app.js` 依此路徑解析：

```
records.TideForecasts[]
  └── Location
       ├── LocationId / LocationName
       └── TimePeriods.Daily[]
            ├── Date        "YYYY-MM-DD"
            ├── TideRange   "大" | "中" | "小"
            └── Time[]
                 ├── DateTime     ISO 8601 (+08:00)
                 ├── Tide         "滿潮" | "乾潮" ...
                 └── TideHeights.AboveLocalMSL   單位 cm
```

潮高單位為公分，顯示時除以 100 換算為公尺。`app.js` 保留 `AboveLocalMSL` → `AboveTWD` → `AboveTWVD` → `AboveTWDV` → `AboveChartDatum` 的取用優先序，但工作流程已在瘦身時只保留 `AboveLocalMSL`，實際只會走第一順位。

「資料更新時間」取自 `data/tide.json` 回應的 `Last-Modified` 標頭，代表**資料產生時間**而非抓取時間。

## 部署（GitHub Pages）

專案透過 GitHub Pages 發布，推送至 `main` 分支即自動更新：

```bash
git add .
git commit -m "Update ..."
git push origin main
```

Pages 設定位於 repo 的 **Settings → Pages**，來源為 `main` 分支根目錄。部署通常在 1–2 分鐘內生效。

### ⚠️ 改動程式碼後務必更新快取版本

`service-worker.js:2` 的 `CACHE_NAME` 是使用者能否拿到新版的關鍵：

```js
const CACHE_NAME = 'tide-pwa-vNN';   // ← 每次改 app.js / index.html 都要 +1
```

版本號變更會觸發 `activate` 事件清除所有舊快取。若忘記更新，已安裝 PWA 的裝置可能持續使用舊資源。

### 快取策略

| 資源 | 策略 | 說明 |
|------|------|------|
| `index.html`、`app.js`、`data/tide.json`、頁面導航 | network-first | 優先取得最新程式碼與資料，失敗才回退快取 |
| 其餘同源靜態資源（圖示、manifest） | cache-first | 圖示等不常變動 |
| 外部資源 | network-first | 離線時回退至上次成功的回應 |

> `data/tide.json` 必須留在 network-first 名單（`service-worker.js` 的 `isCoreAsset`）。它是同源資源，一旦落入 cache-first 分支，裝置會永遠讀到舊資料直到版本號變更。

## 本機開發

Service worker 需要 HTTP 環境，不能直接開啟 `file://`：

```bash
# Python
python -m http.server 8000

# 或 Node
npx serve
```

然後開啟 http://localhost:8000

### 常用調整點

| 需求 | 位置 |
|------|------|
| 增減顯示的測站 | `app.js:11` `ALLOWED_STATION_KEYWORDS`（陣列順序即選單順序）**＋ workflow 的 `STATIONS` 與站數驗證** |
| 波線／時間線顏色 | `app.js:2-4` |
| 一天顯示的寬度 | `app.js:286` `widthPerDay` |
| Y 軸預設範圍 | `app.js:386-387` `suggestedMin` / `suggestedMax` |
| 字級（為戶外閱讀放大） | `index.html` `<style>` 區塊 |

除錯時建議在 DevTools → Application → Service Workers 勾選 **Update on reload**，避免被快取誤導。

## 疑難排解

**畫面顯示「潮汐資料更新失敗，請稍後再試」**

先在瀏覽器直接開啟 `https://<你的網址>/data/tide.json` 確認檔案本身正常：

| 狀況 | 原因 |
|------|------|
| 404 | `data/tide.json` 不存在 — Actions 從未成功執行過 |
| 檔案存在但日期是舊的 | 排程被停用或連續失敗，見 Actions 頁面的執行紀錄 |
| 檔案正常但畫面仍失敗 | 多為 service worker 快取問題，見下一則 |

Actions 若失敗，到 **Actions → Update tide data** 看是哪一步中斷。停在驗證步驟通常代表 `CWA_API_KEY` 未設定或已失效。

**資料很舊 / 改了程式碼但手機上沒更新** — `CACHE_NAME` 忘了加版號，或 `data/tide.json` 被移出 network-first 名單。改完 push，再從裝置移除 PWA 重新加入主畫面。

**測站選單少了幾站** — 氣象署的 `LocationName` 用字若有異動（例如「台」與「臺」、「市」與「縣」），`ALLOWED_STATION_KEYWORDS` 的 `includes` 比對會**靜默失敗**，該站直接從選單消失而不會報錯。曾經發生過：`花蓮市吉安鄉` 實際應為 `花蓮縣吉安鄉`。

注意 `app.js` 與 `.github/workflows/update-tide.yml` **各有一份測站清單**，增減測站時兩邊都要改，否則 workflow 的站數驗證（`test "$COUNT" -eq 21`）會失敗。

## 授權

個人專案。潮汐資料版權屬中央氣象署所有。
