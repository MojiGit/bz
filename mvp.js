

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

let lastScrollTop = 0;
const navbar = document.querySelector('nav');
Chart.register(window['chartjs-plugin-annotation']);
const buttons = document.querySelectorAll('.token-btn');

let selectedTokenSymbol = null;
let currentPrice = null;
// Mapping from button symbol to CoinGecko ID
const tokenIdMap = {
  WBTC: 'wrapped-bitcoin',
  ETH: 'ethereum',
  // Add more tokens 
};

// Mapping from strategy ID to strategy functions
const strategiesIdMap = {
  'empty': {
    fn: defaultStrategy,
    maxProfit: 'Unlimited',
    maxLoss: 'Limited',
    strategyType: 'Capital Gain',
    sentiment: 'Bullish',
    proficiency: 'N/A'
  },
  'strangle': {
    fn: createStrangle,
    maxProfit: 'Unlimited',
    maxLoss: 'Limited',
    strategyType: 'Capital Gain',
    sentiment: 'Neutral',
    proficiency: 'Intermediate'
  },
  'bull-put-spread': {
    fn: createBullPutSpread,
    maxProfit: 'Limited',
    maxLoss: 'Limited',
    strategyType: 'Income',
    sentiment: 'Bullish',
    proficiency: 'Intermediate'
  },
  'bear-call-spread': {
    fn: createBearCallSpread,
    maxProfit: 'Limited',
    maxLoss: 'Limited',
    strategyType: 'Income',
    sentiment: 'Bearish',
    proficiency: 'Intermediate'
  },
  // Add more strategies
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

// Generate price range based on current price
function generateDynamicPriceRange() {
  if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
    throw new Error('Invalid currentPrice for price range');
  }
  const roundedCurrent = Math.round(currentPrice);
  const min = currentPrice * 0.7;
  const max = currentPrice * 1.3;
  const step = currentPrice * 0.01;
  const prices = [];
  for (let price = min; price <= max; price += step) {
    prices.push(Math.round(price));
  }
  // Ensure current price is included in the range
  if (!prices.includes(roundedCurrent)) {
    prices.push(roundedCurrent);
    prices.sort((a, b) => a - b); // Sort to maintain order
  }
  return prices;
}

