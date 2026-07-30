import test from 'node:test';
import assert from 'node:assert';

/*
 * === WHY THIS FILE EXISTS ===
 *
 * Premium tiering (generatePremium) is decided on a strike/spot RATIO, and adjacent tiers are
 * 2x apart. Template strikes are authored exactly ON a tier boundary (0.9/0.95/1.05/1.1), but
 * both render paths round them to a tradeable dollar strike first — which shifts the ratio far
 * enough to cross the boundary and silently price the leg at double. The fix is to pass the
 * leg's DESIGNED ratio to calculateOptionPNL as tierRatioOverride so rounding can't move it.
 *
 * That fix was applied to generateStrategy (strategies.js, the Templates path) and, because
 * calculateOptionPNL has a SECOND call site, silently did not reach updateBuilderChart
 * (charts.js, the builder path). The builder kept rendering the same strategy with its short
 * legs at 2x premium for as long as it took someone to notice by eye.
 *
 * So this file is not general builder coverage. It exists to catch that specific regression
 * class: a pricing fix landing on one calculateOptionPNL call site and not the other. It
 * asserts the two paths AGREE rather than asserting either one's numbers, so it keeps holding
 * if the tier rates, the strike ladder, or the fixture spot are ever changed — and it fails
 * the moment the paths diverge again, whichever one drifts.
 *
 * Consequently these tests deliberately drive the REAL import chain (mvp.js -> builder.js ->
 * charts.js -> strategies.js) end to end: real DOMContentLoaded boot, real strategy-card
 * click, real enterBuildMode() prefill, real .strike-select change event. Nothing here
 * hand-builds an instrument list or reimplements the pricing maths, because a reimplementation
 * would not have caught the original bug — the bug was in which arguments one call site passed.
 *
 * Premiums are likewise never re-derived from generatePremium's formula. They are read back
 * out of the PnL curves the app actually renders: at a price where the leg's intrinsic value
 * is zero the entire PnL is the premium, so premium == |pnl| / size there.
 */

// --- DOM stub ---------------------------------------------------------------------------
// Richer than tests/strategies.test.js's: it records event listeners (so DOMContentLoaded,
// card clicks and select-change can be dispatched) and returns STABLE children per selector
// (so builder.js's `div.querySelector('.strike-select')` is the same object the test grabs).
function makeEl(tag = 'div') {
  const listeners = {};
  const qcache = new Map();
  const el = {
    tagName: tag,
    id: '',
    className: '',
    innerHTML: '',
    textContent: '',
    value: '',
    scrollHeight: 0,
    style: {},
    children: [],
    _attrs: {},
    _listeners: listeners,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    removeChild() {},
    remove() {},
    insertAdjacentHTML() {},
    setAttribute(k, v) { el._attrs[k] = v; },
    getAttribute(k) { return el._attrs[k] ?? ''; },
    scrollIntoView() {},
    getContext() { return { canvas: true }; },
    querySelector(sel) {
      if (!qcache.has(sel)) qcache.set(sel, makeEl());
      return qcache.get(sel);
    },
    querySelectorAll() { return []; },
    dispatch(type, ev = {}) {
      (listeners[type] || []).forEach(fn => fn({ target: el, stopPropagation() {}, ...ev }));
    },
  };
  return el;
}

const createdEls = [];
const byId = new Map();
const docListeners = {};

const tokenBtn = makeEl('button');
tokenBtn.setAttribute('data-token', 'WBTC');

globalThis.document = {
  getElementById(id) {
    if (!byId.has(id)) { const e = makeEl(); e.id = id; byId.set(id, e); }
    return byId.get(id);
  },
  querySelector(sel) {
    if (sel.includes('token-btn')) return tokenBtn;
    const key = 'sel:' + sel;
    if (!byId.has(key)) byId.set(key, makeEl());
    return byId.get(key);
  },
  querySelectorAll(sel) { return sel === '.token-btn' ? [tokenBtn] : []; },
  createElement(tag) { const e = makeEl(tag); createdEls.push(e); return e; },
  addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
};
globalThis.window = { 'chartjs-plugin-annotation': {} };

