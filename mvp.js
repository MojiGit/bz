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

// Navbar Visibility on Scroll
let lastScrollTop = 0;
const navbar = document.querySelector('nav');
const mobileMenu = document.getElementById('mobile-menu');

// listener to hide the navbar each time the user scrolls down, and show it again when scrolling up
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

const button = document.getElementById('mobile-menu-button');
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
}

//variable to store the current strategy dployed
let selectedStrategyId;
export let strategyComponents;

// token's buttons (ETH, WBTC, etc.), Dynamically update chart scale 
buttons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    buttons.forEach(b => b.classList.remove('bg-[#00E083]', 'border-[#00E083]', 'active-token'));
    btn.classList.add('bg-[#00E083]', 'border-[#00E083]', 'active-token');

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
      charts.renderPNLChart(datasets);
    } else {
      const { datasets, strikePrices } = await Strategies.defaultStrategy();
      charts.renderPNLChart(datasets);
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
    charts.renderPNLChart(datasets);
  } else {
    const { datasets, strikePrices } = await Strategies.defaultStrategy();
    charts.renderPNLChart(datasets);
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
    card.className = 'strategy-block grid grid-cols-1 divide-y-2 px-2 pt-2 gap-2 border border-2 border-[#D8DDEF] shadow-md rounded-xl transition-all duration-300 cursor-pointer overflow-hidden';
    card.setAttribute('data-strategy', strategyId);
    card.setAttribute('data-sentiment', info.sentiment);

    //Div content
    if(strategyId === 'custom'){
      card.innerHTML = `
      <div class="flex flex-row strategy-header justify-between">
        <div class="flex flex-row gap-2 items-center">
          <h1 class="text-[18px] font-bold text-[#191308]">${info.name}</h1>
        </div>
      </div>
      <div class="strategy-content opacity-0 max-h-0 overflow-hidden transition-all duration-500 ease-in-out">
        <div class="description-display py-2">
          <p class="text-[16px] text-gray-400">${info.description}</p>
        </div>
        <button class="text-[16px] bg-[#D8DDEF] font-semibold text-black px-2 mb-2 rounded-md hover:bg-[#52FFB8] transition-colors duration-300">
          Build
        </button>
      </div>
    `;
    } else {
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
            <p class="text-[14px]">${info.strategyType}</p>
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
        content.classList.remove('opacity-100', 'max-h-96');
        content.classList.add('opacity-0', 'max-h-0');
      });

      // Expand current card
      const content = card.querySelector('.strategy-content');
      card.classList.add('bg-[#F4FFF9]', 'border-[#52FFB8]');
      content.classList.remove('opacity-0', 'max-h-0');
      content.classList.add('opacity-100', 'max-h-96');

      selectedStrategyId = strategyId; //update global variable
      strategyComponents = Strategies.strategiesIdMap[selectedStrategyId].components;

      // Render chart
      if(strategyId === 'custom'){
        updateChartForToken();
      }
      const {datasets, strikePrices} = await Strategies.generateStrategy(selectedStrategyId);
      charts.renderPNLChart(datasets);
    });

    container.appendChild(card);
  });

  applyStrategyFilters();

};







