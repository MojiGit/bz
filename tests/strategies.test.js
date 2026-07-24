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

const { calculateOptionPNL, calculatePerpPNL, combinePNLCurves, findBreakevenPoints, generateDynamicPriceRange, generatePremium, roundToStrikeStep } = await import('../strategies.js');

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

// --- combinePNLCurves -----------------------------------------------------------------
// Builds a { price, pnl }[] from a list of prices and a parallel list of pnl values.
function curve(prices, pnls) {
  return prices.map((price, i) => ({ price, pnl: pnls[i] }));
}

test('14. two arrays with matching prices sum index-wise', () => {
  const prices = [90, 100, 110];
  const A = curve(prices, [-10, 0, 10]);
  const B = curve(prices, [5, 5, 5]);
  const res = combinePNLCurves([A, B]);
  assert.strictEqual(res.length, prices.length);
  for (let i = 0; i < res.length; i++) {
    assert.strictEqual(res[i].price, A[i].price); // price taken from the first array
    assert.ok(
      close(res[i].pnl, A[i].pnl + B[i].pnl),
      `at index ${i}: expected ${A[i].pnl + B[i].pnl}, got ${res[i].pnl}`,
    );
  }
});

test('15. four arrays (iron-condor-shaped) sum index-wise', () => {
  const prices = [90, 100, 110];
  const legs = [
    curve(prices, [-10, 0, 10]),
    curve(prices, [5, 5, 5]),
    curve(prices, [2, -3, 4]),
    curve(prices, [1, 1, -8]),
  ];
  const res = combinePNLCurves(legs);
  assert.strictEqual(res.length, prices.length);
  for (let i = 0; i < res.length; i++) {
    const expected = legs.reduce((sum, leg) => sum + leg[i].pnl, 0);
    assert.strictEqual(res[i].price, legs[0][i].price);
    assert.ok(close(res[i].pnl, expected), `at index ${i}: expected ${expected}, got ${res[i].pnl}`);
  }
});

test('16. empty input returns an empty array', () => {
  assert.deepStrictEqual(combinePNLCurves([]), []);
});

test('17. single-array input returns the same price/pnl at every index', () => {
  const A = curve([90, 100, 110], [-10, 0, 10]);
  const res = combinePNLCurves([A]);
  assert.strictEqual(res.length, A.length);
  for (let i = 0; i < res.length; i++) {
    assert.strictEqual(res[i].price, A[i].price);
    assert.ok(close(res[i].pnl, A[i].pnl), `at index ${i}: expected ${A[i].pnl}, got ${res[i].pnl}`);
  }
});

// Case 5 (spec): mismatched-length inputs. DOCUMENTED, ORDER-DEPENDENT behavior as it
// exists today (not a claim about what it *should* do):
//   - The loop length is governed by the FIRST array's length.
//   - If a later array is LONGER than the first, its trailing elements are silently
//     ignored (result truncated to the first array's length) — no throw.
//   - If a later array is SHORTER than the first, indexing past its end reads `undefined`
//     and the function throws a TypeError.
// This test pins that asymmetry so a future silent change is caught. This input shape does
// not occur in production (all legs share one priceRange).
test('18. mismatched-length inputs: current order-dependent behavior', () => {
  const short = curve([90, 100, 110], [1, 2, 3]);
  const long = curve([90, 100, 110, 120, 130], [10, 20, 30, 40, 50]);

  // First array shorter than the second -> truncates to the first array's length (3),
  // extra elements of the longer array are ignored, no throw.
  const res = combinePNLCurves([short, long]);
  assert.strictEqual(res.length, short.length);
  for (let i = 0; i < res.length; i++) {
    assert.strictEqual(res[i].price, short[i].price);
    assert.ok(
      close(res[i].pnl, short[i].pnl + long[i].pnl),
      `at index ${i}: expected ${short[i].pnl + long[i].pnl}, got ${res[i].pnl}`,
    );
  }

  // First array longer than a later array -> indexing past the shorter array's end throws.
  assert.throws(() => combinePNLCurves([long, short]), TypeError);
});

