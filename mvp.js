
/* 
Hide navbar on scroll down, show on scroll up

*/
let lastScrollTop = 0;
const navbar = document.querySelector('nav');


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


Chart.register(window['chartjs-plugin-annotation']);
// JavaScript button for token selection 

const buttons = document.querySelectorAll('.token-btn');


// 1. Mapping from button symbol to CoinGecko ID
const tokenIdMap = {
  WBTC: 'wrapped-bitcoin',
  ETH: 'ethereum',
  // Add more tokens as needed
};

// 2. Fetch current price from CoinGecko
async function fetchCurrentPrice(tokenId) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`;
  const res = await fetch(url);
  const data = await res.json();
  return data[tokenId]?.usd || null;
}

// 3. Generate price range based on current price
function generateDynamicPriceRange(currentPrice) {
  const min = currentPrice * 0.8;
  const max = currentPrice * 1.4;
  const step = currentPrice * 0.03;
  const prices = [];
  for (let price = min; price <= max; price += step) {
    prices.push(Math.round(price));
  }
  // Ensure current price is included in the range
  const roundedCurrent = Math.round(currentPrice);
  if (!prices.includes(roundedCurrent)) {
    prices.push(roundedCurrent);
    prices.sort((a, b) => a - b); // Sort to maintain order
  }
  return prices;
}

// 4. Update chart for selected token
async function updateChartForToken(tokenSymbol) {
  const tokenId = tokenIdMap[tokenSymbol];
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
    { label: `${tokenSymbol} Long Call`, data: pnlData, color: '#00E083', bgColor: 'rgba(0, 224, 131, 0.1)' },
  ], strikePrices);
}

// 5. token buttons
buttons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    buttons.forEach(b => b.classList.remove('bg-[#00E083]', 'border-[#00E083]', 'text-[#191308]'));
    btn.classList.add('bg-[#00E083]', 'text-[#191308]', 'border-[#00E083]');
    const token = btn.getAttribute('data-token');
    await updateChartForToken(token);
  });
});

// Select WBTC by default on page load
document.addEventListener('DOMContentLoaded', async () => {
  const defaultBtn = document.querySelector('.token-btn[data-token="WBTC"]');
  if (defaultBtn) {
    defaultBtn.classList.add('bg-[#00E083]', 'text-[#191308]', 'border-[#00E083]');
  }
  await updateChartForToken('WBTC');
});


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
function createStrangle(longPutStrike, longCallStrike, premiumPut, premiumCall, quantity, priceRange) {
  const putPNL = calculateOptionPNL('put', longPutStrike, premiumPut, quantity, priceRange);
  const callPNL = calculateOptionPNL('call', longCallStrike, premiumCall, quantity, priceRange);

  return {
  legs: [putPNL, callPNL],
  combined: combinePNLCurves([putPNL, callPNL])
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
  const ctx = document.getElementById('pnlChart').getContext('2d');

  // Prepare Y range from all PNL values
  let allPNL = datasets.flatMap(ds => ds.data.map(point => point.pnl));
  let minY = Math.min(...allPNL);
  let maxY = Math.max(...allPNL);

  // Format user datasets for Chart.js
  let allDatasets = datasets.map(ds => ({
    label: ds.label,
    data: ds.data.map(point => ({ x: point.price, y: point.pnl })),
    borderColor: ds.color,
    backgroundColor: ds.bgColor,
    borderWidth: 2,
    pointRadius: 0,
    fill: true,
    tension: 0,
  }));

  // Build annotation objects for each strike price
  const annotations = {};
  strikePrices.forEach((price, index) => {
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

  // Clean up old chart
  if (chartInstance !== null) {
    chartInstance.destroy();
  }

  // Create the new chart
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: allDatasets
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
          annotations: annotations
        }
      }
    }
  });
}