// Capturing Chart stub: renderPNLChart's config is how we observe what was actually drawn.
let lastChartConfig = null;
const ChartStub = function (ctx, config) { lastChartConfig = config; this.destroy = () => {}; };
ChartStub.register = function () {};
globalThis.Chart = ChartStub;

// Pinned spot. The assertions below derive their expectations from this rather than hardcoding
// premiums, so changing this number keeps the tests meaningful instead of breaking them.
const FIXTURE_SPOT = 64519;
globalThis.fetch = async () => ({ json: async () => ({ 'wrapped-bitcoin': { usd: FIXTURE_SPOT } }) });

// Dynamic import AFTER the stubs exist — a static import would hoist and run first.
const mvp = await import('../mvp.js');
const builder = await import('../builder.js');
const charts = await import('../charts.js');
const Strategies = await import('../strategies.js');

// --- helpers ----------------------------------------------------------------------------
const settle = () => new Promise(r => setImmediate(r));

// At a price where intrinsic value is zero, the whole PnL is the premium. Puts are read at the
// top of the range (price above strike), calls at the bottom (price below strike).
function premiumFromCurve(points, optionType, size) {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const p = optionType === 'put' ? sorted[sorted.length - 1] : sorted[0];
  return Math.abs(p.y) / size;
}

// Read the per-leg premiums out of whatever was last rendered. Leg order matches the source
// component/instrument order; the combined 'PnL' curve is dropped.
function renderedPremiums(sizes) {
  return lastChartConfig.data.datasets
    .filter(d => d.label !== 'PnL')
    .map((d, i) => {
      const [, kind] = d.label.split(' ');
      return {
        label: d.label,
        premium: premiumFromCurve(d.data, kind.toLowerCase(), sizes[i]),
      };
    });
}

// --- shared setup: boot the page and select Long Iron Condor ------------------------------
for (const fn of docListeners['DOMContentLoaded'] || []) await fn();

const condorCard = createdEls.find(e =>
  typeof e.innerHTML === 'string' &&
  e.innerHTML.includes('Long Iron Condor') &&
  e._listeners['click']);
assert.ok(condorCard, 'Long Iron Condor strategy card was not created');
await condorCard.dispatch('click');

const components = mvp.strategyComponents;

// Templates path (generateStrategy) — the reference the builder must agree with.
const tpl = await Strategies.generateStrategy('longIronCondor');
charts.renderPNLChart(tpl.datasets, tpl.strikePrices);
const templatePremiums = renderedPremiums(components.map(c => c.size));

// Builder path (updateBuilderChart) via the real prefill.
builder.enterBuildMode();
await settle();
const builderPremiums = renderedPremiums(builder.customInstruments.map(i => i.size));

// =========================================================================================
test('B1. builder prefill prices every leg identically to the Templates path', async () => {
  assert.strictEqual(mvp.currentPrice, FIXTURE_SPOT, 'fixture spot did not reach mvp.currentPrice');
  assert.strictEqual(builder.customInstruments.length, components.length,
    'prefill did not create one builder leg per template component');

  // Each prefilled leg must carry the ratio it was designed at; without it the builder has
  // nothing to tier off but the rounded strike, which is the bug.
  builder.customInstruments.forEach((inst, i) => {
    assert.strictEqual(inst.designRatio, components[i].strike,
      `leg ${i} lost its designRatio during prefill`);
  });

  // The actual regression guard: the two call sites must agree leg for leg.
  assert.strictEqual(builderPremiums.length, 4);
  builderPremiums.forEach((leg, i) => {
    assert.ok(leg.premium > 0, `${leg.label} priced at zero premium`);
    assert.strictEqual(leg.premium, templatePremiums[i].premium,
      `${leg.label}: builder path priced at ${leg.premium} but Templates path at ` +
      `${templatePremiums[i].premium} — a pricing fix has reached one calculateOptionPNL ` +
      `call site and not the other (see file header)`);
  });

  // Documented reference values for the pinned fixture spot, kept as a canary so a change in
  // tier rates or ladder steps is noticed rather than silently absorbed by the equality above.
  // Skipped automatically if FIXTURE_SPOT is ever retuned.
  if (FIXTURE_SPOT === 64519) {
    assert.deepStrictEqual(
      builderPremiums.map(l => [l.label, l.premium]),
      [
        ['Short Put 61,500', 2460],
        ['Long Put 58,000', 1160],
        ['Short Call 67,500', 2700],
        ['Long Call 71,000', 1420],
      ],
      'premiums at the pinned fixture spot changed — the short legs doubling to 4920/5400 is ' +
      'the original bug reappearing');
    }
});

