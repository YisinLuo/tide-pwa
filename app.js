// ====== 基本設定 ======
const API_KEY = "CWA-7D5694B3-17E1-4698-AC66-050F8DABC152"; // ← 換成你的中央氣象署 API 金鑰
const API_URL = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0021-001?Authorization=${API_KEY}`;

const infoDiv = document.getElementById('info');
const statusDiv = document.getElementById('status');
const refreshBtn = document.getElementById('refreshBtn');
const ctx = document.getElementById('tideChart').getContext('2d');

let tideChart = null;
let xLabels = [];     // X 軸：一天中的第幾分鐘 (0~1440)
let tideHeights = []; // Y 軸：潮高
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

// ====== 抓潮汐資料 ======
async function fetchTideData() {
  statusDiv.textContent = "正在更新潮汐資料...";
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    // 這邊先示範：取第一個測站 / 第一天
    const locations = data.records.location;
    const loc = locations[0];       // 你可以改成自己指定測站
    const day = loc.time[0];        // 或是根據今天日期去 match

    xLabels = [];
    tideHeights = [];

    day.tideData.forEach(td => {
      // 假設格式為 "HH:MM"
      const [hh, mm] = td.tideTime.split(':').map(Number);
      const minutes = hh * 60 + mm;
      xLabels.push(minutes);
      tideHeights.push(parseFloat(td.tideHeight));
    });

    // 依時間排序
    const combined = xLabels.map((m, i) => ({ m, h: tideHeights[i] }))
                            .sort((a, b) => a.m - b.m);
    xLabels = combined.map(o => o.m);
    tideHeights = combined.map(o => o.h);

    infoDiv.textContent = `測站：${loc.locationName}　日期：${day.dataTime}`;
    lastUpdateTime = new Date();
    statusDiv.textContent = `資料更新時間：${formatDateTime(lastUpdateTime)}`;

    // 畫圖
    drawChart();
    // 初次更新現在時間線
    updateNowLine(true);

    // 存成 localStorage（離線備援）
    localStorage.setItem('tideData', JSON.stringify({
      xLabels,
      tideHeights,
      infoText: infoDiv.textContent,
      lastUpdateTime: lastUpdateTime.toISOString()
    }));

  } catch (e) {
    console.error(e);
    statusDiv.textContent = "潮汐資料更新失敗，改用上次快取（若有）。";

    // 若有快取就讀快取
    const cache = localStorage.getItem('tideData');
    if (cache) {
      const obj = JSON.parse(cache);
      xLabels = obj.xLabels || [];
      tideHeights = obj.tideHeights || [];
      infoDiv.textContent = obj.infoText || "離線模式（使用上次資料）";
      lastUpdateTime = obj.lastUpdateTime ? new Date(obj.lastUpdateTime) : null;

      drawChart();
      updateNowLine(true);

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
      labels: xLabels,  // 這是 linear scale 的 value
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
          title: {
            display: true,
            text: '時間'
          },
          ticks: {
            callback: value => {
              const h = Math.floor(value / 60);
              const m = value % 60;
              return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }
          },
          min: 0,
          max: 24 * 60
        },
        y: {
          title: {
            display: true,
            text: '潮高 (m)'
          }
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
    statusDiv.textContent = (lastUpdateTime
      ? `資料更新時間：${formatDateTime(lastUpdateTime)}`
      : "") + `　|　現在時間：${pad2(h)}:${pad2(m)}`;
  }
}

// 每分鐘更新一次現在時間線
setInterval(() => updateNowLine(true), 60 * 1000);

// 工具函數
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
