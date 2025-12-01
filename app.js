// ====== 基本設定 ======
const API_KEY = "CWA-7D5694B3-17E1-4698-AC66-050F8DABC152"; // <- 這裡放你的 key
const API_URL = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0021-001?Authorization=${API_KEY}`;

const infoDiv = document.getElementById('info');
const statusDiv = document.getElementById('status');
const refreshBtn = document.getElementById('refreshBtn');
const ctx = document.getElementById('tideChart').getContext('2d');

let tideChart = null;
let xLabels = [];     // X 軸：一天中的第幾分鐘 (0~1440)
let tideHeights = []; // Y 軸：潮高 (m)
let lastUpdateTime = null;

// Chart.js 插件：畫現在時間的垂直線
const nowLinePlugin = {
  id: 'nowLine',
  afterDraw(chart, args, options) {
    const xPosition = options.xPosition;
    if (xPosition == null) return;

    const { ctx, chartArea: { top, bottom } } = chart;
    const xScale = chart.scales.x;
    const x = xScale.getPixelForValue(xPosition);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'red';
    ctx.stroke();
    ctx.restore();
  }
};

Chart.register(nowLinePlugin);

// ====== 抓潮汐資料（對應 CWA F-A0021-001 結構） ======
async function fetchTideData() {
  statusDiv.textContent = "正在更新潮汐資料...";
  try {
    const res = await fetch(API_URL);
    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }
    const data = await res.json();

    // 安全檢查
    if (!data.records || !data.records.tideForecasts || !data.records.tideForecasts.length) {
      throw new Error("資料格式異常：沒有 tideForecasts");
    }

    // 目前簡化：取第一個地點、第一天
    const loc = data.records.tideForecasts[0];
    const locationName = loc.LocationName;
    const timePeriods = loc.TimePeriods || [];

    if (!timePeriods.length) {
      throw new Error("資料格式異常：沒有 TimePeriods");
    }

    const day = timePeriods[0]; // 你之後可以改成依照今天日期去挑
    const dateStr = day.Daily;  // e.g. "2025-12-07"
    const tideRange = day.TideRange; // 大 / 中 / 小
    const times = day.Time || [];

    if (!times.length) {
      throw new Error("資料格式異常：沒有 Time 陣列");
    }

    xLabels = [];
    tideHeights = [];

    // 把一天內所有滿/乾潮時間轉成 (分鐘, 潮高)
    times.forEach(t => {
      // DateTime 例如 "2025-12-07T03:58:00+08:00"
      const dt = new Date(t.DateTime);
      const hh = dt.getHours();
      const mm = dt.getMinutes();
      const minutes = hh * 60 + mm;

      // 潮高：用 AboveLocalMSL，單位是公分 => 轉公尺
      const heights = t.TideHeights || {};
      const aboveLocal = parseFloat(heights.AboveLocalMSL);
      const heightM = isNaN(aboveLocal) ? null : aboveLocal / 100.0;

      if (heightM != null) {
        xLabels.push(minutes);
        tideHeights.push(heightM);
      }
    });

    if (!xLabels.length) {
      throw new Error("Time 裡沒有可用的潮高資料");
    }

    // 依時間排序
    const combined = xLabels.map((m, i) => ({ m, h: tideHeights[i] }))
                            .sort((a, b) => a.m - b.m);
    xLabels = combined.map(o => o.m);
    tideHeights = combined.map(o => o.h);

    infoDiv.textContent = `測站：${locationName}　日期：${dateStr}　潮別：${tideRange}`;
    lastUpdateTime = new Date();
    statusDiv.textContent = `資料更新時間：${formatDateTime(lastUpdateTime)}`;

    drawChart();
    updateNowLine(true);

    // 存快取
    localStorage.setItem('tideData', JSON.stringify({
      xLabels,
      tideHeights,
      infoText: infoDiv.textContent,
      lastUpdateTime: lastUpdateTime.toISOString()
    }));

  } catch (e) {
    console.error("fetchTideData error:", e);
    statusDiv.textContent = "潮汐資料更新失敗，改用上次快取（若有）。";

    const cache = localStorage.getItem('tideData');
    if (cache) {
      const obj = JSON.parse(cache);
      xLabels = obj.xLabels || [];
      tideHeights = obj.tideHeights || [];
      infoDiv.textContent = obj.infoText || "離線模式（使用上次資料）";
      lastUpdateTime = obj.lastUpdateTime ? new Date(obj.lastUpdateTime) : null;

      if (xLabels.length) {
        drawChart();
        updateNowLine(true);
      }

      if (lastUpdateTime) {
        statusDiv.textContent += `　上次更新：${formatDateTime(lastUpdateTime)}`;
      }
    } else {
      infoDiv.textContent = "目前無法取得資料，且沒有快取可用。";
    }
  }
}

// ====== 畫 Chart.js ======
function drawChart() {
  if (!xLabels.length) {
    statusDiv.textContent = "沒有可以畫圖的潮汐資料。";
    return;
  }

  if (tideChart) {
    tideChart.destroy();
  }

  tideChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: xLabels,
      datasets: [{
        label: '潮高 (m)',
        data: tideHeights,
        tension: 0.3,
        fill: true,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: '時間' },
          ticks: {
            callback: value => {
              const h = Math.floor(value / 60);
              const m = value % 60;
              return `${pad2(h)}:${pad2(m)}`;
            }
          },
          min: 0,
          max: 24 * 60
        },
        y: {
          title: { display: true, text: '潮高 (m)' }
        }
      },
      plugins: {
        legend: { display: false },
        nowLine: {
          xPosition: null
        }
      }
    }
  });
}

// ====== 更新「現在時間線」 ======
function updateNowLine(showTimeText = false) {
  if (!tideChart) return;

  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const totalMinutes = h * 60 + m;

  tideChart.options.plugins.nowLine.xPosition = totalMinutes;
  tideChart.update('none');

  if (showTimeText) {
    statusDiv.textContent =
      (lastUpdateTime ? `資料更新時間：${formatDateTime(lastUpdateTime)}` : "") +
      `　|　現在時間：${pad2(h)}:${pad2(m)}`;
  }
}

// 每分鐘更新一次現在時間線
setInterval(() => updateNowLine(true), 60 * 1000);

// 小工具
function pad2(n) {
  return String(n).padStart(2, '0');
}
function formatDateTime(d) {
  const yyyy = d.getFullYear();
  const MM = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}`;
}

// 初始化
window.addEventListener('load', () => {
  fetchTideData();
});

// 手動重新整理按鈕
refreshBtn.addEventListener('click', () => {
  fetchTideData();
});