// =========================================================================================
test('B2. manually moving a strike invalidates only that leg\'s design ratio', async () => {
  const shortPut = builder.customInstruments.find(i => i.type === 'put' && i.position === 'short');
  const untouched = builder.customInstruments.filter(i => i !== shortPut);
  const before = builderPremiums;

  // Reach the leg's real <select> through the DOM the builder actually built, and fire the
  // real change event — not a direct write to instrument.strike, since the invalidation lives
  // in the change handler and a direct write would bypass exactly what is under test.
  const card = document.getElementById('instrument-list').children.find(c => c.id === shortPut.id);
  assert.ok(card, 'builder card for the short put was not found in the instrument list');
  const strikeSelect = card.querySelector('.strike-select');

  const NEW_STRIKE = 63500; // sits at ~0.984 of spot — genuinely near-the-money, unlike 0.95
  strikeSelect.value = String(NEW_STRIKE);
  strikeSelect.dispatch('change');
  await settle();

  assert.strictEqual(shortPut.strike, NEW_STRIKE, 'change handler did not update the strike');
  assert.strictEqual(shortPut.designRatio, undefined,
    'a manually moved leg kept a design ratio that no longer describes where it sits');
  untouched.forEach(inst => {
    assert.notStrictEqual(inst.designRatio, undefined,
      `untouched leg (${inst.position} ${inst.type} ${inst.strike}) lost its designRatio`);
  });

  const after = renderedPremiums(builder.customInstruments.map(i => i.size));
  const movedIdx = builder.customInstruments.indexOf(shortPut);

  // The moved leg must now tier off where it actually sits...
  const offOwnStrike = Strategies.generatePremium(NEW_STRIKE, 'put', mvp.currentPrice, null);
  assert.strictEqual(after[movedIdx].premium, offOwnStrike,
    'moved leg did not re-tier from its new real strike');
  assert.notStrictEqual(after[movedIdx].premium, before[movedIdx].premium,
    'moved leg kept its old premium — the stale design ratio is still being applied');

  // ...while every other leg is untouched and still priced off its preserved design ratio.
  after.forEach((leg, i) => {
    if (i === movedIdx) return;
    assert.strictEqual(leg.premium, before[i].premium,
      `${leg.label} changed price because a different leg was edited`);
    assert.strictEqual(leg.premium, templatePremiums[i].premium,
      `${leg.label} drifted from the Templates path after an unrelated leg was edited`);
  });

  // The short call is the discriminating case: its design ratio (1.05) and its real ratio
  // (~1.046) fall in different tiers, so agreeing with the Templates path here can only happen
  // if the preserved designRatio is genuinely being used, not coincidentally matching.
  const shortCallIdx = builder.customInstruments.findIndex(i => i.type === 'call' && i.position === 'short');
  const sc = builder.customInstruments[shortCallIdx];
  const scOffOwnStrike = Strategies.generatePremium(sc.strike, 'call', mvp.currentPrice, null);
  assert.notStrictEqual(scOffOwnStrike, after[shortCallIdx].premium,
    'short call no longer discriminates between the two tiering sources — this assertion has ' +
    'lost its power and the fixture strikes need revisiting');
});
