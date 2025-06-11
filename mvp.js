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
  return prices;
}

// 4. Update chart for selected token
async function updateChartForToken(tokenSymbol) {
  const tokenId = tokenIdMap[tokenSymbol];
  if (!tokenId) return;
  const currentPrice = await fetchCurrentPrice(tokenId);
  if (!currentPrice) return;
  const priceRange = generateDynamicPriceRange(currentPrice);
  // Example: using strangle strategy, adjust as needed
  const pnlData = calculateOptionPNL(
    'call', 
    currentPrice, 
    currentPrice * 0.09, // Example premium
    1, 
    priceRange);
  
  renderPNLChart(pnlData);
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

  return combinePNLCurves([putPNL, callPNL]);
}

// === Predefined Strategy: Short Condor ===
// Sell OTM put spread + Sell OTM call spread (profit if price stays in the middle)
function createShortCondor(
  lowerPutStrike, longPutStrike,
  shortCallStrike, higherCallStrike,
  putSpreadPremium, callSpreadPremium,
  quantity,
  priceRange
) {
  const shortPut = calculateOptionPNL('put', longPutStrike, putSpreadPremium / 2, -quantity, priceRange);
  const longPut = calculateOptionPNL('put', lowerPutStrike, 0, quantity, priceRange); // assume zero premium for simplicity

  const shortCall = calculateOptionPNL('call', shortCallStrike, callSpreadPremium / 2, -quantity, priceRange);
  const longCall = calculateOptionPNL('call', higherCallStrike, 0, quantity, priceRange); // assume zero premium

  return combinePNLCurves([shortPut, longPut, shortCall, longCall]);
}

let chartInstance = null;

function renderPNLChart(pnlData) {
  const ctx = document.getElementById('pnlChart').getContext('2d');

  const labels = pnlData.map(point => point.price);
  const data = pnlData.map(point => point.pnl);

  // Destroy existing chart if already rendered
  if (chartInstance !== null) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'PNL Curve',
        data: data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      scales: {
        x: {
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
          display: false,
        }
      },
      responsive: true,
      maintainAspectRatio: false,
    }
  });
}

