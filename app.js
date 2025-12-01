// ====== 基本設定 ======
const API_KEY = "CWA-7D5694B3-17E1-4698-AC66-050F8DABC152"; // <- 這裡放你的 key
const API_URL = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0021-001?Authorization=${API_KEY}`;
const infoDiv = document.getElementById("info");
const statusDiv = document.getElementById("status");
const ctx = document.getElementById("tideChart").getContext("2d");

let tideChart = null;

// Chart.js 插件：畫現在時間線
const nowLinePlugin = {
  id: "nowLine",
  afterDraw(chart, args, options) {
    if (options.xPosition == null) return;

    const { ctx, chartArea: { top, bottom } } = chart;
    const xScale = chart.scales.x;
    const x = xScale.getPixelForValue(options.xPosition);

    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    ctx.restore();
  }
};
Chart.register(nowLinePlugin);

let xMinutes = [];  // X 軸：一天中的分鐘數
let tideHeights = []; // Y 軸：潮高 AboveLocalMSL
let lastUpdateTime = null;

// ====== 初始化 ======
window.addEventListener("load", () => {
  fetchTide();
  setInterval(updateNowLine, 60000); // 每 1 分鐘更新一次現在時間線
});

// ====== 抓資料 ======
async function fetchTide() {
  statusDiv.textContent = "正在更新資料...";

  try {
    const res = await fetch(API_URL);
    const json = await res.json();

    const locations = json.records.location;
    const loc = locations[0]; // 取第一個測站
    const dayData = loc.time;

    xMinutes = [];
    tideHeights = [];

    dayData.forEach(entry => {
      const dt = new Date(entry.DateTime);
      const minutes = dt.getHours() * 60 + dt.getMinutes();

      xMinutes.push(minutes);

      const height = parseFloat(entry.TideHeights.AboveLocalMSL);
      tideHeights.push(height);
    });

    infoDiv.textContent = `測站：${loc.LocationName}`;
    lastUpdateTime = new Date();
    statusDiv.textContent = `更新時間：${lastUpdateTime.toLocaleString()}`;

    drawChart();
    updateNowLine();

  } catch (err) {
    console.error(err);
    statusDiv.textContent = "資料讀取失敗：沒有資料或 API key 錯誤";
  }
}

// ====== 畫圖 ======
function drawChart() {
  if (tideChart) tideChart.destroy();

  tideChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: xMinutes,
      datasets: [
        {
          label: "潮位高度（cm）",
          data: tideHeights,
          borderColor: "#035efc",
          backgroundColor: "rgba(3,94,252,0.1)",
          tension: 0.3,
          pointRadius: 4
        }
      ]
    },
    options: {
      scales: {
        x: {
          type: "linear",
          min: 0,
          max: 1440,
          ticks: {
            callback: v => {
              const h = String(Math.floor(v / 60)).padStart(2, "0");
              const m = String(v % 60).padStart(2, "0");
              return `${h}:${m}`;
            }
          }
        },
        y: {
          title: {
            display: true,
            text: "AboveLocalMSL (cm)"
          }
        }
      },
      plugins: {
        nowLine: { xPosition: null },
        legend: { display: false }
      },
      maintainAspectRatio: false
    }
  });
}

// ====== 更新現在時間線 ======
function updateNowLine() {
  if (!tideChart) return;

  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();

  tideChart.options.plugins.nowLine.xPosition = minutes;
  tideChart.update("none");

  statusDiv.textContent = `更新時間：${lastUpdateTime?.toLocaleString() ?? ""} | 現在時間：${now.toLocaleTimeString()}`;
}
🎉 你現在得到的成果