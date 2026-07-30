/*
This section of code is responsible for the dynamic behavior of the MVP page.
It includes the following functionalities:
  1. **Strategy Block Toggle**: Clicking on a strategy block expands it and loads the corresponding PNL chart.
  2. **Dynamic Price Range**: Fetches current token prices from CoinGecko and generates a dynamic price range for the PNL chart.
  3. **Token Selection**: Allows users to select different tokens, updating the PNL chart accordingly.
  4. **Default Token Selection**: Automatically selects WBTC on page load.
  5. **Chart Rendering**: Utilizes Chart.js to render the PNL chart based on selected strategies and tokens.
*/

import * as Strategies from './strategies.js';
import * as charts from './charts.js';
import * as builder from './builder.js';


Chart.register(window['chartjs-plugin-annotation']);
const buttons = document.querySelectorAll('.token-btn');

export let selectedTokenSymbol = null;
export let currentPrice = null;

// Mapping from button symbol to CoinGecko ID
const tokenIdMap = {
  WBTC: 'wrapped-bitcoin',
  ETH: 'ethereum',
  // Add more tokens (this will depend on the protocols i will connect)
};

// standard function to capitalize titles
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const button = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
let menuOpen = false;

// show the dropdown menu when clicking
button.addEventListener('click', () => {
    menuOpen = !menuOpen;
    mobileMenu.classList.toggle('opacity-0', !menuOpen);
    mobileMenu.classList.toggle('pointer-events-none', !menuOpen);
    mobileMenu.classList.toggle('opacity-100', menuOpen);
});

export let priceRange = [];
// Fetch current price from CoinGecko
async function fetchCurrentPrice(tokenId) {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`;
    const res = await fetch(url);
    const data = await res.json();
    //update the gobal variable
    currentPrice = data[tokenId]?.usd;

    const currentPriceDisplay = document.querySelector('.current-price-display');
    const currentPriceP = currentPriceDisplay.querySelector('p');
    if (currentPriceP) {
      currentPriceP.textContent = `US $ ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }

    priceRange = Strategies.generateDynamicPriceRange();

    return data[tokenId]?.usd || null;
  } catch (err) {
    console.error('Failed to fetch current price:', err);
    const currentPriceP = document.querySelector('.current-price-display')?.querySelector('p');
    if (currentPriceP) {
      currentPriceP.textContent = 'Price unavailable';
    }
    return null;
  }
}

//variable to store the current strategy dployed
export let selectedStrategyId;
export let strategyComponents;

// token's buttons (ETH, WBTC, etc.), Dynamically update chart scale 
buttons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    buttons.forEach(b => b.classList.remove('bg-[#00E083]', 'text-[#191308]', 'border-[#00E083]', 'active-token'));
    btn.classList.add('bg-[#00E083]', 'text-[#191308]', 'border-[#00E083]', 'active-token');

    const token = btn.getAttribute('data-token');
    selectedTokenSymbol = token;
    // Fetch and update currentPrice for the new token
    const tokenId = tokenIdMap[selectedTokenSymbol];

    //get current price
    if (tokenId) {
      await fetchCurrentPrice(tokenId); //update the current price
    }
    //if there is a strategy selected then deploy it, otherwise run a long call option
    if (builder.builderMode === true){
      builder.exitBuilder()
    } 

    if (selectedStrategyId) { 
      const { datasets, strikePrices } = await Strategies.generateStrategy(selectedStrategyId);
      charts.renderPNLChart(datasets, strikePrices);
    } else {
      const { datasets, strikePrices } = await Strategies.defaultStrategy();
      charts.renderPNLChart(datasets, strikePrices);
    }   
   
  });
});


// Generate default chart - long call option ATM
export async function updateChartForToken() {
  const tokenId = tokenIdMap[selectedTokenSymbol];
  if (!tokenId) return;
  const currentPrice = await fetchCurrentPrice(tokenId);
  if (!currentPrice) return;

  if (selectedStrategyId) { 
    const { datasets, strikePrices } = await Strategies.generateStrategy(selectedStrategyId);
    charts.renderPNLChart(datasets, strikePrices);
  } else {
    const { datasets, strikePrices } = await Strategies.defaultStrategy();
    charts.renderPNLChart(datasets, strikePrices);
  }   

}

// Select WBTC by default on page load and render its chart
document.addEventListener('DOMContentLoaded', async () => {

  generateStrategyCards('strategy-container'); //initiates the creation of the strategies templates

  //selecting WBTC by default and setting the current filter to 'ALL'
  const defaultBtn = document.querySelector('.token-btn[data-token="WBTC"]');
  if (defaultBtn) {
    defaultBtn.classList.add('bg-[#00E083]', 'text-[#191308]', 'border-[#00E083]', 'active-token');
  }
  const defaultSentiment = document.querySelector('.sentiment-filter[data-sentiment="all"]');
  if (defaultSentiment){
    defaultSentiment.classList.add('bg-[#00E083]', 'active-filter');
  }
  selectedTokenSymbol = 'WBTC'; //default token WBTC
  await updateChartForToken();
});

