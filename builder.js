export const strategyBuilderBoard = document.getElementById('strategy-builder-board');
export const strategyMenu = document.getElementById('menu');
export const exitBuilderBtn = document.getElementById('exit-builder');
export const instrumentList = document.getElementById('instrument-list');
export const addOptionBtn = document.getElementById('add-option');
export const addPerpBtn = document.getElementById('add-perp');
export const strategyTitle = document.getElementById('builder-strategy-title');

import * as charts from './charts.js';
import * as mvp from './mvp.js';
import * as Strategies from './strategies.js';


export let customInstruments = [];
export let builderMode = false;
// Strategy this builder session started from. Captured once on entry and deliberately not
// refreshed as legs are edited — the title row reports where the session began, not what
// the leg list currently holds.
let activeStrategyId = null;

// Display-only mapping. `instrument.position` stays 'long'/'short' everywhere in state and
// in the payoff maths; only the button face reads BUY/SELL.
function positionLabel(position) {
  return position === 'long' ? 'BUY' : 'SELL';
}

// Read-only row naming the strategy the session started from.
function renderStrategyTitle() {
  const info = Strategies.strategiesIdMap[activeStrategyId];
  if (!info) {
    strategyTitle.innerHTML = '';
    return;
  }
  // 'custom' carries a filler sentiment ('neutral') that says nothing about a blank canvas,
  // so it shows the name alone — matching how its own card renders in the templates list.
  strategyTitle.innerHTML = activeStrategyId === 'custom'
    ? `<h1 class="text-[14px] font-bold text-[#191308]">${info.name}</h1>`
    : `<h1 class="text-[14px] font-bold text-[#191308]">${info.name}</h1>
       <label class="text-[10px] text-gray-400">|</label>
       <span class="text-[14px] text-gray-400 capitalize">${info.sentiment}</span>`;
}

// Launch build mode
export function enterBuildMode() {
  // Hide filters and strategies
  strategyMenu.classList.add('hidden');
  // Show strategy builder UI
  strategyBuilderBoard.classList.remove('hidden');
  builderMode = true;

  activeStrategyId = mvp.selectedStrategyId;
  renderStrategyTitle();

  if(mvp.strategyComponents){
    for (const inst of mvp.strategyComponents){
      if(inst.asset === 'opt'){
        addOption(inst.type, inst.position, inst.strike, inst.size);
      }
      if(inst.asset === 'perp'){
        addPerp(inst.position, inst.entry, inst.size, inst.leverage);
      }
    }
  }

  charts.updateBuilderChart();
}

// Exit build mode
export function exitBuilder(){
    strategyMenu.classList.remove('hidden');
    strategyBuilderBoard.classList.add('hidden');
    customInstruments = [];
    instrumentList.innerHTML = '';
    activeStrategyId = null;
    strategyTitle.innerHTML = '';
    builderMode = false;
}

exitBuilderBtn.addEventListener('click', () => {
  exitBuilder()
  mvp.updateChartForToken();
});

// Strike choices as multiples of the current price, from 0.8x to 1.2x in 0.05 steps
const STRIKE_MULTIPLIERS = [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2];

// Add instrument to list
function addOption(optType = 'call', optPost = 'long', optStrike = 1, optSize = 1) {
  //it only allows to add long-call options!
  const instrumentId = `inst-${Date.now()}`;
  const instrument = {
    id: instrumentId,
    asset: 'opt',
    type: optType,
    position: optPost,
    strike: optStrike * mvp.currentPrice,
    size: optSize,
    leverage: 1,
    color: '#D8DDEF',
  };
  customInstruments.push(instrument);

  const div = document.createElement('div');
  div.className = 'flex flex-col gap-1 p-2 border border-2 border-[#D8DDEF] shadow-md rounded-xl';
  div.id = instrumentId;
  div.innerHTML = `
    <div class="grid grid-rows-2 gap-2">
      <div class="flex flex-row justify-between items-center gap-2 min-w-0">
        <div class="flex flex-row items-center gap-2 min-w-0">
          <button type="button" class="position-btn text-[12px] font-semibold uppercase px-2 rounded border border-[#D8DDEF] bg-white hover:bg-gray-200">${positionLabel(instrument.position)}</button>
          <button type="button" class="type-btn text-[12px] font-semibold uppercase px-2 rounded border border-[#D8DDEF] bg-white hover:bg-gray-200">${instrument.type}</button>
        </div>
        <button data-remove="${instrumentId}" class="text-gray-500 text-[10px]">X</button>
      </div>
      <div class="flex flex-row items-start gap-2 min-w-0">
        <label class="flex flex-col gap-1 w-full min-w-0">
          <span class="text-[10px] text-gray-400">Strike</span>
          <select class="strike-select w-full text-[12px] border px-2"></select>
        </label>
        <label class="flex flex-col gap-1 w-full min-w-0">
          <span class="text-[10px] text-gray-400">Size</span>
          <input type="number" class="size-input w-full text-[12px] border px-2" value="${instrument.size}">
        </label>
      </div>
    </div>`;
  instrumentList.appendChild(div);

  const strikeSelect = div.querySelector('.strike-select');

  // Populate strike dropdown with values around the current price
  function populateStrikeOptions() {
    strikeSelect.innerHTML = '';
    STRIKE_MULTIPLIERS.forEach(mult => {
      const strikeValue = Math.round(mvp.currentPrice * mult);
      const option = document.createElement('option');
      option.value = strikeValue;
      option.textContent = strikeValue;
      strikeSelect.appendChild(option);
    });
    strikeSelect.value = Math.round(instrument.strike);
    instrument.strike = parseFloat(strikeSelect.value);
  }

  // Add event to remove
  div.querySelector(`[data-remove="${instrumentId}"]`).addEventListener('click', () => {
    customInstruments = customInstruments.filter(inst => inst.id !== instrumentId);
    document.getElementById(instrumentId).remove();
    charts.updateBuilderChart();
  });

  // Listen to input changes
  const typeBtn = div.querySelector('.type-btn');
  typeBtn?.addEventListener('click', () => {
    instrument.type = instrument.type === 'call' ? 'put' : 'call';
    typeBtn.textContent = instrument.type;
    charts.updateBuilderChart();
  });

  const positionBtn = div.querySelector('.position-btn');
  positionBtn?.addEventListener('click', () => {
    instrument.position = instrument.position === 'long' ? 'short' : 'long';
    positionBtn.textContent = positionLabel(instrument.position);
    charts.updateBuilderChart();
  });

  strikeSelect.addEventListener('change', e => {
    instrument.strike = parseFloat(e.target.value);
    charts.updateBuilderChart();
  });
  div.querySelector('.size-input')?.addEventListener('input', e => {
    instrument.size = parseFloat(e.target.value);
    charts.updateBuilderChart();
  });

  populateStrikeOptions();

  charts.updateBuilderChart();
}

