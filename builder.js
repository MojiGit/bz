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
        // strategiesIdMap stores `strike` as a ratio of spot, so it serves as both the raw
        // strike to convert AND the leg's designed ratio — passed twice on purpose. Only
        // prefilled legs get the second one; the "+ Option" button omits it.
        addOption(inst.type, inst.position, inst.strike, inst.size, inst.strike);
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

// Date.now() alone is not unique: the prefill loop in enterBuildMode creates every leg of a
// multi-leg template within the same millisecond, so all of them ended up sharing one id —
// removing any one then stripped the whole strategy from customInstruments while deleting a
// single card. The counter makes each id distinct regardless of how fast legs are created.
let instrumentSeq = 0;
function nextInstrumentId() {
  return `inst-${Date.now()}-${instrumentSeq++}`;
}

// Add instrument to list
// designRatio: the strike/spot ratio this leg was DESIGNED at in strategiesIdMap (0.95, 1.1,
// ...), carried through prefill so premium tiering can be decided off it rather than off the
// rounded dollar strike (see generatePremium's tierRatioOverride). Deliberately left
// undefined for legs built by hand — they have no designed ratio, only where they sit — and
// cleared once the user moves the strike themselves.
function addOption(optType = 'call', optPost = 'long', optStrike = 1, optSize = 1, designRatio) {
  const instrumentId = nextInstrumentId();
  const instrument = {
    id: instrumentId,
    asset: 'opt',
    type: optType,
    position: optPost,
    strike: optStrike * mvp.currentPrice,
    size: optSize,
    leverage: 1,
    color: '#D8DDEF',
    designRatio,
  };
  customInstruments.push(instrument);

  const div = document.createElement('div');
  div.className = 'flex flex-col gap-1.5 p-1.5 md:gap-1 border border-[#D8DDEF] shadow-sm rounded-lg';
  div.id = instrumentId;
  div.innerHTML = `
    <div class="grid grid-rows-2 gap-1.5 md:gap-1">
      <div class="flex flex-row justify-between items-center gap-1.5 md:gap-1 min-w-0">
        <div class="flex flex-row items-center gap-1.5 md:gap-1 min-w-0">
          <button type="button" class="position-btn text-[12px] leading-tight font-semibold uppercase px-2 py-0.5 md:px-1.5 md:py-[1px] rounded border border-[#D8DDEF] bg-white hover:bg-gray-200">${positionLabel(instrument.position)}</button>
          <button type="button" class="type-btn text-[12px] leading-tight font-semibold uppercase px-2 py-0.5 md:px-1.5 md:py-[1px] rounded border border-[#D8DDEF] bg-white hover:bg-gray-200">${instrument.type}</button>
        </div>
        <!-- 20px is a deliberate trade: row density over the 24px minimum touch target this
             control used to meet. It still gets a real hit box rather than a bare 10px glyph,
             and it is destructive-but-recoverable (re-add the leg), so the cost of the
             occasional missed tap is low. Revisit if removals start going wrong in practice. -->
        <button data-remove="${instrumentId}" aria-label="Remove leg" class="text-gray-500 shrink-0 flex items-center justify-center text-[12px] leading-none min-w-[20px] min-h-[20px] rounded hover:bg-gray-200 md:text-[10px] md:min-w-0 md:min-h-0 md:hover:bg-transparent">X</button>
      </div>
      <div class="flex flex-row items-start gap-1.5 min-w-0">
        <!-- Deliberately a <div>, not a <label>: a label forwards clicks to its labelable
             descendant, which here is the hidden <select>, popping the native picker on top
             of the custom one. The caption is a plain span instead. -->
        <div class="flex flex-col gap-0.5 w-full min-w-0">
          <span class="text-[10px] text-gray-400">Strike</span>
          <div class="strike-field relative w-full min-w-0">
            <!-- Source of truth. Still a real <select>, still filled by populateStrikeOptions,
                 still carrying the change listener that owns instrument.strike/designRatio.
                 Visually hidden rather than display:none so it stays a live form control; the
                 custom UI below only presents it. tabindex/aria-hidden move the keyboard stop
                 to the trigger so one control is not two tab stops. -->
            <select class="strike-select absolute inset-0 w-full h-full opacity-0 pointer-events-none" tabindex="-1" aria-hidden="true"></select>
            <button type="button" class="strike-trigger relative w-full text-[16px] leading-tight border px-2 py-1 md:text-[12px] md:py-0.5 bg-white text-left flex flex-row items-center justify-between gap-1" aria-haspopup="listbox" aria-expanded="false">
              <span class="strike-trigger-label truncate"></span>
              <span class="text-[10px] text-gray-400 shrink-0" aria-hidden="true">&#9662;</span>
            </button>
            <!-- Both caps are ~5.5 rows at their own row height (mobile rows are taller for
                 touch), so the half row that says "this scrolls" survives at either size —
                 the list can run 20-40 strikes. -->
            <div class="strike-popup hidden absolute left-0 right-0 top-full mt-1 z-20 max-h-[168px] md:max-h-[132px] overflow-y-auto overscroll-contain rounded border border-[#D8DDEF] bg-white shadow-lg" role="listbox"></div>
          </div>
        </div>
        <label class="flex flex-col gap-0.5 w-full min-w-0">
          <span class="text-[10px] text-gray-400">Size</span>
          <input type="number" class="size-input w-full text-[16px] leading-tight border px-2 py-1 md:text-[12px] md:py-0.5" value="${instrument.size}">
        </label>
      </div>
    </div>`;
  instrumentList.appendChild(div);

  const strikeSelect = div.querySelector('.strike-select');

  // Populate the strike dropdown with a round-dollar ladder across spot +-20%, using
  // roundToStrikeStep's per-token step sizes (tighter near the money, wider in the wings).
  // The option count varies with token and spot and is intentionally not the old fixed 9.
  function populateStrikeOptions() {
    strikeSelect.innerHTML = '';
    const spot = mvp.currentPrice;
    const token = mvp.selectedTokenSymbol;
    if (!spot || isNaN(spot) || spot <= 0) return;

    const low = spot * 0.8;
    const high = spot * 1.2;

    // Enumerate distinct round-dollar strikes by snapping each dollar in the band to its
    // ladder step via roundToStrikeStep, then de-duping. This keeps the step sizes defined in
    // exactly one place (roundToStrikeStep) instead of duplicating them here.
    const seen = new Set();
    const strikes = [];
    for (let p = Math.ceil(low); p <= high; p++) {
      const s = Strategies.roundToStrikeStep(p, spot, token);
      if (s >= low && s <= high && !seen.has(s)) {
        seen.add(s);
        strikes.push(s);
      }
    }
    strikes.sort((a, b) => a - b);

    strikes.forEach(strikeValue => {
      const option = document.createElement('option');
      option.value = strikeValue;
      option.textContent = strikeValue;
      strikeSelect.appendChild(option);
    });

    // Preserve sync: select the ladder strike nearest the leg's current strike, then re-sync
    // instrument.strike to it so the dropdown and the leg can never drift apart.
    const target = Math.round(instrument.strike);
    let nearest = strikes[0];
    for (const s of strikes) {
      if (Math.abs(s - target) < Math.abs(nearest - target)) nearest = s;
    }
    strikeSelect.value = nearest;
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
    // The leg is no longer where the template designed it, so its designed ratio no longer
    // describes it — drop it and let the leg tier itself off where it actually sits. Note
    // this is the USER moving the strike; populateStrikeOptions' own snap-to-ladder re-sync
    // above must not clear it, since that is the prefill landing on a tradeable strike.
    instrument.designRatio = undefined;
    charts.updateBuilderChart();
  });
  div.querySelector('.size-input')?.addEventListener('input', e => {
    instrument.size = parseFloat(e.target.value);
    charts.updateBuilderChart();
  });

  populateStrikeOptions();

  // === Custom strike dropdown ===========================================================
  // Presentation only. The native <select> above remains the single source of truth: the
  // ladder is still generated in populateStrikeOptions, and instrument.strike / designRatio
  // are still owned exclusively by the change listener registered further up. This UI drives
  // that listener the same way a user driving a native select would — set .value, dispatch a
  // real 'change' — so none of that logic is duplicated here and cannot drift from it.
  const strikeField = div.querySelector('.strike-field');
  const strikeTrigger = div.querySelector('.strike-trigger');
  const strikeTriggerLabel = div.querySelector('.strike-trigger-label');
  const strikePopup = div.querySelector('.strike-popup');

  const formatStrike = value => Number(value).toLocaleString('en-US');

  function syncStrikeTrigger() {
    strikeTriggerLabel.textContent = strikeSelect.value ? formatStrike(strikeSelect.value) : '--';
  }

  function onStrikeOutsideClick(e) {
    if (!strikeField.contains(e.target)) closeStrikePopup();
  }

  function onStrikeKeydown(e) {
    if (e.key === 'Escape') closeStrikePopup();
  }

  function closeStrikePopup() {
    strikePopup.classList.add('hidden');
    strikeTrigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onStrikeOutsideClick);
    document.removeEventListener('keydown', onStrikeKeydown);
  }

  function openStrikePopup() {
    // Rebuilt from the live <option> list on every open, so the ladder stays defined in
    // exactly one place and this can never render a stale copy of it.
    strikePopup.innerHTML = '';
    let selectedRow = null;

    div.querySelectorAll('.strike-select option').forEach(opt => {
      const isSelected = opt.value === strikeSelect.value;
      const row = document.createElement('button');
      row.type = 'button';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(isSelected));
      row.className = 'strike-option block w-full text-left text-[14px] leading-tight px-2.5 py-1.5 md:text-[12px] md:px-2 md:py-1 hover:bg-[#F4FFF9]' +
        (isSelected ? ' bg-[#F4FFF9] font-semibold' : '');
      row.textContent = formatStrike(opt.value);

      row.addEventListener('click', () => {
        strikeSelect.value = opt.value;
        // This is the whole point of keeping the real select: the existing change listener
        // does the parseFloat, clears designRatio and re-renders. Nothing to duplicate.
        strikeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        closeStrikePopup();
      });

      if (isSelected) selectedRow = row;
      strikePopup.appendChild(row);
    });

    strikePopup.classList.remove('hidden');
    strikeTrigger.setAttribute('aria-expanded', 'true');

    // Land on the current strike rather than at the top of a 20-40 row list.
    if (selectedRow) {
      strikePopup.scrollTop = Math.max(
        0, selectedRow.offsetTop - (strikePopup.clientHeight - selectedRow.offsetHeight) / 2);
    }

    // Registered only while open. Attaching during the opening click is safe because
    // onStrikeOutsideClick ignores clicks inside the field, which includes the trigger.
    document.addEventListener('click', onStrikeOutsideClick);
    document.addEventListener('keydown', onStrikeKeydown);
  }

  strikeTrigger.addEventListener('click', () => {
    if (strikePopup.classList.contains('hidden')) openStrikePopup();
    else closeStrikePopup();
  });

  // Additive presentation mirror — the state-owning change listener above is untouched. This
  // keeps the trigger face correct no matter what moves the select's value.
  strikeSelect.addEventListener('change', syncStrikeTrigger);
  syncStrikeTrigger();

  charts.updateBuilderChart();
}

