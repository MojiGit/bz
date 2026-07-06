export const strategyBuilderBoard = document.getElementById('strategy-builder-board');
export const strategyMenu = document.getElementById('menu');
export const exitBuilderBtn = document.getElementById('exit-builder');
export const instrumentList = document.getElementById('instrument-list');
export const addOptionBtn = document.getElementById('add-option');
export const addPerpBtn = document.getElementById('add-perp');

import * as charts from './charts.js';
import * as mvp from './mvp.js';


export let customInstruments = [];
export let builderMode = false;

// Launch build mode
export function enterBuildMode() {
  // Hide filters and strategies
  strategyMenu.classList.add('hidden');
  // Show strategy builder UI
  strategyBuilderBoard.classList.remove('hidden');
  builderMode = true;

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
  div.className = 'flex flex-col gap-2 p-2 border border-2 border-[#D8DDEF] shadow-md rounded-xl';
  div.id = instrumentId;
  div.innerHTML = `
    <div class="flex flex-row justify-between items-center">
      <span class="text-black text-[16px] font-semibold">Option</span>
      <button data-remove="${instrumentId}" class="text-black text-[16px]">X</button>
    </div>
    <div class = "flex flex-row justify-between gap-2">
      <div class="flex flex-col items-center gap-2">
        <label class= "text-[12px]">Type</label>
        <label><button type="button" class="type-btn text-[16px] border px-2 rounded bg-white hover:bg-gray-200">${instrument.type}</button></label>
      </div>
      <div class="flex flex-col items-center gap-2">
        <label class= "text-[12px]">Position</label>
      <label><button type="button" class="position-btn text-[16px] border px-2 rounded bg-white hover:bg-gray-200">${instrument.position}</button></label>
      </div>
      <div class="flex flex-col items-center gap-2">
        <label class= "text-[12px]">Strike</label>
      <label>
        <select class="strike-select text-[16px] max-w-[100px] border px-2"></select>
      </label>
      </div>
      <div class="flex flex-col items-center gap-2">
        <label class= "text-[12px]">Size</label>
      <label><input type="number" class="size-input text-[16px] max-w-[100px] border px-2" value="${instrument.size}"></label>
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
    positionBtn.textContent = instrument.position;
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
    <div class="flex flex-row justify-between items-center">
      <span class="text-black text-[16px] font-semibold">Perpetual</span>
      <button data-remove="${instrumentId}" class="text-black text-[16px]">X</button>
    </div>
    <div class= "flex flex-row justify-between gap-2">
      <div class="flex flex-col items-center gap-2">
        <label class= "text-[12px]">Position</label>
        <label><button type="button" class="position-btn text-[16px] border px-2 rounded bg-white hover:bg-gray-200">${instrument.position}</button></label>
      </div>
      <div class="flex flex-col items-center gap-2">
        <label class= "text-[12px]">Entry</label>
        <label><input type="number" class="entry-input text-[16px]  max-w-[100px] border px-2" value="${instrument.entry}"></label>
      </div>
      <div class="flex flex-col items-center gap-2">
        <label class= "text-[12px]">Size</label>
        <label><input type="number" class="size-input text-[16px] max-w-[100px] border px-2" value="${instrument.size}"></label>
      </div>
      <div class="flex flex-col items-center gap-2">
        <label class= "text-[12px]">Leverage</label>
        <label><input type="number" class="leverage-input text-[16px] max-w-[100px] border px-2" value="${instrument.leverage}"></label>
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
    positionBtn.textContent = instrument.position;
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
  div.querySelector('.leverage-input')?.addEventListener('input', e => {
    instrument.leverage = parseFloat(e.target.value);
    charts.updateBuilderChart();
  });

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

