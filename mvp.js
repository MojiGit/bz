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
let lastScrollTop = 0;
const navbar = document.querySelector('nav');
const mobileMenu = document.getElementById('mobile-menu');

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

  if (currentScroll > lastScrollTop) {
    // Scroll Down — hide navbar and dropdown (if open)
    navbar.classList.add('opacity-0', 'pointer-events-none');
    navbar.classList.remove('opacity-100');

    if (!mobileMenu.classList.contains('hidden')) {
      mobileMenu.classList.add('opacity-0', 'pointer-events-none');
      mobileMenu.classList.remove('opacity-100');
    }
  } else {
    // Scroll Up — show navbar ONLY
    navbar.classList.remove('opacity-0', 'pointer-events-none');
    navbar.classList.add('opacity-100');

    // Do NOT show the dropdown here — leave it hidden unless manually triggered
  }

  lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
});


  const menu = document.getElementById('mobile-menu');
  const button = document.getElementById('mobile-menu-button');

  let menuOpen = false;

  button.addEventListener('click', () => {
    menuOpen = !menuOpen;
    menu.classList.toggle('opacity-0', !menuOpen);
    menu.classList.toggle('pointer-events-none', !menuOpen);
    menu.classList.toggle('opacity-100', menuOpen);
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
  return renderPNLChart(datasets);// i removed the strikePrices for now
}

// Select WBTC by default on page load and render its chart
document.addEventListener('DOMContentLoaded', async () => {

  generateStrategyCards('strategy-container');

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
    document.querySelectorAll('.sentiment-filter').forEach(b => {
      b.classList.remove('bg-[#00E083]', 'active-filter');
    });
    btn.classList.add('bg-[#00E083]', 'active-filter');
    applyStrategyFilters();
  });
});

// Name filter
nameFilterInput.addEventListener('input', function () {
  currentNameFilter = nameFilterInput.value.trim().toLowerCase();
  applyStrategyFilters();
});

// creates the strategies cards
function generateStrategyCards(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  Object.entries(Strategies.strategiesIdMap).forEach(([strategyId, info]) => {
    const card = document.createElement('div');
    card.className = 'strategy-block grid grid-cols-1 divide-y-2 px-2 pt-2 gap-2 border border-2 border-[#D8DDEF] shadow-md rounded-xl transition-all duration-300 cursor-pointer overflow-hidden';
    card.setAttribute('data-strategy', strategyId);
    card.setAttribute('data-sentiment', info.sentiment);

    card.innerHTML = `
      <div class="flex flex-row strategy-header justify-between">
        <div class="flex flex-row gap-2 items-center">
          <h1 class="text-[18px] font-bold text-[#191308]">${info.name}</h1>
          <label class="text-gray-400">|</label>
          <span class="text-[16px] text-gray-400">${capitalize(info.sentiment)}</span>
        </div>
      </div>
      <div class="strategy-content opacity-0 max-h-0 overflow-hidden transition-all duration-500 ease-in-out">
        <div class="description-display py-2">
          <p class="text-[16px] text-gray-400">${info.description}</p>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 py-2 justify-between gap-4">
          <div class="proficiency-display flex flex-col">
            <h2 class="font-bold text-[14px]">Proficiency</h2>
            <p class="text-[14px]">${info.proficiency}</p>
          </div>
          <div class="strategy-type-display flex flex-col">
            <h2 class="font-bold text-[14px]">Strategy Type</h2>
            <p class="text-[14px]">${info.type}</p>
          </div>
          <div class="max-profit-display flex flex-col">
            <h2 class="font-bold text-[14px]">Max Profit</h2>
            <p class="text-[14px]">${info.maxProfit}</p>
          </div>
          <div class="max-loss-display flex flex-col">
            <h2 class="font-bold text-[14px]">Max Loss</h2>
            <p class="text-[14px]">${info.maxLoss}</p>
          </div>
        </div>
        <button class="text-[16px] bg-[#D8DDEF] font-semibold text-black px-2 mb-2 rounded-md hover:bg-[#52FFB8] transition-colors duration-300">
          Build
        </button>
      </div>
    `;

    // Chart trigger on card click
    card.addEventListener('click', async () => {
      // Collapse all other cards
      document.querySelectorAll('.strategy-block').forEach(other => {
        const content = other.querySelector('.strategy-content');
        other.classList.remove('bg-[#F4FFF9]', 'border-[#52FFB8]');
        content.classList.remove('opacity-100', 'max-h-96');
        content.classList.add('opacity-0', 'max-h-0');
      });

      // Expand current card
      const content = card.querySelector('.strategy-content');
      card.classList.add('bg-[#F4FFF9]', 'border-[#52FFB8]');
      content.classList.remove('opacity-0', 'max-h-0');
      content.classList.add('opacity-100', 'max-h-96');

      // Render chart
      if (typeof info.fn === 'function') {
        try {
          const { datasets, strikePrices } = await info.fn(); // pass current token
          renderPNLChart(datasets);// i removed the strikePrices for now
        } catch (err) {
          console.error(`Error building strategy "${strategyId}":`, err);
        }
      }
    });

    container.appendChild(card);
  });

  applyStrategyFilters();

}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

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
    
    return renderPNLChart(datasets); // i removed the strikePrices for now
  });
});


// ==================================================================================== //

// Chart.js instance for rendering the PNL chart
let chartInstance = null;

function renderPNLChart(datasets, strikePrices = []) {
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

  const allPNL = allDatasets.flatMap(ds => ds.data.map(point => point.y));

  let minY = Math.round(Math.min(...allPNL)/1000) * 1300 ;
  let maxY = Math.round(Math.max(...allPNL)/1000) * 1300 ;

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
            text: `${selectedTokenSymbol} Price`,
          },
        },
        y: {
          title: {
            display: false,
            text: 'PnL',
          },
          beginAtZero: false,
          min: minY,
          max: maxY
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