let currentSentiment = 'all'; //deploy all strategies by default
let currentNameFilter = ''; //no filter by name

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
    //update sentiment value
    currentSentiment = btn.getAttribute('data-sentiment'); 
    //highlighs the selection
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

    //for each strategy in IdMap creates a div with the atributes, sentiment and strategyid
    const card = document.createElement('div');
    card.className = 'strategy-block mx-1 shrink-0 grid grid-cols-1 divide-y-2 p-1 border border-2 border-[#D8DDEF] rounded-xl transition-all duration-300 cursor-pointer overflow-hidden';
    card.setAttribute('data-strategy', strategyId);
    card.setAttribute('data-sentiment', info.sentiment);

    //Div content
    if(strategyId === 'custom'){
      card.innerHTML = `
      <div class="flex flex-row strategy-header justify-between">
        <div class="flex flex-row gap-2 items-center">
          <h1 class="text-[14px] font-bold text-[#191308]">${info.name}</h1>
        </div>
      </div>
      <div class="strategy-content opacity-0 overflow-hidden transition-all duration-500 ease-in-out" style="max-height: 0px;">
        <div class="description-display py-2">
          <p class="text-[12px] text-gray-400">${info.description}</p>
        </div>
        <button class="text-[14px] bg-[#D8DDEF] font-semibold text-black px-2 mb-2 rounded-md hover:bg-[#52FFB8] transition-colors duration-300">
          Build
        </button>
      </div>
    `;
    } else {
    card.innerHTML = `
      <div class="flex flex-row strategy-header justify-between">
        <div class="flex flex-row gap-2 items-center">
          <h1 class="text-[14px] font-bold text-[#191308]">${info.name}</h1>
          <label class="text-[10px] text-gray-400">|</label>
          <span class="text-[14px] text-gray-400">${capitalize(info.sentiment)}</span>
        </div>
      </div>
      <div class="strategy-content opacity-0 overflow-hidden transition-all duration-500 ease-in-out" style="max-height: 0px;">
        <div class="description-display py-2">
          <p class="text-[12px] text-gray-400">${info.description}</p>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-2 py-2 p justify-between gap-2">
          <div class="proficiency-display flex flex-col">
            <h2 class="font-bold text-[12px]">Proficiency</h2>
            <p class="text-[11px]">${info.proficiency}</p>
          </div>
          <div class="strategy-type-display flex flex-col">
            <h2 class="font-bold text-[12px]">Strategy Type</h2>
            <p class="text-[11px]">${info.strategyType}</p>
          </div>
          <div class="max-profit-display flex flex-col">
            <h2 class="font-bold text-[12px]">Max Profit</h2>
            <p class="text-[11px]">${info.maxProfit}</p>
          </div>
          <div class="max-loss-display flex flex-col">
            <h2 class="font-bold text-[12px]">Max Loss</h2>
            <p class="text-[11px]">${info.maxLoss}</p>
          </div>
        </div>
        <button class="text-[14px] bg-[#D8DDEF] font-semibold text-black px-2 mb-2 rounded-md hover:bg-[#52FFB8] transition-colors duration-300">
          Build
        </button>
      </div>
    `;
    }

    const buildBtn = card.querySelector('button');
    buildBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent collapsing behavior
      builder.enterBuildMode(); // You can pass initial instrument if needed
    });

    // Chart trigger on card click
    card.addEventListener('click', async () => {

      // Collapse all other cards
      document.querySelectorAll('.strategy-block').forEach(other => {
        const content = other.querySelector('.strategy-content');
        other.classList.remove('bg-[#F4FFF9]', 'border-[#52FFB8]');
        content.classList.remove('opacity-100');
        content.classList.add('opacity-0');
        content.style.maxHeight = '0px';
      });

      // Expand current card (max-height matches its actual content, not a fixed guess)
      const content = card.querySelector('.strategy-content');
      card.classList.add('bg-[#F4FFF9]', 'border-[#52FFB8]');
      content.classList.remove('opacity-0');
      content.classList.add('opacity-100');
      content.style.maxHeight = content.scrollHeight + 'px';

      // Scroll the expanded card into view within its scrollable list once it has
      // finished growing (matches .strategy-content's own transition-duration-500)
      setTimeout(() => {
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 500);

      selectedStrategyId = strategyId; //update global variable
      strategyComponents = Strategies.strategiesIdMap[selectedStrategyId].components;

      // Render chart
      try {
        if(strategyId === 'custom'){
          updateChartForToken();
        }
        const {datasets, strikePrices} = await Strategies.generateStrategy(selectedStrategyId);
        charts.renderPNLChart(datasets, strikePrices);
      } catch (err) {
        console.error('Failed to render strategy chart:', err);
        content.querySelector('.strategy-error')?.remove();
        content.insertAdjacentHTML('beforeend', `<p class="strategy-error text-red-500 text-[14px]">Unable to load this strategy's chart.</p>`);
      }
    });

    container.appendChild(card);
  });

  applyStrategyFilters();

};