// --- findBreakevenPoints --------------------------------------------------------------
// Arrays are built by hand (not via calculateOptionPNL/combinePNLCurves) to keep this
// function's tests isolated from the others.
function nearAny(list, target, tol = 1) {
  return list.some(b => Math.abs(b - target) <= tol);
}

test('19. long call single breakeven within $1 of strike+premium', () => {
  // strike=100, premium=5: flat -5 below strike, rising 1:1 above it.
  const arr = curve([90, 95, 100, 105, 110], [-5, -5, -5, 0, 5]);
  const res = findBreakevenPoints(arr);
  assert.strictEqual(res.length, 1);
  assert.ok(Math.abs(res[0] - 105) <= 1, `expected ~105, got ${res[0]}`);
});

test('20. long put single breakeven within $1 of strike-premium', () => {
  // strike=100, premium=5: rising as price falls below strike, flat -5 above it.
  const arr = curve([90, 95, 100, 105, 110], [5, 0, -5, -5, -5]);
  const res = findBreakevenPoints(arr);
  assert.strictEqual(res.length, 1);
  assert.ok(Math.abs(res[0] - 95) <= 1, `expected ~95, got ${res[0]}`);
});

test('21. no breakeven when pnl is positive everywhere', () => {
  const arr = curve([90, 95, 100, 105, 110], [3, 4, 5, 4, 3]);
  assert.deepStrictEqual(findBreakevenPoints(arr), []);
});

test('22. no breakeven when pnl is negative everywhere', () => {
  const arr = curve([90, 95, 100, 105, 110], [-3, -4, -5, -4, -3]);
  assert.deepStrictEqual(findBreakevenPoints(arr), []);
});

test('23. iron-condor shape yields exactly 2 breakevens near the two crossings', () => {
  // negative low end -> positive plateau -> negative high end; crossings at 85 and 115.
  const arr = curve([80, 90, 100, 110, 120], [-5, 5, 5, 5, -5]);
  const res = findBreakevenPoints(arr);
  assert.strictEqual(res.length, 2);
  assert.ok(nearAny(res, 85), `expected a breakeven near 85, got ${JSON.stringify(res)}`);
  assert.ok(nearAny(res, 115), `expected a breakeven near 115, got ${JSON.stringify(res)}`);
});

test('24. exact-zero sample with adjacent sign change is not double-counted', () => {
  // A real sample lands exactly on 0 at price 100, preceded by a negative pnl. The function
  // pushes this crossing twice (once via the sign-change branch, once via the pnl===0
  // branch); the Set dedup must collapse it to a single breakeven. This regression-tests
  // the duplicate-push fix that was previously only verified by hand.
  const arr = curve([95, 100, 105], [-5, 0, 5]);
  const res = findBreakevenPoints(arr);
  assert.deepStrictEqual(res, [100]);
  assert.strictEqual(res.filter(b => b === 100).length, 1);
});

// --- generateDynamicPriceRange --------------------------------------------------------
test('25. round spot (100): length 41, min 80, max 120, spot present once', () => {
  const out = generateDynamicPriceRange(100);
  assert.strictEqual(out.length, 41);
  assert.strictEqual(Math.min(...out), 80);
  assert.strictEqual(Math.max(...out), 120);
  assert.strictEqual(out.filter(v => v === 100).length, 1);
});

