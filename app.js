// ====== 基本設定 ======
const API_KEY = "CWA-7D5694B3-17E1-4698-AC66-050F8DABC152"; // ← 換成你的中央氣象署 API key
const API_URL = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0021-001?Authorization=${API_KEY}`;

const infoDiv = document.getElementById('info');
const statusDiv = document.getElementById('status');
const stationSelect = document.getElementById('stationSelect');
const refreshBtn = document.getElementById('refreshBtn');
const ctx = document.getElementById('tideChart').getContext('2d');

let tideChart = null;
let locationsData = [];   // [{ id, name, events: [{dateTime, tide, height}, ...] }]
let currentLocationId = null;
let lastUpdateTime = null;

// ====== 工具：補 2 位數 ======
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

// ====== Chart.js 插件：畫現在時間垂直線 ======
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

// ====== 解析單一站點底下所有潮汐事件（不管結構有多少層，只要有 DateTime + TideHeights 就撈） ======
function collectTideEvents(root) {
  const result = [];

  function visit(node) {
    if (!node || typeof node !== 'object') return;

    // 判斷是不是一筆潮汐事件
    if (node.DateTime && node.TideHeights) {
      const h =
        node.TideHeights.AboveLocalMSL ??
        node.TideHeights.AboveTWD ??
        node.TideHeights.AboveTWVD ??
        node.TideHeights.AboveTWDV;

      if (h !== undefined) {
        result.push({
          dateTime: node.DateTime,      // e.g. "2025-12-07T01:35:00+08:00"
          tide: node.Tide || "",
          height: Number(h)
        });
      }
    }

    // 繼續往下走
    for (const key in node) {
      const val = node[key];
      if (Array.isArray(val)) {
        val.forEach(visit);
      } else if (typeof val === 'object') {
        visit(val);
      }
    }
  }

  visit(root);

  // 依時間排序
  result.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  return result;
}

// ====== 從 API 抓資料 ======
async function fetchTideData() {
  statusDiv.textContent = "正在更新潮汐資料...";
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    const forecasts = (data.records && data.records.TideForecasts) || [];
    if (!forecasts.length) {
      throw new Error("TideForecasts 為空");
    }

    locationsData = forecasts.map(f => {
      const loc = f.Location || {};
      return {
        id: loc.LocationId || loc.LocationName,
        name: loc.LocationName || loc.LocationId,
        events: collectTideEvents(f)
      };
    }).filter(l => l.events.length > 0);

    if (!locationsData.length) {
      throw new Error("沒有解析到任何潮汐事件");
    }

    // 更新選單
    updateStationSelect();

    lastUpdateTime = new Date();
    statusDiv.textContent = `資料更新時間：${formatDateTime(lastUpdateTime)}`;

    // 畫目前選中的站點
    drawCurrentLocation();

  } catch (e) {
    console.error(e);
    infoDiv.textContent = "目前無法取得資料，且沒有快取可用。";
    statusDiv.textContent = "潮汐資料更新失敗，請稍後再試。";
  }
}

// ====== 更新測站選單 ======
function updateStationSelect() {
  stationSelect.innerHTML = "";

  locationsData.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = loc.name;
    stationSelect.appendChild(opt);
  });

  if (!currentLocationId && locationsData.length) {
    currentLocationId = locationsData[0].id;
  }
  if (currentLocationId) {
    stationSelect.value = currentLocationId;
  }
}

// ====== 取得「今天」這個測站的事件（沒有就全部） ======
function getTodayEvents(events) {
  if (!events || !events.length) return [];

  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const todays = events.filter(e => e.dateTime.startsWith(todayStr));
  return todays.length ? todays : events;
}

// ====== 畫目前選取站點的波型圖 ======
function drawCurrentLocation() {
  if (!locationsData.length) return;

  const loc = locationsData.find(l => l.id === currentLocationId) || locationsData[0];
  currentLocationId = loc.id;

  const events = getTodayEvents(loc.events);
  if (!events.length) {
    infoDiv.textContent = `測站：${loc.name}（沒有可用的潮汐資料）`;
    if (tideChart) tideChart.destroy();
    return;
  }

  infoDiv.textContent = `測站：${loc.name}　（顯示 ${events[0].dateTime.slice(0, 10)} 的預報）`;

  // 轉成 x 軸（分鐘）與 y 軸（潮高）
  const xLabels = [];
  const heights = [];

  events.forEach(e => {
    const dt = new Date(e.dateTime);
    const h = dt.getHours();
    const m = dt.getMinutes();
    const minutes = h * 60 + m;

    xLabels.push(minutes);
    heights.push(e.height);
  });

  if (tideChart) {
    tideChart.destroy();
  }

  tideChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: xLabels,
      datasets: [{
        label: '潮高 (cm)',
        data: heights,
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
              return `${pad2(h)}:${pad2(m)}`;
            }
          },
          min: 0,
          max: 24 * 60
        },
        y: {
          title: {
            display: true,
            text: '潮高 (cm)'
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

  // 初次更新「現在時間線」
  updateNowLine(true);
}

// ====== 更新「現在時間線」 ======
function updateNowLine(updateText = false) {
  if (!tideChart) return;

  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const totalMinutes = h * 60 + m;

  tideChart.options.plugins.nowLine.xPosition = totalMinutes;
  tideChart.update('none');

  if (updateText) {
    const nowStr = `${pad2(h)}:${pad2(m)}`;
    const updatePart = lastUpdateTime ? `資料更新時間：${formatDateTime(lastUpdateTime)}　|　` : "";
    statusDiv.textContent = `${updatePart}現在時間：${nowStr}`;
  }
}

// ====== 事件綁定 ======
stationSelect.addEventListener('change', () => {
  currentLocationId = stationSelect.value;
  drawCurrentLocation();
});

refreshBtn.addEventListener('click', () => {
  fetchTideData();
});

// 每分鐘更新一次現在時間線
setInterval(() => updateNowLine(true), 60 * 1000);

// ====== 初始化 ======
window.addEventListener('load', () => {
  fetchTideData();
});
