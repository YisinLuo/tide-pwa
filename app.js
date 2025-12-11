// ====== 顏色設定（接近你照片的顏色） ======
const BLUE_COLOR = '#0066ff';   // 上升波線
const GREEN_COLOR = '#008000';  // 下降波線
const ORANGE_COLOR = '#ff8800'; // 現在時間線

// ====== API 設定 ======
const API_URL = "https://tide-proxy-production.up.railway.app/api/tide";

// 只顯示這些測站
const ALLOWED_STATION_KEYWORDS = [
  "基隆市中正區",
  "新北市貢寮區",
  "新北市金山區",
  "新北市淡水區",
  "桃園市新屋區",
  "新竹縣竹北市",
  "苗栗縣苑裡鎮",
  "臺中市清水區",
  "彰化縣鹿港鎮",
  "雲林縣四湖鄉",
  "嘉義縣東石鄉",
  "臺南市七股區",
  "臺南市安平區",
  "高雄市林園區",
  "屏東縣東港鎮",
  "屏東縣枋山鄉",
  "屏東縣恆春鎮",
  "臺東縣大武鄉",
  "臺東縣卑南鄉",
  "花蓮市吉安鄉",
  "宜蘭縣頭城鎮"
];

const infoDiv = document.getElementById('info');
const statusDiv = document.getElementById('status');
const stationSelect = document.getElementById('stationSelect');
const refreshBtn = document.getElementById('refreshBtn');
const ctx = document.getElementById('tideChart').getContext('2d');
const chartContainer = document.getElementById('chartContainer'); // 用來調整寬度

let tideChart = null;
let locationsData = [];
let currentLocationId = null;
let lastUpdateTime = null;

// ====== 工具函式 ======
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

