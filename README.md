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
└── gas/
    └── Code.gs        # GAS proxy 程式碼備份（非執行版本）
```

無建置流程、無 npm 依賴。Chart.js 由 CDN 載入（jsDelivr）。

## 資料來源與架構

```
瀏覽器 (GitHub Pages)  →  Google Apps Script (GAS)  →  中央氣象署開放資料 API
                            ↑ 存放 API 金鑰、處理 CORS
```

前端**不持有任何 API 金鑰**。GAS 部署為 Web App，作為 proxy 代為呼叫氣象署 API 並回傳 JSON，同時解決瀏覽器直連的 CORS 限制。

使用的資料集為氣象署 **F-A0021-001**（潮汐預報）。

API 端點寫在 `app.js:7`：

```js
const API_URL = "https://script.google.com/macros/s/AKfycb.../exec";
```

### GAS Proxy 設定

GAS 專案獨立於此 repo，程式碼備份於 [`gas/Code.gs`](gas/Code.gs)（**備份用，不會被執行** — 修改後需回到 script.google.com 貼上並重新部署）：

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

建置步驟：

1. 於 [script.google.com](https://script.google.com) 建立新專案，貼上上述程式碼
2. **專案設定 → 指令碼屬性 → 新增屬性**
   - 屬性名稱：`CWA_API_KEY`
   - 值：你的氣象署會員授權碼（格式 `CWA-XXXXXXXX-...`，於 [氣象署開放資料平臺](https://opendata.cwa.gov.tw/) 申請）
3. **部署 → 新增部署作業 → 類型選「網頁應用程式」**
   - 執行身分：我
   - 誰可以存取：**所有人**（前端為匿名呼叫，必須設為所有人）
4. 複製產生的 `/exec` 網址，填入 `app.js` 的 `API_URL`

> 🔑 金鑰只存在 GAS 指令碼屬性中，不寫入程式碼、不進版控。若金鑰外洩，至氣象署平臺重新產生後更新指令碼屬性即可，前端無需改動。

### 回應格式

GAS 需回傳氣象署原始結構，`app.js` 依此路徑解析：

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

潮高取用優先序為 `AboveLocalMSL` → `AboveTWD` → `AboveTWVD` → `AboveTWDV` → `AboveChartDatum`，顯示時除以 100 換算為公尺。

### 更新 GAS 端點

GAS 每次「部署新版本」都會產生新的 `/exec` 網址（除非選擇更新現有部署）。網址變更時：

1. 修改 `app.js` 的 `API_URL`
2. **同時提高 `service-worker.js` 的 `CACHE_NAME` 版本號**（見下方注意事項）
3. commit 並 push

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
const CACHE_NAME = 'tide-pwa-v12';   // ← 每次改 app.js / index.html 都要 +1
```

版本號變更會觸發 `activate` 事件清除所有舊快取。若忘記更新，已安裝 PWA 的裝置可能持續使用舊資源。

### 快取策略

| 資源 | 策略 | 說明 |
|------|------|------|
| `index.html`、`app.js`、頁面導航 | network-first | 優先取得最新程式碼，失敗才回退快取 |
| 其餘同源靜態資源（圖示、manifest） | cache-first | 圖示等不常變動 |
| 外部 API（GAS） | network-first | 離線時回退至上次成功的回應 |

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
| 增減顯示的測站 | `app.js:10` `ALLOWED_STATION_KEYWORDS`（陣列順序即選單順序） |
| 波線／時間線顏色 | `app.js:2-4` |
| 一天顯示的寬度 | `app.js:282` `widthPerDay` |
| Y 軸預設範圍 | `app.js:382-383` `suggestedMin` / `suggestedMax` |
| 字級（為戶外閱讀放大） | `index.html` `<style>` 區塊 |

除錯時建議在 DevTools → Application → Service Workers 勾選 **Update on reload**，避免被快取誤導。

## 疑難排解

**畫面顯示「潮汐資料更新失敗，請稍後再試」**

GAS 使用 `muteHttpExceptions: true`，氣象署回傳的錯誤（金鑰失效、超出流量、資料集維護中）會以 HTTP 200 原樣轉傳，前端解析不到 `records.TideForecasts` 就丟出「TideForecasts 為空」。**直接在瀏覽器開啟 `API_URL`** 即可看到真正的錯誤訊息：

| 實際回應 | 原因 |
|----------|------|
| `{"success":"false"}` 或授權錯誤訊息 | 指令碼屬性 `CWA_API_KEY` 未設定或已失效 |
| `{"error":"..."}` | GAS 端 `UrlFetchApp` 拋錯（多為網路或配額問題） |
| Google 登入頁面 | 部署權限不是「所有人」 |
| 正常 JSON 但 `TideForecasts` 為空 | 氣象署資料集暫時無資料 |

**改了程式碼但手機上沒更新** — `CACHE_NAME` 忘了加版號。改完 push，再從裝置移除 PWA 重新加入主畫面。

**測站選單是空的** — 氣象署的 `LocationName` 用字若有異動（例如「台」與「臺」），`ALLOWED_STATION_KEYWORDS` 的 `includes` 比對會失敗。可先在 Console 印出 `data.records.TideForecasts.map(f => f.Location.LocationName)` 核對。

## 授權

個人專案。潮汐資料版權屬中央氣象署所有。