// Add instrument to list
function addPerp(perpPositon = 'long', perpEntry = 1, perpSize = 1, perpLeverage = 1) {
  //it only allows to add long-call options! 
  const instrumentId = `inst-${Date.now()}`;
  const instrument = {
    id: instrumentId,
    asset: 'perp',
    position: perpPositon,
    entry: perpEntry * mvp.currentPrice,
    size: perpSize,
    leverage: perpLeverage,
    color: '#D8DDEF',
  };
  customInstruments.push(instrument);

  const div = document.createElement('div');
  div.className = 'flex flex-col gap-2 p-2 border border-2 border-[#D8DDEF] shadow-md rounded-xl';
  div.id = instrumentId;
  div.innerHTML = `
    <div class="grid grid-rows-2 gap-2">
      <div class="flex flex-row justify-between items-center gap-2 min-w-0">
        <div class="flex flex-row items-center gap-2 min-w-0">
          <button type="button" class="position-btn text-[12px] font-semibold uppercase px-2 rounded border border-[#D8DDEF] bg-white hover:bg-gray-200">${positionLabel(instrument.position)}</button>
          <span class="text-[12px] font-semibold uppercase px-2 rounded border border-[#D8DDEF] bg-white">PERP</span>
        </div>
        <button data-remove="${instrumentId}" class="text-gray-500 text-[10px]">X</button>
      </div>
      <div class="flex flex-row items-start gap-2 min-w-0">
        <label class="flex flex-col gap-1 w-full min-w-0">
          <span class="text-[10px] text-gray-400">Entry</span>
          <input type="number" class="entry-input w-full text-[12px] border px-2" value="${instrument.entry}">
        </label>
        <label class="flex flex-col gap-1 w-full min-w-0">
          <span class="text-[10px] text-gray-400">Size</span>
          <input type="number" class="size-input w-full text-[12px] border px-2" value="${instrument.size}">
        </label>
      </div>
    </div>`;
  instrumentList.appendChild(div);

  // Add event to remove
  div.querySelector(`[data-remove="${instrumentId}"]`).addEventListener('click', () => {
    customInstruments = customInstruments.filter(inst => inst.id !== instrumentId);
    document.getElementById(instrumentId).remove();
    charts.updateBuilderChart();
  });

  // Listen to input changes
  const positionBtn = div.querySelector('.position-btn');
  positionBtn?.addEventListener('click', () => {
    instrument.position = instrument.position === 'long' ? 'short' : 'long';
    positionBtn.textContent = positionLabel(instrument.position);
    charts.updateBuilderChart();
  });
  div.querySelector('.entry-input')?.addEventListener('input', e => {
    instrument.entry = parseFloat(e.target.value);
    charts.updateBuilderChart();
  });
  div.querySelector('.size-input')?.addEventListener('input', e => {
    instrument.size = parseFloat(e.target.value);
    charts.updateBuilderChart();
  })

  charts.updateBuilderChart();
}

// Add new instrument
addOptionBtn.addEventListener('click', () => {
  // For now default to long call
  addOption();
});
addPerpBtn.addEventListener('click', () => {
  // For now default to long call
  addPerp();
});