function formatDateOnly(d) {
  const yyyy = d.getFullYear();
  const MM = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${MM}-${dd}`;
}

function isHighTide(e) {
  if (!e.tide) return false;
  return e.tide.includes("滿潮") || e.tide.includes("高潮");
}

function isLowTide(e) {
  if (!e.tide) return false;
  return e.tide.includes("乾潮") || e.tide.includes("低潮");
}

// ====== 現在時間橘線插件 ======
const nowLinePlugin = {
  id: 'nowLine',
  afterDraw(chart, args, options) {
    const xVal = options.xPosition;
    if (xVal == null) return;

    const { ctx, chartArea: { top, bottom } } = chart;
    const xScale = chart.scales.x;
    const x = xScale.getPixelForValue(xVal);

    // 如果現在時間不在顯示範圍內，就不畫
    if (x < chart.chartArea.left || x > chart.chartArea.right) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ORANGE_COLOR;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.restore();
  }
};

// ====== 滿潮 / 乾潮文字標註插件 ======
const tideLabelPlugin = {
  id: 'tideLabel',
  afterDatasetsDraw(chart, args, options) {
    const labels = (options && options.labels) || [];
    if (!labels.length) return;

    const { ctx } = chart;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

    labels.forEach(l => {
      const x = xScale.getPixelForValue(l.x);
      const y = yScale.getPixelForValue(l.y);
      const lines = l.text.split('\n');
      const lineHeight = 14;
      let baseY = y - 6;

      // 往上疊文字
      for (let i = lines.length - 1; i >= 0; i--) {
        ctx.fillText(lines[i], x, baseY);
        baseY -= lineHeight;
      }
    });

    ctx.restore();
  }
};

Chart.register(nowLinePlugin, tideLabelPlugin);

// ====== 解析一個測站的所有潮汐事件（整個月） ======
function collectTideEvents(root) {
  const result = [];

  function visit(node) {
    if (!node || typeof node !== 'object') return;

    if (node.DateTime && node.TideHeights) {
      const h =
        node.TideHeights.AboveLocalMSL ??
        node.TideHeights.AboveTWD ??
        node.TideHeights.AboveTWVD ??
        node.TideHeights.AboveTWDV;

      if (h !== undefined) {
        result.push({
          dateTime: node.DateTime,
          tide: node.Tide || "",
          height: Number(h)
        });
      }
    }

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
  result.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  return result;
}

// ====== 抓資料 ======
async function fetchTideData() {
  statusDiv.textContent = "正在更新潮汐資料...";
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    const forecasts = (data.records && data.records.TideForecasts) || [];
    if (!forecasts.length) throw new Error("TideForecasts 為空");

    locationsData = forecasts.map(f => {
      const loc = f.Location || {};
      const name = loc.LocationName || loc.LocationId || "";
      return {
        id: loc.LocationId || loc.LocationName,
        name,
        events: collectTideEvents(f)
      };
    })
      .filter(l => l.events.length > 0)
      .filter(l => ALLOWED_STATION_KEYWORDS.some(k => l.name.includes(k)));

    if (!locationsData.length) {
      throw new Error("沒有解析到任何指定測站的潮汐事件");
    }

    // 依你指定的順序排序
    const orderOf = (name) => {
      const idx = ALLOWED_STATION_KEYWORDS.findIndex(k => name.includes(k));
      return idx === -1 ? 999 : idx;
    };
    locationsData.sort((a, b) => orderOf(a.name) - orderOf(b.name));

    updateStationSelect();

    lastUpdateTime = new Date();
    statusDiv.textContent = `資料更新時間：${formatDateTime(lastUpdateTime)}`;

    drawCurrentLocation();

  } catch (err) {
    console.error(err);
    infoDiv.textContent = "目前無法取得資料。";
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

// ====== 畫出整個月的波形，並依天數調整寬度 ======
function drawCurrentLocation() {
  if (!locationsData.length) return;

  const loc = locationsData.find(l => l.id === currentLocationId) || locationsData[0];
  currentLocationId = loc.id;
  const events = loc.events;

  if (!events.length) {
    infoDiv.textContent = `測站：${loc.name}（沒有可用的潮汐資料）`;
    if (tideChart) tideChart.destroy();
    return;
  }

  // 取得整個資料範圍（大多為一個月）
  const firstDate = new Date(events[0].dateTime);
  const lastDate = new Date(events[events.length - 1].dateTime);

  infoDiv.textContent = `測站：${loc.name}　（顯示 ${formatDateOnly(firstDate)} ～ ${formatDateOnly(lastDate)} 的預報）`;

  // 依天數動態調整 chartContainer 的寬度，讓畫面大約只看到一天
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.max(1, Math.round((lastDate - firstDate) / dayMs) + 1);
  const widthPerDay = 600; // 一天的寬度（px）
  chartContainer.style.minWidth = (days * widthPerDay) + 'px';

  const dataPoints = [];
  const tideLabels = [];
  const timeStamps = [];
  const pointRadius = [];           // ⭐ 新增：每個點的半徑
  const pointBackgroundColor = [];  // ⭐ 新增：每個點的顏色

  events.forEach(e => {
    const dt = new Date(e.dateTime);
    const t = dt.getTime();
    const heightM = e.height / 100.0;
    const timeStr = `${pad2(dt.getMonth() + 1)}/${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

    timeStamps.push(t);
    dataPoints.push({ x: t, y: heightM });

    const high = isHighTide(e);
    const low = isLowTide(e);

    if (high || low) {
      // ⭐ 滿潮 / 乾潮顯示小圓點
      pointRadius.push(4);
      pointBackgroundColor.push(high ? BLUE_COLOR : GREEN_COLOR);

      const line1 = `${heightM.toFixed(2)}m`;
      const line2 = `${timeStr} ${e.tide}`;
      tideLabels.push({
        x: t,
        y: heightM,
        text: `${line1}\n${line2}`
      });
    } else {
      // 其他時間點不顯示點
      pointRadius.push(0);
      pointBackgroundColor.push('rgba(0,0,0,0)');
    }
  });

  // X 軸範圍（左右多留半天）
  const minT = Math.min(...timeStamps);
  const maxT = Math.max(...timeStamps);
  const marginMs = 12 * 60 * 60 * 1000;
  const xMin = minT - marginMs;
  const xMax = maxT + marginMs;

  if (tideChart) {
    tideChart.destroy();
  }

  tideChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: '潮高 (m)',
        data: dataPoints,             // {x, y}
        tension: 0.4,
        fill: false,                  // 不填滿，只畫線
        borderWidth: 2,
        pointRadius: pointRadius,              // ⭐ 使用我們算好的半徑陣列
        pointBackgroundColor: pointBackgroundColor, // ⭐ 對應顏色
        pointHitRadius: 6,
        segment: {
          borderColor: ctx => {
            const p0 = ctx.p0.parsed;
            const p1 = ctx.p1.parsed;
            if (!p0 || !p1) return BLUE_COLOR;
            return (p1.y >= p0.y) ? BLUE_COLOR : GREEN_COLOR;
          }
        }
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false, // 告訴 Chart.js 我們已經用 {x,y}
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: '日期 / 時間'
          },
          ticks: {
            callback: value => {
              const d = new Date(value);
              return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
            }
          },
          min: xMin,
          max: xMax,
          grid: {
            color: 'rgba(0,0,0,0.1)'
          }
        },
        y: {
          title: {
            display: true,
            text: '潮高 (m)'
          },
          ticks: {
            callback: v => v.toFixed(2)
          },
          suggestedMin: -2.5,
          suggestedMax: 2.0,
          grid: {
            color: ctx => {
              if (ctx.tick.value === 0) return 'rgba(0,0,0,0.5)'; // 0m 軸深色
              return 'rgba(0,0,0,0.08)';
            },
            lineWidth: ctx => (ctx.tick.value === 0 ? 1.5 : 0.5)
          }
        }
      },
      plugins: {
        legend: { display: false },
        nowLine: {
          xPosition: null
        },
        tideLabel: {
          labels: tideLabels
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = new Date(ctx.parsed.x);
              const tStr = `${formatDateOnly(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
              return `${tStr}： ${ctx.parsed.y.toFixed(2)} m`;
            }
          }
        }
      }
    }
  });

  updateNowLine(true);
}

// ====== 更新現在時間線（以毫秒為單位） ======
function updateNowLine(updateText = false) {
  if (!tideChart) return;

  const now = new Date();
  const nowMs = now.getTime();

  tideChart.options.plugins.nowLine.xPosition = nowMs;
  tideChart.update('none');

  if (updateText) {
    const nowStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
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