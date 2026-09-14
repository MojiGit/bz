export const strategyBuilderBoard = document.getElementById('strategy-builder-board');
export const strategyMenu = document.getElementById('menu');
export const exitBuilderBtn = document.getElementById('exit-builder');
export const instrumentList = document.getElementById('instrument-list');
export const addOptionBtn = document.getElementById('add-option');
export const addPerpBtn = document.getElementById('add-perp');
export const strategyTitle = document.getElementById('builder-strategy-title');

const editingBlock   = document.getElementById('builder-editing-block');
const quotingBlock   = document.getElementById('builder-quoting-block');
const quoteStripTitle = document.getElementById('quote-strip-title');
const quoteStripCount = document.getElementById('quote-strip-count');

import * as charts from './charts.js';
import * as mvp from './mvp.js';
import * as Strategies from './strategies.js';
import { fetchDeribitQuotes, fetchDeribitExpiries } from './quotes.js';


export let customInstruments = [];
export let builderMode = false;

// Cache of available expiry dates for the active token, fetched once per build session.
let cachedExpiries = []; // [{ ts: number, label: string }]
// Strategy this builder session started from. Captured once on entry and deliberately not
// refreshed as legs are edited — the title row reports where the session began, not what
// the leg list currently holds.
let activeStrategyId = null;

export let showQuotes = false;
export let quotesByLeg = {}; // { [instId]: quoteResult } — populated while in quote mode

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

// Fetch and cache expiry list for the active token. Called once per build session.
async function loadExpiries() {
  try {
    cachedExpiries = await fetchDeribitExpiries(mvp.selectedTokenSymbol);
  } catch {
    cachedExpiries = [];
  }
}

// Populate an expiry <select> element from the cache and set a default value.
function populateExpirySelect(selectEl, defaultTs) {
  if (!cachedExpiries.length) {
    selectEl.innerHTML = '<option value="">Unavailable</option>';
    return null;
  }
  selectEl.innerHTML = cachedExpiries
    .map(e => `<option value="${e.ts}">${e.label}</option>`)
    .join('');
  const ts = defaultTs ?? cachedExpiries[0].ts;
  selectEl.value = ts;
  return ts;
}

