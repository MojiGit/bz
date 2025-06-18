/*
This section of code is responsible for the dynamic behavior of the MVP page.
It includes the following functionalities:
  1. **Navbar Visibility**: The navbar hides when scrolling down and shows when scrolling up.
  2. **Strategy Block Toggle**: Clicking on a strategy block expands it and loads the corresponding PNL chart.
  3. **Dynamic Price Range**: Fetches current token prices from CoinGecko and generates a dynamic price range for the PNL chart.
  4. **Token Selection**: Allows users to select different tokens, updating the PNL chart accordingly.
  5. **Default Token Selection**: Automatically selects WBTC on page load.
  6. **Chart Rendering**: Utilizes Chart.js to render the PNL chart based on selected strategies and tokens.
*/

import * as Strategies from './strategies.js';

let lastScrollTop = 0;
const navbar = document.querySelector('nav');
Chart.register(window['chartjs-plugin-annotation']);
const buttons = document.querySelectorAll('.token-btn');

export let selectedTokenSymbol = null;
export let currentPrice = null;
// Mapping from button symbol to CoinGecko ID
const tokenIdMap = {
  WBTC: 'wrapped-bitcoin',
  ETH: 'ethereum',
  // Add more tokens 
};

// Navbar Visibility on Scroll
window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

  if (currentScroll > lastScrollTop) {
    // Scroll Down — hide navbar 
    navbar.classList.add('opacity-0', 'pointer-events-none');
    navbar.classList.remove('opacity-100');
  } else {
    // Scroll Up — show navbar ONLY
    navbar.classList.remove('opacity-0', 'pointer-events-none');
    navbar.classList.add('opacity-100');
  }

  lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
});

// token's buttons (ETH, WBTC, etc.), Dynamically update chart scale 
buttons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    buttons.forEach(b => b.classList.remove('bg-[#00E083]', 'border-[#00E083]', 'text-[#191308]'));
    btn.classList.add('bg-[#00E083]', 'text-[#191308]', 'border-[#00E083]');

    const token = btn.getAttribute('data-token');
    selectedTokenSymbol = token;

    await updateChartForToken(selectedTokenSymbol);
  });
});

// Fetch current price from CoinGecko
async function fetchCurrentPrice(tokenId) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`;
  const res = await fetch(url);
  const data = await res.json();
  currentPrice = data[tokenId]?.usd;

  const currentPriceDisplay = document.querySelector('.current-price-display');
  const currentPriceP = currentPriceDisplay.querySelector('p');
  if (currentPriceP) {
    currentPriceP.textContent = `US $ ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  return data[tokenId]?.usd || null;
}

// Generate default chart - long call option ATM
async function updateChartForToken() {
  const tokenId = tokenIdMap[selectedTokenSymbol];
  if (!tokenId) return;
  const currentPrice = await fetchCurrentPrice(tokenId);
  if (!currentPrice) return;

  // deploying a long call option ATM as default

  const { datasets, strikePrices } = await Strategies.defaultStrategy();
  return renderPNLChart(datasets, strikePrices);
}

// Select WBTC by default on page load and render its chart
document.addEventListener('DOMContentLoaded', async () => {
  const defaultBtn = document.querySelector('.token-btn[data-token="WBTC"]');
  if (defaultBtn) {
    defaultBtn.classList.add('bg-[#00E083]', 'text-[#191308]', 'border-[#00E083]');
  }
  selectedTokenSymbol = 'WBTC';
  await updateChartForToken();
});

let currentSentiment = 'all';
let currentNameFilter = '';

const nameFilterInput = document.getElementById('strategy-name-filter');

// Function to apply both filters
function applyStrategyFilters() {
  document.querySelectorAll('.strategy-block').forEach(block => {
    const blockSentiment = block.getAttribute('data-sentiment') || '';
    const strategyName = block.querySelector('h1')?.textContent?.toLowerCase() || '';
    const matchesSentiment = (currentSentiment === 'all' || blockSentiment === currentSentiment);
    const matchesName = strategyName.includes(currentNameFilter);
    block.style.display = (matchesSentiment && matchesName) ? '' : 'none';
  });
}