test('26. realistic non-round spot (64962.17): endpoints, inserted spot, sorted, no dups', () => {
  const spot = 64962.17;
  const step = spot * 0.01;
  const out = generateDynamicPriceRange(spot);
  const min = Math.min(...out);
  const max = Math.max(...out);

  // Low end lands within rounding of spot*0.8.
  assert.ok(Math.abs(min - spot * 0.8) <= 1, `min ${min} not within 1 of ${spot * 0.8}`);

  // High end: DOCUMENTED actual behavior. The loop bound (`price <= spot*1.2`) with a
  // floating-point start leaves the top sample up to one full step (1% of spot) short of
  // spot*1.2 for non-round spots -- it does NOT land within $1 of 1.2x here. So we assert
  // the true envelope: max never exceeds 1.2x and is within one step below it.
  assert.ok(max <= spot * 1.2 + 1, `max ${max} exceeds spot*1.2 ${spot * 1.2}`);
  assert.ok(max >= spot * 1.2 - step - 1, `max ${max} is more than one step below spot*1.2`);

  // The "ensure current price is included" fallback: rounded spot present exactly once.
  const roundedSpot = Math.round(spot); // 64962
  assert.strictEqual(out.filter(v => v === roundedSpot).length, 1);

  // Strictly increasing => sorted ascending AND no duplicate values anywhere.
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i] > out[i - 1], `not strictly ascending at index ${i}: ${out[i - 1]} then ${out[i]}`);
  }
});

test('27. invalid spotPrice throws (0, negative, NaN)', () => {
  assert.throws(() => generateDynamicPriceRange(0));
  assert.throws(() => generateDynamicPriceRange(-5));
  assert.throws(() => generateDynamicPriceRange(NaN));
});

test('28. step sanity: spot=100 consecutive values differ by exactly 1', () => {
  const out = generateDynamicPriceRange(100);
  for (let i = 1; i < out.length; i++) {
    assert.strictEqual(out[i] - out[i - 1], 1);
  }
});

// --- roundToStrikeStep ----------------------------------------------------------------
// The live Bitcoin symbol is 'WBTC'; only the literal 'ETH' triggers the ETH ladder, so
// 'WBTC' exercises the BTC step sizes.
test('29. BTC near band rounds to nearest $500', () => {
  // spot 60000, within +-10% (diff 1713.9 <= 6000) -> $500 step.
  assert.strictEqual(roundToStrikeStep(61713.90, 60000, 'WBTC'), 61500);
});

test('30. BTC far band rounds to nearest $1,000', () => {
  // spot 60000, diff 12300 > 6000 -> $1,000 step.
  assert.strictEqual(roundToStrikeStep(72300, 60000, 'WBTC'), 72000);
});

test('31. ETH near band rounds to nearest $25', () => {
  // spot 3000, diff 13 <= 300 -> $25 step.
  assert.strictEqual(roundToStrikeStep(3013, 3000, 'ETH'), 3025);
});

test('32. ETH far band rounds to nearest $50', () => {
  // spot 3000, diff 630 > 300 -> $50 step.
  assert.strictEqual(roundToStrikeStep(3630, 3000, 'ETH'), 3650);
});

test('33. strike exactly at the +-10% threshold uses the near step', () => {
  // spot 55000, raw 60500 sits exactly at +10% (diff 5500 == 0.1 * 55000). The <= band is
  // inclusive so the near ($500) step applies -> 60500. The far ($1,000) step would instead
  // give round(60.5)*1000 = 61000, so this value proves the near step was chosen.
  assert.strictEqual(roundToStrikeStep(60500, 55000, 'WBTC'), 60500);
});

test('34. null/undefined tokenSymbol falls back to BTC steps without throwing', () => {
  assert.strictEqual(roundToStrikeStep(61713.90, 60000, null), 61500);
  assert.strictEqual(roundToStrikeStep(61713.90, 60000, undefined), 61500);
});

test('35. unrecognized tokenSymbol (SOL) also falls back to BTC steps', () => {
  // Everything but literal 'ETH' gets BTC steps: SOL matches WBTC, not ETH.
  assert.strictEqual(roundToStrikeStep(61713.90, 60000, 'SOL'), 61500);
  assert.strictEqual(
    roundToStrikeStep(61713.90, 60000, 'SOL'),
    roundToStrikeStep(61713.90, 60000, 'WBTC'),
  );
});
