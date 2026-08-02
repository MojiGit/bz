// ==================================================================================== //

// Chart.js instance for rendering the PNL chart
let chartInstance = null;

Chart.defaults.font.family = "'Public Sans', sans-serif";
Chart.defaults.color = '#191308';

// Sign-based colors for the combined "PnL" line: brand green above y=0 (profit); the palette
// has no red, so loss uses a neutral near-black treatment (a desaturated shade, not a new
// hue) per design-system.md's negative-value decision (option B) instead of a borrowed red.
const PNL_PROFIT_LINE = '#00E083';
const PNL_LOSS_LINE = '#191308';
const PNL_PROFIT_FILL = 'rgba(0, 224, 131, 0.14)';
const PNL_LOSS_FILL = 'rgba(25, 19, 8, 0.10)';
import * as Strategies from './strategies.js';
import * as mvp from './mvp.js';
import * as builder from './builder.js';

export function renderPNLChart(datasets, strikePrices = []) {
  if (!Array.isArray(datasets) || datasets.length === 0) {
    console.warn("Empty or invalid datasets.");
    return;
  }

  const ctx = document.getElementById('pnlChart')?.getContext('2d');
  if (!ctx) {
    console.error("Chart canvas not found.");
    return;
  }

  // create datasets for Chart.js
  const allDatasets = datasets.map(ds => {
    const dataset = {
      label: ds.label || '',
      data: ds.data?.map(point => ({ x: point.price, y: point.pnl })) || [],
      borderColor: ds.color,
      backgroundColor: ds.bgColor || 'rgba(255, 255, 255, 0)',
      borderWidth: 2,
      pointRadius: 0,
      fill: true,
      type: 'line',
      borderDash: ds.borderDash || [],
      tension: 0,
    };

    // Only the combined PnL curve is colored by sign, split at y=0. Individual leg
    // datasets keep their own (dashed) styling untouched.
    if (ds.label === 'PnL') {
      dataset.segment = {
        borderColor: ctx =>
          (ctx.p0.parsed.y + ctx.p1.parsed.y) / 2 >= 0 ? PNL_PROFIT_LINE : PNL_LOSS_LINE,
        backgroundColor: ctx =>
          (ctx.p0.parsed.y + ctx.p1.parsed.y) / 2 >= 0 ? PNL_PROFIT_FILL : PNL_LOSS_FILL,
      };
    }

    return dataset;
  });

  // Prepare annotations for strike prices
  const annotations = {};
  if (strikePrices.length > 0) {
      (strikePrices || []).forEach((price, index) => {
      // Secondary reference marks: thin, low-opacity gray, no label (strike is in the legend).
      annotations[`strikeLine${index}`] = {
        type: 'line',
        xMin: price,
        xMax: price,
        borderColor: 'rgba(216, 221, 239, 0.9)',
        borderWidth: 1,
        borderDash: [2, 2],
        label: {
          display: false,
        },
        z: 0
      };
    }); 
  }
  

  // Add current price line if available
  if (typeof mvp.currentPrice === 'number' && !isNaN(mvp.currentPrice)) {
    annotations.currentPriceLine = {
      type: 'line',
      xMin: Math.round(mvp.currentPrice),
      xMax: Math.round(mvp.currentPrice),
      borderColor: '#191308',
      borderWidth: 2,
      borderDash: [5,5],
      label: {
        enabled: true, // annotation plugin v1.4.0 uses `enabled`, not `display`
        content: 'SPOT',
        position: 'end', // v1.4.0: 'end' anchors a vertical line's label at the bottom
        yAdjust: -24, // lift off the x-axis tick row into clear lower-plot space (below most payoff curves)
        color: '#ffffff',
        backgroundColor: '#191308', // solid near-black pill: legible over the PnL curve at any spot
        font: { size: 12, weight: 'bold' }
      },
      z: 1
    };
  }

  annotations.breakEvenLine = {
    type: 'line',
    yMin: 0,
    yMax: 0,
    borderColor: '#191308',
    borderWidth: 1,
    label: {
      display: true,
      content: 'Break-even',
      position: 'start',
      color: '#191308',
      backgroundColor: 'transparent',
      font: {
        size: 10,
        weight: 'bold',
      }
    },
    z: 1
  };

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: allDatasets,
    },
    options: {
      parsing: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          grid: { color: 'rgba(216, 221, 239, 0.5)' },
          title: {
            display: true,
            text: `${mvp.selectedTokenSymbol} Price`,
          },
          ...(typeof mvp.currentPrice === 'number' && !isNaN(mvp.currentPrice) ? {
            min: mvp.currentPrice * 0.8,
            max: mvp.currentPrice * 1.2,
          } : {}),
        },
        y: {
          grid: { color: 'rgba(216, 221, 239, 0.5)' },
          title: {
            display: false,
            text: 'PnL',
          },
          beginAtZero: false,
        }
      },
      plugins: {
        tooltip: {
          mode: 'index',
          intersect: false,
        },
        legend: {
          display: true,
          position: 'bottom',
        },
        annotation: {
          annotations
        }
      }
    }
  });
}

// Render chart for current builder state
export async function updateBuilderChart() {
  const datasets = [];
  const strikePrices = [];


  for (const inst of builder.customInstruments) {
    let data;
    let label;
    let strikeOrEntry;
    if ( inst.asset === 'opt'){
      // Payoff uses the leg's real (rounded) strike; the premium tier comes from the design
      // ratio it was prefilled at, so rounding can't push it across a tier boundary (see
      // generatePremium). Legs added by hand — and prefilled legs whose strike the user has
      // since moved — carry no designRatio and pass null, tiering off their real strike.
      data = Strategies.calculateOptionPNL(inst.type, inst.strike, inst.size, inst.position, undefined, undefined, inst.designRatio ?? null);
      strikePrices.push(inst.strike)
      strikeOrEntry = inst.strike;
    }
    if (inst.asset === 'perp'){
      data = Strategies.calculatePerpPNL(inst.entry, inst.size, inst.leverage, inst.position);
      strikePrices.push(inst.entry)
      strikeOrEntry = inst.entry;
    }

    const style = Strategies.legLineStyle(inst.asset, inst.type, inst.position);
    label = Strategies.legLabel(inst.asset, inst.type, inst.position, strikeOrEntry);

    datasets.push({
      label,
      data,
      color: style.color,
      borderDash: style.borderDash
    });
  }

  const compound = Strategies.combinePNLCurves(datasets.map(d => d.data));
  datasets.push({
    label: 'PnL',
    data: compound,
    color: '#00E083',
    bgColor: 'rgba(0, 224, 131, 0.14)'
  });

  renderPNLChart(datasets, strikePrices);
}