// Add instrument to list
function addPerp(perpPositon = 'long', perpEntry = 1, perpSize = 1, perpLeverage = 1) {
  const instrumentId = nextInstrumentId();
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
  div.className = 'flex flex-col gap-1.5 p-1.5 md:gap-1 border border-[#D8DDEF] shadow-sm rounded-lg';
  div.id = instrumentId;
  div.innerHTML = `
    <div class="grid grid-rows-2 gap-1.5 md:gap-1">
      <div class="flex flex-row justify-between items-center gap-1.5 md:gap-1 min-w-0">
        <div class="flex flex-row items-center gap-1.5 md:gap-1 min-w-0">
          <button type="button" class="position-btn text-[12px] leading-tight font-semibold uppercase px-2 py-0.5 md:px-1.5 md:py-[1px] rounded border border-[#D8DDEF] bg-white hover:bg-gray-200">${positionLabel(instrument.position)}</button>
          <span class="text-[12px] leading-tight font-semibold uppercase px-2 py-0.5 md:px-1.5 md:py-[1px] rounded border border-[#D8DDEF] bg-white">PERP</span>
        </div>
        <!-- 20px is a deliberate trade: row density over the 24px minimum touch target this
             control used to meet. It still gets a real hit box rather than a bare 10px glyph,
             and it is destructive-but-recoverable (re-add the leg), so the cost of the
             occasional missed tap is low. Revisit if removals start going wrong in practice. -->
        <button data-remove="${instrumentId}" aria-label="Remove leg" class="text-gray-500 shrink-0 flex items-center justify-center text-[12px] leading-none min-w-[20px] min-h-[20px] rounded hover:bg-gray-200 md:text-[10px] md:min-w-0 md:min-h-0 md:hover:bg-transparent">X</button>
      </div>
      <div class="flex flex-row items-start gap-1.5 min-w-0">
        <label class="flex flex-col gap-0.5 w-full min-w-0">
          <span class="text-[10px] text-gray-400">Entry</span>
          <input type="number" class="entry-input w-full text-[16px] leading-tight border px-2 py-1 md:text-[12px] md:py-0.5" value="${instrument.entry}">
        </label>
        <label class="flex flex-col gap-0.5 w-full min-w-0">
          <span class="text-[10px] text-gray-400">Size</span>
          <input type="number" class="size-input w-full text-[16px] leading-tight border px-2 py-1 md:text-[12px] md:py-0.5" value="${instrument.size}">
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

