/**
 * 潮汐監控 PWA — Google Apps Script Proxy
 *
 * 此檔案為備份，實際執行的程式碼位於獨立的 GAS 專案。
 * 修改後需回到 script.google.com 同步貼上並重新部署。
 *
 * 用途：代為呼叫中央氣象署開放資料 API（資料集 F-A0021-001 潮汐預報），
 *      避免 API 金鑰暴露於前端，同時解決瀏覽器直連的 CORS 限制。
 *
 * 設定：專案設定 → 指令碼屬性 → 新增 CWA_API_KEY = <氣象署會員授權碼>
 *      切勿將金鑰寫死在此檔案中。
 *
 * 部署：部署 → 新增部署作業 → 網頁應用程式
 *      執行身分：我　｜　誰可以存取：所有人
 */

function doGet(e) {
  // 1. 從腳本屬性中讀取 API Key (等下會設定)
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
