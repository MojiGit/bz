import test from 'node:test';
import assert from 'node:assert';

/*
 * strategies.js lives in a circular browser module graph (strategies <-> mvp <-> charts
 * <-> builder). mvp.js and builder.js execute browser-only code at import time
 * (Chart.register(...), document.getElementById(...), addEventListener(...)). To exercise
 * the pure PnL maths under Node we install minimal stubs for those globals, then load the
 * module with a dynamic import() AFTER the stubs exist (a static import would hoist and run
 * before the stubs were assigned).
 */
function makeEl() {
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    scrollHeight: 0,
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    remove() {},
    insertAdjacentHTML() {},
    setAttribute() {},
    getAttribute() { return ''; },
    scrollIntoView() {},
    getContext() { return null; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
  };
}

globalThis.document = {
  getElementById() { return makeEl(); },
  querySelector() { return makeEl(); },
  querySelectorAll() { return []; },
  createElement() { return makeEl(); },
  addEventListener() {},
};
globalThis.window = { 'chartjs-plugin-annotation': {} };
const ChartStub = function () {};
ChartStub.register = function () {};
globalThis.Chart = ChartStub;

const { calculateOptionPNL, calculatePerpPNL, generatePremium } = await import('../strategies.js');

// --- Fixtures -------------------------------------------------------------------------
const spotPrice = 100; // round number, easy to reason about
const strike = 90;     // realistic relative to spot
const quantity = 1;    // matches the spec literally

// Real premiums taken straight from the function the code actually uses internally.
// Never re-derived from generatePremium's formula.
const callPremium = generatePremium(strike, 'call', spotPrice);
const putPremium = generatePremium(strike, 'put', spotPrice);

// Exact theoretical breakevens.
const callBreakeven = strike + callPremium; // long call: strike + premium
const putBreakeven = strike - putPremium;   // long put:  strike - premium

// Synthetic price ranges injected via the priceRange parameter. Each includes: a price
// clearly above strike+premium, a price clearly below strike-premium, the strike itself,
// and the exact breakeven price (so PnL == 0 there can be asserted directly).
const callPrices = [70, strike, callBreakeven, 130];
const putPrices = [60, putBreakeven, strike, 110];

// --- Helpers --------------------------------------------------------------------------
const EPS = 1e-6;
function close(actual, expected, eps = EPS) {
  return Math.abs(actual - expected) <= eps;
}
function pnlAt(result, price) {
  const row = result.find(r => r.price === price);
  assert.ok(row, `expected a result row at price ${price}`);
  return row.pnl;
}

// --- Long call ------------------------------------------------------------------------
test('1. long call profit above strike+premium', () => {
  const res = calculateOptionPNL('call', strike, quantity, 'long', spotPrice, callPrices);
  const price = 130;
  const pnl = pnlAt(res, price);
  const expected = price - strike - callPremium;
  assert.ok(close(pnl, expected), `expected ${expected}, got ${pnl}`);
});

test('2. long call max loss at strike is -premium', () => {
  const res = calculateOptionPNL('call', strike, quantity, 'long', spotPrice, callPrices);
  const pnl = pnlAt(res, strike);
  assert.ok(close(pnl, -callPremium), `expected ${-callPremium}, got ${pnl}`);
});

test('3. long call breakeven at strike+premium is ~0', () => {
  const res = calculateOptionPNL('call', strike, quantity, 'long', spotPrice, callPrices);
  const pnl = pnlAt(res, callBreakeven);
  assert.ok(close(pnl, 0), `expected ~0, got ${pnl}`);
});

// --- Long put -------------------------------------------------------------------------
test('4. long put profit below strike-premium', () => {
  const res = calculateOptionPNL('put', strike, quantity, 'long', spotPrice, putPrices);
  const price = 60;
  const pnl = pnlAt(res, price);
  const expected = strike - price - putPremium;
  assert.ok(close(pnl, expected), `expected ${expected}, got ${pnl}`);
});

test('5. long put max loss at strike is -premium', () => {
  const res = calculateOptionPNL('put', strike, quantity, 'long', spotPrice, putPrices);
  const pnl = pnlAt(res, strike);
  assert.ok(close(pnl, -putPremium), `expected ${-putPremium}, got ${pnl}`);
});

test('6. long put breakeven at strike-premium is ~0', () => {
  const res = calculateOptionPNL('put', strike, quantity, 'long', spotPrice, putPrices);
  const pnl = pnlAt(res, putBreakeven);
  assert.ok(close(pnl, 0), `expected ~0, got ${pnl}`);
});

