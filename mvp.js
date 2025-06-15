

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
  return data[tokenId]?.usd || null;
}

// Generate price range based on current price
function generateDynamicPriceRange(currentPrice) {
  const roundedCurrent = Math.round(currentPrice);
  const min = currentPrice * 0.8;
  const max = currentPrice * 1.4;
  const step = currentPrice * 0.03;
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
  const priceRange = generateDynamicPriceRange(currentPrice);

  // deploying a long call option ATM as default
  const pnlData = calculateOptionPNL(
    'call', 
    currentPrice, 
    currentPrice * 0.09, // Example premium
    1, 
    priceRange);
  // Render the PNL chart
  const strikePrices = [Math.round(currentPrice)]; // Use current price as strike for simplicity
  renderPNLChart([
    { label: `${selectedTokenSymbol} Long Call`, data: pnlData, color: '#D8DDEF', bgColor: 'rgba(183, 184, 183, 0.16)' },
  ], strikePrices);
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


// Strategy Block Toggle
document.querySelectorAll('.strategy-block').forEach(block => {
  block.addEventListener('click', async function () {
    const content = block.querySelector('.strategy-content');
    const strategyId = block.dataset.strategy; //dopo
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
    const { datasets, strikePrices } = await createStrangle();
    return renderPNLChart(datasets, strikePrices);

  });
});

/* Get the PNL data for the selected strategy
function getStrategyPNLData(strategyId) {
  if (strategyId === 'strangle') {
    return createStrangle();
  };
}
*/
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
function calculateOptionPNL(optionType, strikePrice, premium, quantity, priceRange) {
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

// === Predefined Strategy: Long Strangle (Neutral Volatility Bet) ===
// Buy OTM Put + Buy OTM Call
async function createStrangle() {

  const tokenId = tokenIdMap[selectedTokenSymbol];
  const currentPrice = await fetchCurrentPrice(tokenId); 

  const longPutStrike = currentPrice * 0.9;
  const longCallStrike = currentPrice * 1.1;
  const premiumPut = currentPrice * 0.05;
  const premiumCall = currentPrice * 0.05;
  const quantity = 1;
  const priceRange = generateDynamicPriceRange(currentPrice);

  const putPNL = calculateOptionPNL('put', longPutStrike, premiumPut, quantity, priceRange);
  const callPNL = calculateOptionPNL('call', longCallStrike, premiumCall, quantity, priceRange);

  const combinedPNL = combinePNLCurves([putPNL, callPNL]);

  return {
    datasets: [
      { label: `Long Put`, data: putPNL, color: '#FF6B6B', bgColor: 'rgba(255, 107, 107, 0)' },
      { label: `Long Call`, data: callPNL, color: '#D8DDEF', bgColor: 'rgba(183, 184, 183, 0)' },
      { label: `Compound`, data: combinedPNL, color: '#4CAF50', bgColor: 'rgba(76, 175, 80, 0.16)' },
    ],
    strikePrices: [Math.round(longPutStrike), Math.round(longCallStrike)],
  };
}


// === Predefined Strategy: Bull Put Spread (bullish capital gain) ===
// Buy OTM Put + sell OTM Put

function createBullPutSpread(longPutStrike, shortPutStrike, premiumLong, premiumShort, quantity, priceRange) {
  const Shortput = calculateOptionPNL('put', shortPutStrike, premiumShort, quantity, priceRange);
  const Longput = calculateOptionPNL('put', longPutStrike, premiumLong, quantity, priceRange);
  
  return {
    legs: [Shortput, Longput],
    combined: combinePNLCurves([Shortput, Longput])
  };
}
// === Predefined Strategy: Bear Call Spread (bearish capital gain) ===
// Buy OTM Call + sell OTM Call
function createBearCallSpread(longCallStrike, shortCallStrike, premiumLong, premiumShort, quantity, priceRange) {
  const ShortCall = calculateOptionPNL('call', shortCallStrike, premiumShort, quantity, priceRange);
  const LongCall = calculateOptionPNL('call', longCallStrike, premiumLong, quantity, priceRange);

  return {
    legs: [ShortCall, LongCall],
    combined: combinePNLCurves([ShortCall, LongCall])
  };
}





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

  // Safely extract PNL values
  const allPNL = datasets.flatMap(ds => ds.data?.map(point => point.pnl) || []);
  const minY = Math.min(...allPNL);
  const maxY = Math.max(...allPNL);

  const allDatasets = datasets.map(ds => ({
    label: ds.label || '',
    data: ds.data?.map(point => ({ x: point.price, y: point.pnl })) || [],
    borderColor: ds.color || 'blue',
    backgroundColor: ds.bgColor || 'rgba(0, 0, 255, 0.1)',
    borderWidth: 2,
    pointRadius: 0,
    fill: true,
    tension: 0,
  }));

  const annotations = {};
  (strikePrices || []).forEach((price, index) => {
    annotations[`strikeLine${index}`] = {
      type: 'line',
      xMin: price,
      xMax: price,
      borderColor: 'gray',
      borderWidth: 1,
      borderDash: [5, 5],
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
            text: 'Price',
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