// Generate default chart - long call option ATM
async function updateChartForToken() {
  const tokenId = tokenIdMap[selectedTokenSymbol];
  if (!tokenId) return;
  const currentPrice = await fetchCurrentPrice(tokenId);
  if (!currentPrice) return;
  const priceRange = generateDynamicPriceRange();

  // deploying a long call option ATM as default

  const { datasets, strikePrices } = await defaultStrategy();
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
    const maxLossP = block.querySelector('.max-loss-display p');
    if (maxLossP) {
      maxLossP.textContent = `${strategiesIdMap[strategyId].maxLoss}`;
    }

    const maxProfitP = block.querySelector('.max-profit-display p');
    if (maxProfitP) {
      maxProfitP.textContent = `${strategiesIdMap[strategyId].maxProfit}`;
    }

    const strategyTypeP = block.querySelector('.strategy-type-display p');
    if (strategyTypeP) {
      strategyTypeP.textContent = `${strategiesIdMap[strategyId].strategyType}`;
    }

    const proficiencyP = block.querySelector('.proficiency-display p');
    if (proficiencyP){
      proficiencyP.textContent = `${strategiesIdMap[strategyId].proficiency}`;
    }

    // NEW: Load corresponding chart
    const { datasets, strikePrices} = await strategiesIdMap[strategyId].fn();
    
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

/*
=== PNL Calculation Functions ===
These functions calculate PNL for different trading strategies, including spot, perpetual futures, and options.
*/


// Perpetual PNL
function calculatePerpPNL(entryPrice, quantity, leverage, priceRange) {
  return priceRange.map(currentPrice => {
    const pnl = (currentPrice - entryPrice) * quantity * leverage;
    return { price: currentPrice, pnl };
  });
}

// Option PNL (Call or Put)
function calculateOptionPNL(optionType, strikePrice, premium, quantity, priceRange, position = 'long') {
  return priceRange.map(currentPrice => {
    let intrinsicValue;
    if (optionType === 'call') {
      intrinsicValue = Math.max(currentPrice - strikePrice, 0);
    } else if (optionType === 'put') {
      intrinsicValue = Math.max(strikePrice - currentPrice, 0);
    } else {
      throw new Error("Invalid option type");
    }

    const totalPNL = (intrinsicValue - premium) * quantity;
    if (position === 'short') {
      // If the position is short, we invert the PNL
      return { price: currentPrice, pnl: -totalPNL };
    }
    return { price: currentPrice, pnl: totalPNL };
  });
}

// Combine multiple PNL datasets into a single compound curve
function combinePNLCurves(pnlArrays) {
  if (pnlArrays.length === 0) return [];

  const length = pnlArrays[0].length;
  const combined = [];

  for (let i = 0; i < length; i++) {
    let totalPNL = 0;
    let pricePoint = pnlArrays[0][i].price; // Assumes all arrays use the same price points

    for (let j = 0; j < pnlArrays.length; j++) {
      totalPNL += pnlArrays[j][i].pnl;
    }

    combined.push({ price: pricePoint, pnl: totalPNL });
  }

  return combined;
}
// Find breakeven points in a PNL array
function findBreakevenPoints(pnlArray) {
  const breakevens = [];
  for (let i = 1; i < pnlArray.length; i++) {
    const prev = pnlArray[i - 1];
    const curr = pnlArray[i];
    // Busca un cruce de signo (de negativo a positivo o viceversa)
    if ((prev.pnl < 0 && curr.pnl >= 0) || (prev.pnl > 0 && curr.pnl <= 0)) {
      // Interpolación lineal para mayor precisión
      const ratio = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
      const breakevenPrice = prev.price + (curr.price - prev.price) * ratio;
      breakevens.push(Math.round(breakevenPrice));
    }
    // También puedes agregar el caso exacto de PNL = 0
    if (curr.pnl === 0) {
      breakevens.push(curr.price);
    }
  }
  return breakevens;
}

// === Default Strategy: Long Call ATM ===
// buy ATM call 
async function defaultStrategy() {
  const priceRange = generateDynamicPriceRange();

  // Default strategy: Long Call ATM
  const strikePrice = currentPrice;
  const premium = currentPrice * 0.09; // Example premium
  const quantity = 1;

  const pnlData = calculateOptionPNL('call', strikePrice, premium, quantity, priceRange);
  const breakeven = findBreakevenPoints(pnlData); // Break-even price for the long call

  return {
    datasets: [
      { label: `${selectedTokenSymbol} Long Call`, data: pnlData, color: '#D8DDEF', bgColor: 'rgba(183, 184, 183, 0.16)'},
    ],
    strikePrices: [Math.round(strikePrice)],
    breakeven: breakeven,
  };
}

// === Predefined Strategy: Long Strangle (Neutral Volatility Bet) ===
// Buy OTM Put + Buy OTM Call
async function createStrangle() {

  const priceRange = generateDynamicPriceRange();

  const longPutStrike = currentPrice * 0.95;
  const longCallStrike = currentPrice * 1.05;
  const premiumPut = currentPrice * 0.05;
  const premiumCall = currentPrice * 0.05;
  const quantity = 1;
  

  const putPNL = calculateOptionPNL('put', longPutStrike, premiumPut, quantity, priceRange);
  const callPNL = calculateOptionPNL('call', longCallStrike, premiumCall, quantity, priceRange);
  const combinedPNL = combinePNLCurves([putPNL, callPNL]);

  const breakeven = findBreakevenPoints(combinedPNL);

  return {
    datasets: [
      { label: `Long Put`, data: putPNL, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Long Call`, data: callPNL, color: '#D8DDEF', bgColor: 'rgba(183, 184, 183, 0)', borderDash: [5, 5] },
      { label: `Compound`, data: combinedPNL, color: 'blue', bgColor: 'rgba(0, 0, 255, 0.1)' },
    ],
    strikePrices: [Math.round(longPutStrike), Math.round(longCallStrike)],
    breakeven: breakeven,
  };
}

// === Predefined Strategy: Bull Put Spread (bullish capital gain) ===
// Buy OTM Put + sell OTM Put
async function createBullPutSpread() {

  const priceRange = generateDynamicPriceRange();

  const longPutStrike = currentPrice * 0.9; // Long Put Strike
  const shortPutStrike = currentPrice * 0.95; // Short Put Strike
  const premiumLong = currentPrice * 0.05;
  const premiumShort = currentPrice * 0.09;
  const quantity = 1;

  const Shortput = calculateOptionPNL('put', shortPutStrike, premiumShort, quantity, priceRange, 'short');
  const Longput = calculateOptionPNL('put', longPutStrike, premiumLong, quantity, priceRange);
  const combinedPNL = combinePNLCurves([Shortput, Longput]);

  const breakeven = findBreakevenPoints(combinedPNL); // Breakeven for the Bull Put Spread

  return {
    datasets: [
      { label: `Short Put`, data: Shortput, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Long Put`, data: Longput, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Compound`, data: combinedPNL, color: 'blue', bgColor: 'rgba(0, 0, 255, 0.1)' },
    ],
    strikePrices: [Math.round(longPutStrike), Math.round(shortPutStrike)],
    breakeven: breakeven,
  };
  
}

// === Predefined Strategy: Bear Call Spread (bearish capital gain) ===
// Buy OTM Call + sell OTM Call
async function createBearCallSpread() {
  const priceRange = generateDynamicPriceRange();

  const longCallStrike = currentPrice * 1.05;
  const shortCallStrike = currentPrice;
  const premiumLong = currentPrice * 0.06;
  const premiumShort = currentPrice * 0.09;
  const quantity = 1;

  const ShortCall = calculateOptionPNL('call', shortCallStrike, premiumShort, quantity, priceRange, 'short');
  const LongCall = calculateOptionPNL('call', longCallStrike, premiumLong, quantity, priceRange);
  const combinedPNL = combinePNLCurves([ShortCall, LongCall]);

  const breakeven = findBreakevenPoints(combinedPNL); // Breakeven for the Bear Call Spread

  return {
    datasets: [
      { label: `Short Call`, data: ShortCall, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Long Call`, data: LongCall, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Compound`, data: combinedPNL, color: 'blue', bgColor: 'rgba(0, 0, 255, 0.1)'},
    ],
    strikePrices: [Math.round(longCallStrike), Math.round(shortCallStrike)],
    breakeven: breakeven,
  };
}

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
            text: 'Subjacent Price',
          },
        },
        y: {
          title: {
            display: true,
            text: 'Profit / Loss',
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