// --- Short = inverse payoff (no max-loss assertion; short loss is structurally uncapped)
test('7. short call is the exact inverse of the long call at every price', () => {
  const long = calculateOptionPNL('call', strike, quantity, 'long', spotPrice, callPrices);
  const short = calculateOptionPNL('call', strike, quantity, 'short', spotPrice, callPrices);
  assert.strictEqual(short.length, long.length);
  for (let i = 0; i < long.length; i++) {
    assert.strictEqual(short[i].price, long[i].price);
    assert.ok(
      close(short[i].pnl, -long[i].pnl),
      `at price ${long[i].price}: short ${short[i].pnl} !== -(${long[i].pnl})`,
    );
  }
});

test('8. short put is the exact inverse of the long put at every price', () => {
  const long = calculateOptionPNL('put', strike, quantity, 'long', spotPrice, putPrices);
  const short = calculateOptionPNL('put', strike, quantity, 'short', spotPrice, putPrices);
  assert.strictEqual(short.length, long.length);
  for (let i = 0; i < long.length; i++) {
    assert.strictEqual(short[i].price, long[i].price);
    assert.ok(
      close(short[i].pnl, -long[i].pnl),
      `at price ${long[i].price}: short ${short[i].pnl} !== -(${long[i].pnl})`,
    );
  }
});

// --- calculatePerpPNL -----------------------------------------------------------------
// Unlike the option premium tests, perp PnL is a direct closed-form formula that does not
// depend on another module's output, so asserting the formula directly in the test is the
// correct check here.
const entryPrice = 100;
const perpQuantity = 1;
const perpPrices = [80, 100, 120]; // loss, breakeven-at-entry, profit

test('9. long perp leverage 1 matches (price - entry) * qty * leverage', () => {
  const leverage = 1;
  const res = calculatePerpPNL(entryPrice, perpQuantity, leverage, 'long', perpPrices);
  assert.strictEqual(res.length, perpPrices.length);
  for (const { price, pnl } of res) {
    const expected = (price - entryPrice) * perpQuantity * leverage;
    assert.ok(close(pnl, expected), `at price ${price}: expected ${expected}, got ${pnl}`);
  }
});

test('10. short perp leverage 1: closed-form and inverse of long', () => {
  const leverage = 1;
  const short = calculatePerpPNL(entryPrice, perpQuantity, leverage, 'short', perpPrices);
  const long = calculatePerpPNL(entryPrice, perpQuantity, leverage, 'long', perpPrices);
  assert.strictEqual(short.length, perpPrices.length);
  for (let i = 0; i < short.length; i++) {
    const price = short[i].price;
    // closed-form check
    const expected = (entryPrice - price) * perpQuantity * leverage;
    assert.ok(close(short[i].pnl, expected), `at price ${price}: expected ${expected}, got ${short[i].pnl}`);
    // inverse-of-long check
    assert.strictEqual(short[i].price, long[i].price);
    assert.ok(close(short[i].pnl, -long[i].pnl), `at price ${price}: short ${short[i].pnl} !== -(${long[i].pnl})`);
  }
});

test('11. long perp leverage 3 applies the multiplier', () => {
  const leverage = 3;
  const res = calculatePerpPNL(entryPrice, perpQuantity, leverage, 'long', perpPrices);
  for (const { price, pnl } of res) {
    const expected = (price - entryPrice) * perpQuantity * leverage;
    assert.ok(close(pnl, expected), `at price ${price}: expected ${expected}, got ${pnl}`);
  }
});

test('12. short perp leverage 3 applies the multiplier', () => {
  const leverage = 3;
  const res = calculatePerpPNL(entryPrice, perpQuantity, leverage, 'short', perpPrices);
  for (const { price, pnl } of res) {
    const expected = (entryPrice - price) * perpQuantity * leverage;
    assert.ok(close(pnl, expected), `at price ${price}: expected ${expected}, got ${pnl}`);
  }
});

test('13. leverage 3 long PnL is exactly 3x leverage 1 long PnL at every price', () => {
  const lev1 = calculatePerpPNL(entryPrice, perpQuantity, 1, 'long', perpPrices);
  const lev3 = calculatePerpPNL(entryPrice, perpQuantity, 3, 'long', perpPrices);
  assert.strictEqual(lev3.length, lev1.length);
  for (let i = 0; i < lev1.length; i++) {
    assert.strictEqual(lev3[i].price, lev1[i].price);
    assert.ok(
      close(lev3[i].pnl, 3 * lev1[i].pnl),
      `at price ${lev1[i].price}: lev3 ${lev3[i].pnl} !== 3 * ${lev1[i].pnl}`,
    );
  }
});
