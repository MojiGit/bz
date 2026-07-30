// ==================================================================================== //

// Chart.js instance for rendering the PNL chart
let chartInstance = null;

// Sign-based colors for the combined "PnL" line: green above y=0 (profit), red below (loss)
const PNL_PROFIT_LINE = '#22c55e';
const PNL_LOSS_LINE = '#ef4444';
const PNL_PROFIT_FILL = 'rgba(34, 197, 94, 0.15)';
const PNL_LOSS_FILL = 'rgba(239, 68, 68, 0.15)';
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
        borderColor: 'rgba(156, 163, 175, 0.35)',
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
      borderColor: '#475569',
      borderWidth: 2,
      borderDash: [5,5],
      label: {
        enabled: true, // annotation plugin v1.4.0 uses `enabled`, not `display`
        content: 'SPOT',
        position: 'end', // v1.4.0: 'end' anchors a vertical line's label at the bottom
        yAdjust: -24, // lift off the x-axis tick row into clear lower-plot space (below most payoff curves)
        color: '#ffffff',
        backgroundColor: '#475569', // solid slate pill: legible over the PnL curve at any spot
        font: { size: 12, weight: 'bold' }
      },
      z: 1
    };
  }

  annotations.breakEvenLine = {
    type: 'line',
    yMin: 0,
    yMax: 0,
    borderColor: 'black',
    borderWidth: 1,
    label: {
      display: true,
      content: 'Break-even',
      position: 'start',
      color: 'black',
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
          grid: { color: '#f0f0f0'},
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
          grid: { color: '#f0f0f0'},
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
    color: 'blue',
    bgColor: 'rgba(0, 0, 255, 0.1)'
  });

  renderPNLChart(datasets, strikePrices);
}