// Sentiment filter
document.querySelectorAll('.sentiment-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    currentSentiment = btn.getAttribute('data-sentiment');
    document.querySelectorAll('.sentiment-filter').forEach(b => b.classList.remove('bg-[#00E083]', 'text-black'));
    btn.classList.add('bg-[#00E083]', 'text-black');
    applyStrategyFilters();
  });
});

// Name filter
nameFilterInput.addEventListener('input', function () {
  currentNameFilter = nameFilterInput.value.trim().toLowerCase();
  applyStrategyFilters();
});

// Strategy Block Toggle
document.querySelectorAll('.strategy-block').forEach(block => {
  block.addEventListener('click', async function () {
    const content = block.querySelector('.strategy-content');
    const strategyId = block.getAttribute('strategy');
    const isOpen = content.classList.contains('opacity-100');

    // Close all blocks
    document.querySelectorAll('.strategy-block').forEach(otherBlock => {
      const otherContent = otherBlock.querySelector('.strategy-content');
      otherBlock.classList.remove('bg-[#F4FFF9]', 'border-[#52FFB8]');
      otherContent.classList.remove('opacity-100', 'max-h-96');
      otherContent.classList.add('opacity-0', 'max-h-0');
    });

    // Toggle current one (if not already open)
    if (!isOpen) {
      block.classList.add('bg-[#F4FFF9]', 'border-[#52FFB8]');
      content.classList.remove('opacity-0', 'max-h-0');
      content.classList.add('opacity-100', 'max-h-96');
    }

    // Update strategy details
    const descriptionP = block.querySelector('.description-display p');
    if (descriptionP){
      descriptionP.textContent = `${Strategies.strategiesIdMap[strategyId].description}`;
    }

    const maxLossP = block.querySelector('.max-loss-display p');
    if (maxLossP) {
      maxLossP.textContent = `${Strategies.strategiesIdMap[strategyId].maxLoss}`;
    }

    const maxProfitP = block.querySelector('.max-profit-display p');
    if (maxProfitP) {
      maxProfitP.textContent = `${Strategies.strategiesIdMap[strategyId].maxProfit}`;
    }

    const strategyTypeP = block.querySelector('.strategy-type-display p');
    if (strategyTypeP) {
      strategyTypeP.textContent = `${Strategies.strategiesIdMap[strategyId].strategyType}`;
    }

    const proficiencyP = block.querySelector('.proficiency-display p');
    if (proficiencyP){
      proficiencyP.textContent = `${Strategies.strategiesIdMap[strategyId].proficiency}`;
    }

    // NEW: Load corresponding chart
    const { datasets, strikePrices} = await Strategies.strategiesIdMap[strategyId].fn();
    
    /* Breakeven diplay, not used right now 
    const breakevenDisplay = document.querySelector('.breakeven-display');
    const breakevenP = breakevenDisplay.querySelector('p');
    if (breakevenP) {
      if (Array.isArray(breakeven)) {
        breakevenP.textContent = `$ ${breakeven.join(' / $ ')}`;
      } else {
        breakevenP.textContent = `$ ${breakeven.toFixed(0)}`;
      }
    }
    */
    
    return renderPNLChart(datasets, strikePrices);
  });
});


// ==================================================================================== //

// Chart.js instance for rendering the PNL chart
let chartInstance = null;

function renderPNLChart(datasets, strikePrices) {
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

  // Add current price line if available
  if (typeof currentPrice === 'number' && !isNaN(currentPrice)) {
  annotations.currentPriceLine = {
    type: 'line',
    xMin: Math.round(currentPrice),
    xMax: Math.round(currentPrice),
    borderColor: '#00E083',
    borderWidth: 1,
    borderDash: [0],
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
            text: `${selectedTokenSymbol} Price`,
          },
        },
        y: {
          title: {
            display: true,
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