// Launch build mode
export async function enterBuildMode() {
  strategyMenu.classList.add('hidden');
  strategyBuilderBoard.classList.remove('hidden');
  builderMode = true;

  // Always start in editing state, discarding any leftover quote mode from a prior session
  showQuotes = false;
  quotesByLeg = {};
  editingBlock.classList.remove('hidden');
  quotingBlock.classList.add('hidden');

  activeStrategyId = mvp.selectedStrategyId;
  renderStrategyTitle();
  await loadExpiries();

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
    cachedExpiries = [];
    showQuotes = false;
    quotesByLeg = {};
    editingBlock.classList.remove('hidden');
    quotingBlock.classList.add('hidden');
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
    expiryTs: cachedExpiries.length ? cachedExpiries[0].ts : null,
  };
  customInstruments.push(instrument);

  const div = document.createElement('div');
  div.className = 'flex flex-col gap-1.5 p-1.5 md:gap-1 border border-[#D8DDEF] shadow-sm rounded-lg';
  div.id = instrumentId;
  div.innerHTML = `
    <div class="flex flex-col gap-1.5 md:gap-1">
      <div class="flex flex-row justify-between items-center gap-1.5 md:gap-1 min-w-0">
        <div class="flex flex-row items-center gap-1.5 md:gap-1 min-w-0">
          <button type="button" class="position-btn text-[12px] leading-tight font-semibold uppercase px-2 py-0.5 md:px-1.5 md:py-[1px] rounded border border-[#D8DDEF] bg-white hover:bg-gray-200">${positionLabel(instrument.position)}</button>
          <button type="button" class="type-btn text-[12px] leading-tight font-semibold uppercase px-2 py-0.5 md:px-1.5 md:py-[1px] rounded border border-[#D8DDEF] bg-white hover:bg-gray-200">${instrument.type}</button>
        </div>
        <button data-remove="${instrumentId}" aria-label="Remove leg" class="text-gray-500 shrink-0 flex items-center justify-center text-[12px] leading-none min-w-[20px] min-h-[20px] rounded hover:bg-gray-200 md:text-[10px] md:min-w-0 md:min-h-0 md:hover:bg-transparent">X</button>
      </div>
      <div class="flex flex-row items-start gap-1.5 min-w-0">
        <!-- Strike (custom dropdown). Deliberately a <div> not a <label>: a label forwards
             clicks to the hidden <select>, popping the native picker over the custom one. -->
        <div class="flex flex-col gap-0.5 flex-1 min-w-0">
          <span class="text-[10px] text-gray-400">Strike</span>
          <div class="strike-field relative w-full min-w-0">
            <select class="strike-select absolute inset-0 w-full h-full opacity-0 pointer-events-none" tabindex="-1" aria-hidden="true"></select>
            <button type="button" class="strike-trigger relative w-full text-[12px] leading-tight border px-2 py-0.5 bg-white text-left flex flex-row items-center justify-between gap-1" aria-haspopup="listbox" aria-expanded="false">
              <span class="strike-trigger-label truncate"></span>
              <span class="text-[10px] text-gray-400 shrink-0" aria-hidden="true">&#9662;</span>
            </button>
            <div class="strike-popup hidden absolute left-0 right-0 top-full mt-1 z-20 max-h-[168px] md:max-h-[132px] overflow-y-auto overscroll-contain rounded border border-[#D8DDEF] bg-white shadow-lg" role="listbox"></div>
          </div>
        </div>
        <!-- Qty (narrow fixed width) -->
        <label class="flex flex-col gap-0.5 shrink-0 w-10">
          <span class="text-[10px] text-gray-400">Qty</span>
          <input type="number" class="size-input w-full text-[12px] leading-tight border px-1 py-0.5" value="${instrument.size}">
        </label>
        <!-- Expiry -->
        <div class="flex flex-col gap-0.5 flex-1 min-w-0">
          <span class="text-[10px] text-gray-400">Expiry</span>
          <select class="expiry-leg-select w-full text-[12px] border border-[#D8DDEF] rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#00E083] text-[#191308]">
            <option value="">—</option>
          </select>
        </div>
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

  // Expiry select — populate from cache and track per-instrument
  const expiryLegSelect = div.querySelector('.expiry-leg-select');
  populateExpirySelect(expiryLegSelect, instrument.expiryTs);
  instrument.expiryTs = expiryLegSelect.value ? Number(expiryLegSelect.value) : null;
  expiryLegSelect.addEventListener('change', () => {
    instrument.expiryTs = expiryLegSelect.value ? Number(expiryLegSelect.value) : null;
    resetQuoteMode(); // quotes are stale when expiry changes
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
  addOption();
});
addPerpBtn.addEventListener('click', () => {
  addPerp();
});

// Quote button and results panel (DOM refs; both live inside their respective blocks)
const quoteBtn   = document.getElementById('get-quote');
const quotePanel = document.getElementById('quote-results');

// Render expandable quote cards into #quote-results inside the quoting block.
function renderQuoteCards(results) {
  const fmt = (n, dec = 0) =>
    n == null || isNaN(n) || n === 0
      ? '—'
      : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
  const fmtPct = n => n == null ? '—' : `${Number(n).toFixed(2)}%`;

  function fmtOptName(q) {
    const parts = (q.name ?? '').split('-');
    const expRaw = parts[1] ?? '';
    const day = expRaw.slice(0, 2);
    const mon = expRaw.slice(2, 5);
    const yr  = expRaw.length >= 7 ? '20' + expRaw.slice(5) : '';
    return `${(q.type ?? '').toUpperCase()} · $${Number(q.strike).toLocaleString('en-US')} · ${day} ${mon} ${yr}`.trim();
  }

  quotePanel.innerHTML = '';

  results.forEach(q => {
    // — NO QUOTE card (error or null result) —
    if (!q || q.error) {
      const inst = customInstruments.find(x => x.id === q?.id);
      const instLabel = inst
        ? (inst.asset === 'opt'
            ? `${inst.type.toUpperCase()} · $${Number(inst.strike).toLocaleString('en-US')}`
            : 'PERP')
        : 'Unknown leg';
      const div = document.createElement('div');
      div.className = 'border border-amber-200 bg-amber-50 rounded-lg px-2 py-1.5';
      div.innerHTML = `
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] font-bold text-amber-500 shrink-0">NO QUOTE</span>
          <span class="text-[11px] font-semibold text-amber-700 flex-1 min-w-0 truncate">${instLabel}</span>
          <span class="text-[10px] text-amber-400 italic shrink-0">adjust strike or expiry</span>
        </div>
        <div class="text-[10px] text-amber-300 mt-0.5">${q?.error ?? 'No response'}</div>`;
      quotePanel.appendChild(div);
      return;
    }

    // — Quote card (valid result) —
    const isBuy     = q.position === 'long';
    const posClass  = isBuy ? 'text-[#00C96B]' : 'text-[#FF6B6B]';
    const posLabel  = isBuy ? 'BUY' : 'SELL';
    const name      = q.asset === 'opt' ? fmtOptName(q) : (q.name ?? 'PERP');
    const total     = q.mark != null ? q.mark * q.size : null;
    const extraInfo = q.asset === 'opt'
      ? `<span class="text-[10px] text-gray-400 shrink-0">IV ${fmtPct(q.iv)}</span>`
      : `<span class="text-[10px] text-gray-400 shrink-0">Fund. ${fmtPct(q.funding)}/8h</span>`;

    const card = document.createElement('div');
    card.className = 'border border-[#D8DDEF] rounded-lg overflow-hidden';
    card.innerHTML = `
      <button type="button" class="quote-card-header w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-gray-50">
        <span class="text-[10px] font-bold shrink-0 ${posClass}">${posLabel}</span>
        <span class="text-[11px] font-semibold text-[#191308] flex-1 min-w-0 truncate">${name}</span>
        <span class="text-[10px] text-gray-400 shrink-0">×${q.size}</span>
        <span class="flex items-center gap-1 text-[10px] text-gray-500 shrink-0">
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#00E083]"></span>Deribit
        </span>
        <span class="text-[10px] font-semibold text-[#191308] shrink-0">${fmt(total)}</span>
        <span class="quote-card-chevron text-[9px] text-gray-400 shrink-0" style="display:inline-block;transition:transform 150ms">▼</span>
      </button>
      <div class="quote-card-detail hidden border-t border-[#D8DDEF]">
        <div class="flex items-center gap-2 px-2 py-1.5">
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#00E083] shrink-0"></span>
          <span class="text-[11px] font-semibold text-[#191308] flex-1">Deribit</span>
          <div class="grid grid-cols-3 gap-2 text-center text-[10px] mr-1">
            <div class="flex flex-col"><span class="text-gray-400">Bid</span><span>${fmt(q.bid)}</span></div>
            <div class="flex flex-col bg-[#F4FFF9] rounded px-1"><span class="text-gray-400">Mark</span><span class="font-bold">${fmt(q.mark)}</span></div>
            <div class="flex flex-col"><span class="text-gray-400">Ask</span><span>${fmt(q.ask)}</span></div>
          </div>
          ${extraInfo}
          <span class="text-[10px] text-[#00C96B] shrink-0 font-bold">✓</span>
        </div>
      </div>`;

    const header  = card.querySelector('.quote-card-header');
    const detail  = card.querySelector('.quote-card-detail');
    const chevron = card.querySelector('.quote-card-chevron');
    header.addEventListener('click', () => {
      const isOpen = !detail.classList.contains('hidden');
      detail.classList.toggle('hidden', isOpen);
      chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
    });

    quotePanel.appendChild(card);
  });
}

// Swap to quoting state: collapse editing block into summary strip + show quote cards.
function enterQuoteMode(results) {
  const info = Strategies.strategiesIdMap[activeStrategyId];
  if (quoteStripTitle) {
    quoteStripTitle.innerHTML = info
      ? (activeStrategyId === 'custom'
          ? `<span class="text-[13px] font-bold text-[#191308]">${info.name}</span>`
          : `<span class="text-[13px] font-bold text-[#191308]">${info.name}</span>
             <span class="text-[11px] text-gray-400 capitalize ml-1">${info.sentiment}</span>`)
      : '';
  }
  if (quoteStripCount) {
    const n = customInstruments.length;
    quoteStripCount.textContent = `${n} instrument${n !== 1 ? 's' : ''}`;
  }

  renderQuoteCards(results);

  editingBlock.classList.add('hidden');
  quotingBlock.classList.remove('hidden');
  quotingBlock.classList.add('anim-fade-rise');
  setTimeout(() => quotingBlock.classList.remove('anim-fade-rise'), 200);

  const disc = document.getElementById('premium-disclaimer');
  if (disc) disc.textContent = 'Payoff curves use live Deribit mark prices. Legs without quotes are excluded from the chart.';
}

// Restore editing state. Callable from the Edit button and from external resets.
function exitQuoteMode() {
  showQuotes = false;
  quotesByLeg = {};

  quotingBlock.classList.add('hidden');
  editingBlock.classList.remove('hidden');
  editingBlock.classList.add('anim-fade-rise');
  setTimeout(() => editingBlock.classList.remove('anim-fade-rise'), 200);

  charts.updateBuilderChart();
  const disc = document.getElementById('premium-disclaimer');
  if (disc) disc.textContent = 'Payoff curves use estimated reference premiums for illustration only — not live market prices. Actual costs and breakevens will differ. Request a quote for real pricing.';
}

// Exported for external callers (token change, template select, clear)
export function resetQuoteMode() {
  if (showQuotes) exitQuoteMode();
}

document.getElementById('edit-from-quote').addEventListener('click', () => exitQuoteMode());

quoteBtn.addEventListener('click', async () => {
  if (!customInstruments.length) return;
  quoteBtn.textContent = 'Loading…';
  quoteBtn.disabled = true;
  try {
    const results = await fetchDeribitQuotes(customInstruments, mvp.selectedTokenSymbol, mvp.currentPrice);
    quotesByLeg = {};
    for (const r of results) {
      if (r) quotesByLeg[r.id] = r;
    }
    showQuotes = true;
    enterQuoteMode(results);
    charts.updateBuilderChart();
  } catch (e) {
    console.error('Quote fetch failed:', e);
  } finally {
    quoteBtn.textContent = 'Quote';
    quoteBtn.disabled = false;
  }
});

