// ==================================================================================== //

// Chart.js instance for rendering the PNL chart
let chartInstance = null;
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
  const allDatasets = datasets.map(ds => ({
    label: ds.label || '',
    data: ds.data?.map(point => ({ x: point.price, y: point.pnl })) || [],
    borderColor: ds.color || 'blue',
    backgroundColor: ds.bgColor || 'rgba(0, 0, 255, 0.1)',
    borderWidth: 2,
    pointRadius: 0,
    fill: true,
    type: 'line',
    borderDash: ds.borderDash || [],
    tension: 0,
  }));

  // Prepare annotations for strike prices
  const annotations = {};
  if (strikePrices.length > 0) {
      (strikePrices || []).forEach((price, index) => {
      annotations[`strikeLine${index}`] = {
        type: 'line',
        xMin: price,
        xMax: price,
        borderColor: 'gray',
        borderWidth: 1,
        borderDash: [],
        label: {
          display: true,
          content: `Strike ${price}`,
          position: 'start',
          color: 'gray',
          backgroundColor: 'transparent',
          font: {
            size: 10
          }
        },
        z: 0
      };
    }); 
  }
  

  // Add current price line if available
  if (typeof currentPrice === 'number' && !isNaN(currentPrice)) {
    annotations.currentPriceLine = {
      type: 'line',
      xMin: Math.round(currentPrice),
      xMax: Math.round(currentPrice),
      borderColor: '#00E083',
      borderWidth: 1,
      borderDash: [5,5],
      label: {
        display: true,
        content: `Current $${Math.round(currentPrice)}`,
        position: 'end',
        color: '#00E083',
        backgroundColor: 'transparent',
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
    borderDash: [5,5],
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
          title: {
            display: true,
            text: `${mvp.selectedTokenSymbol} Price`,
          },
        },
        y: {
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
    const color = inst.color || '#D8DDEF';

    let data; 
    let label;
    if ( inst.asset === 'opt'){
      data = Strategies.calculateOptionPNL(inst.type, inst.strike, inst.size, inst.position);
      strikePrices.push(inst.strike)
      label = inst.position +' '+ inst.type;
    }
    if (inst.asset === 'perp'){
      data = Strategies.calculatePerpPNL(inst.entry, inst.size, inst.leverage, inst.position);
      strikePrices.push(inst.entry)
      label = inst.position +' '+ inst.asset;
    }
     
    datasets.push({
      label,
      data,
      color,
      bgColor: 'rgba(183, 184, 183, 0.16)'
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