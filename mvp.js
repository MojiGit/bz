
// JavaScript logic to handle token selection 

const buttons = document.querySelectorAll('.token-btn');
const tokenoutput = document.getElementById('token-output');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Remove active state from all buttons
      buttons.forEach(b => b.classList.remove('bg-[#00E083]', 'text-[#191308]'));

      // Add active state to clicked button
      btn.classList.add('bg-[#00E083]', 'text-[#191308]');

      // Update page content or state
      const token = btn.getAttribute('data-token');
      tokenoutput.textContent = `Selected token: ${token}`;
    });
  });




// JavaScript logic to reflect selection

  const selector = document.getElementById('assetSelector');
  const output = document.getElementById('selectedAsset');

  selector.addEventListener('change', () => {
    output.textContent = `Selected Asset: ${selector.value}`;
  });

// Handle Strategy Type Toggle
  const strategyTypeInputs = document.querySelectorAll('input[name="strategyType"]');
  const standardSection = document.getElementById('standardStrategySection');
  const customSection = document.getElementById('customStrategySection');

  strategyTypeInputs.forEach(input => {
    input.addEventListener('change', () => {
      if (input.value === 'standard' && input.checked) {
        standardSection.classList.remove('hidden');
        customSection.classList.add('hidden');
      } else if (input.value === 'custom' && input.checked) {
        standardSection.classList.add('hidden');
        customSection.classList.remove('hidden');
      }
    });
  });

// Add Asset Row Logic
  const customAssetsContainer = document.getElementById('customAssetsContainer');
  const addAssetBtn = document.getElementById('addAssetBtn');

  addAssetBtn.addEventListener('click', () => {
    const assetRow = document.createElement('div');
    assetRow.className = "border border-gray-300 p-3 rounded mb-4 bg-gray-50";

    assetRow.innerHTML = `
      <div class="mb-2">
        <label class="block text-sm font-medium text-gray-700">Asset Type:</label>
        <select class="assetType w-full p-2 border rounded">
          <option value="spot">Spot</option>
          <option value="perp">Perpetual</option>
          <option value="option">Option</option>
        </select>
      </div>
      <div class="mb-2">
        <label class="block text-sm font-medium text-gray-700">Entry Price:</label>
        <input type="number" class="entryPrice w-full p-2 border rounded" placeholder="e.g. 2000">
      </div>
      <div class="mb-2">
        <label class="block text-sm font-medium text-gray-700">Quantity:</label>
        <input type="number" class="quantity w-full p-2 border rounded" placeholder="e.g. 1">
      </div>
      <div class="mb-2 leverageSection hidden">
        <label class="block text-sm font-medium text-gray-700">Leverage (Only for Perp):</label>
        <input type="number" class="leverage w-full p-2 border rounded" placeholder="e.g. 2">
      </div>
    `;

    const assetTypeSelect = assetRow.querySelector('.assetType');
    const leverageSection = assetRow.querySelector('.leverageSection');

    assetTypeSelect.addEventListener('change', () => {
      if (assetTypeSelect.value === 'perp') {
        leverageSection.classList.remove('hidden');
      } else {
        leverageSection.classList.add('hidden');
      }
    });

    customAssetsContainer.appendChild(assetRow);
  });

  // Constants
const generatePriceRange = (min, max, step) => {
  const prices = [];
  for (let price = min; price <= max; price += step) {
    prices.push(price);
  }
  return prices;
};

// Spot PNL
function calculateSpotPNL(entryPrice, quantity, priceRange) {
  return priceRange.map(currentPrice => {
    const pnl = (currentPrice - entryPrice) * quantity;
    return { price: currentPrice, pnl };
  });
}

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

document.addEventListener('DOMContentLoaded', () => {
  const priceRange = generatePriceRange(1000, 3000, 100); // Replace with your helper function
  const pnlData = createStrangle(1800, 2200, 50, 50, 1, priceRange); // Replace with your actual strategy logic
  renderPNLChart(pnlData);
});
