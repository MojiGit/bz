import test from 'node:test';
import assert from 'node:assert';

/*
 * === WHY THIS FILE EXISTS ===
 *
 * generatePremium() is a hand-picked curve, not a real pricing model — nothing stops a future
 * edit from picking a shape that LOOKS reasonable leg-by-leg but lets some COMBINATION of legs
 * be priced into a riskless profit. That's exactly what happened here: a Gaussian hump was
 * monotonic in strike and kept every single vertical spread under its own width, yet a long
 * iron condor/butterfly (short body, long wings) still collected more net credit than its own
 * maximum possible loss — a free-money chart, because a hump is concave right at its own peak,
 * and no real option chain's premium curve can be.
 *
 * These tests encode the no-arbitrage properties a strike-indexed premium curve must have,
 * independent of whatever formula happens to be inside generatePremium today:
 *
 *   1. Monotonicity  — call premium non-increasing in strike, put premium non-decreasing.
 *   2. Spread bound  — no single vertical (bull/bear, call/put) spread can cost more than the
 *                       distance between its strikes, or less than zero.
 *   3. Convexity     — premium(K) doesn't dip below the chord between any two other strikes.
 *                       This is the property monotonicity + the spread bound alone do NOT
 *                       imply, and it's what actually rules out the condor/butterfly failure.
 *   4. Condor/butterfly bound — direct test of the failure mode itself: for any short-body,
 *                       long-wings combination, net credit collected can never exceed the
 *                       larger wing's width (a riskless profit otherwise).
 *   5. Put-call parity — Call(K) - Put(K) == spot - K exactly. A separate classic arbitrage
 *                       (a synthetic conversion) if this ever drifts.
 *
 * Property (4) is checked directly against the two shipped templates that actually exposed the
 * bug (Iron Condor, Iron Butterfly), AND against a swept grid of hypothetical condors/
 * butterflies at spacings the builder's strike ladder could produce — so this fails on the
 * bug's underlying cause, not just on the two configurations that happened to surface it.
 */

function makeEl() {
  return {
    innerHTML: '', textContent: '', value: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {},
    remove() {}, insertAdjacentHTML() {}, setAttribute() {}, getAttribute() { return ''; },
    scrollIntoView() {}, getContext() { return null; },
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
  };
}
globalThis.document = {
  getElementById() { return makeEl(); }, querySelector() { return makeEl(); },
  querySelectorAll() { return []; }, createElement() { return makeEl(); }, addEventListener() {},
};
globalThis.window = { 'chartjs-plugin-annotation': {} };
const ChartStub = function () {};
ChartStub.register = function () {};
globalThis.Chart = ChartStub;

const { generatePremium } = await import('../strategies.js');

// --- Fixtures ---------------------------------------------------------------------------
// Round, non-round, BTC-scale and ETH-scale spots, so nothing here is an artifact of one
// convenient number.
const SPOTS = [100, 3000.5, 64519.37, 1.2345];

// Absolute tolerance scales with spot: doubles carry ~15-16 significant digits, so noise at
// BTC-scale (10^4-10^5) is naturally larger in absolute terms than at spot=100.
const tol = spot => Math.max(1e-6, spot * 1e-9);

function strikeGrid(spot) {
  // 61 points spanning 50%-150% of spot — wider than the app's ±20% chart range, so this
  // also covers strikes a user could type directly, not just what's on the visible chart.
  const strikes = [];
  for (let i = 0; i <= 60; i++) strikes.push(spot * (0.5 + i / 60));
  return strikes;
}

// --- 1. Monotonicity ----------------------------------------------------------------------
test('call premium is non-increasing in strike, put premium is non-decreasing', () => {
  for (const spot of SPOTS) {
    const eps = tol(spot);
    let prevCall = Infinity;
    let prevPut = -Infinity;
    for (const k of strikeGrid(spot)) {
      const call = generatePremium(k, 'call', spot);
      const put = generatePremium(k, 'put', spot);
      assert.ok(call <= prevCall + eps,
        `spot ${spot}: call premium rose at strike ${k} (${prevCall} -> ${call})`);
      assert.ok(put >= prevPut - eps,
        `spot ${spot}: put premium fell at strike ${k} (${prevPut} -> ${put})`);
      prevCall = call;
      prevPut = put;
    }
  }
});

// --- 2. No vertical spread costs more than its own width ----------------------------------
test('no vertical spread (call or put) is priced outside [0, strike width]', () => {
  for (const spot of SPOTS) {
    const eps = tol(spot);
    const grid = strikeGrid(spot);
    for (let i = 0; i < grid.length; i++) {
      for (let j = i + 1; j < grid.length; j++) {
        const [k1, k2] = [grid[i], grid[j]];
        const width = k2 - k1;

        // Bear call spread: short K1 call, long K2 call. Credit = C(K1) - C(K2).
        const callCredit = generatePremium(k1, 'call', spot) - generatePremium(k2, 'call', spot);
        assert.ok(callCredit >= -eps && callCredit <= width + eps,
          `spot ${spot}: call spread ${k1}-${k2} credit ${callCredit} outside [0, ${width}]`);

        // Bull put spread: short K2 put, long K1 put. Credit = P(K2) - P(K1).
        const putCredit = generatePremium(k2, 'put', spot) - generatePremium(k1, 'put', spot);
        assert.ok(putCredit >= -eps && putCredit <= width + eps,
          `spot ${spot}: put spread ${k1}-${k2} credit ${putCredit} outside [0, ${width}]`);
      }
    }
  }
});

// --- 3. Convexity -------------------------------------------------------------------------
// premium(K) must never dip below the straight line joining two other strikes' premiums —
// equivalently, the slope between consecutive strike pairs must never decrease for calls
// moving right (or increase for puts). This is what monotonicity + the spread bound alone do
// NOT guarantee, and it's the actual property the condor/butterfly bug violated.
test('premium is convex in strike (never dips below the chord between two other strikes)', () => {
  for (const spot of SPOTS) {
    const eps = tol(spot) * 10; // chord test accumulates more floating error than a single diff
    const grid = strikeGrid(spot);
    for (const type of ['call', 'put']) {
      for (let i = 0; i < grid.length - 2; i++) {
        for (let step = 2; i + step < grid.length; step += 5) {
          const k1 = grid[i], k2 = grid[i + Math.floor(step / 2)], k3 = grid[i + step];
          const p1 = generatePremium(k1, type, spot);
          const p2 = generatePremium(k2, type, spot);
          const p3 = generatePremium(k3, type, spot);
          const t = (k2 - k1) / (k3 - k1);
          const chord = p1 + t * (p3 - p1);
          assert.ok(p2 <= chord + eps,
            `spot ${spot} ${type}: premium(${k2})=${p2} above the ${k1}-${k3} chord (${chord}) ` +
            '— curve is locally concave, which is what enables a riskless spread');
        }
      }
    }
  }
});

// --- 4a. The two shipped templates that originally exposed the bug ------------------------
// Direct regression guard, independent of the general sweep below: if either of these ever
// goes negative again, it's the exact original failure reappearing.
test('Iron Condor and Iron Butterfly (as shipped) have non-negative max loss', () => {
  const spot = 100;

  // Iron Condor: short put 0.95, long put 0.90, short call 1.05, long call 1.10.
  {
    const putCredit = generatePremium(95, 'put', spot) - generatePremium(90, 'put', spot);
    const callCredit = generatePremium(105, 'call', spot) - generatePremium(110, 'call', spot);
    const maxLoss = Math.max(5, 5) - (putCredit + callCredit);
    assert.ok(maxLoss >= -tol(spot),
      `Iron Condor max loss is ${maxLoss} — negative means a riskless profit`);
  }

  // Iron Butterfly: short put 1.00, long put 0.85, short call 1.00, long call 1.15.
  {
    const putCredit = generatePremium(100, 'put', spot) - generatePremium(85, 'put', spot);
    const callCredit = generatePremium(100, 'call', spot) - generatePremium(115, 'call', spot);
    const maxLoss = Math.max(15, 15) - (putCredit + callCredit);
    assert.ok(maxLoss >= -tol(spot),
      `Iron Butterfly max loss is ${maxLoss} — negative means a riskless profit`);
  }
});

// --- 4b. General condor/butterfly sweep ----------------------------------------------------
// A put spread only ever loses when price falls; a call spread only ever loses when price
// rises — never both at the same expiration price. So the worst case for the combined position
// is whichever single wing is breached, not both wings' losses added together — the combined
// position can lose at most max(putWidth, callWidth), no matter how the two wings are priced.
// Total credit collected up front (both wings) must therefore never exceed that.
//
// bodyHalfWidth = 0 is a straddle body (butterfly); > 0 leaves a flat zero-PnL zone (condor).
test('short-body/long-wings combinations never yield a negative max loss, across realistic spacings', () => {
  const wingWidths = [0.01, 0.02, 0.05, 0.1, 0.15, 0.2]; // fraction of spot
  const bodyHalfWidths = [0, 0.02, 0.05, 0.1]; // fraction of spot; 0 == butterfly

  for (const spot of SPOTS) {
    for (const wingFrac of wingWidths) {
      for (const bodyFrac of bodyHalfWidths) {
        const putShortK = spot * (1 - bodyFrac);
        const putLongK = putShortK - spot * wingFrac;
        const callShortK = spot * (1 + bodyFrac);
        const callLongK = callShortK + spot * wingFrac;

        const putCredit = generatePremium(putShortK, 'put', spot) - generatePremium(putLongK, 'put', spot);
        const callCredit = generatePremium(callShortK, 'call', spot) - generatePremium(callLongK, 'call', spot);
        const totalCredit = putCredit + callCredit;

        const putWidth = putShortK - putLongK;
        const callWidth = callLongK - callShortK;
        const maxLoss = Math.max(putWidth, callWidth) - totalCredit;

        assert.ok(maxLoss >= -tol(spot),
          `spot ${spot}, wing ${wingFrac}, body ${bodyFrac}: max loss ${maxLoss} is negative ` +
          `(put strikes ${putLongK}/${putShortK}, call strikes ${callShortK}/${callLongK})`);
      }
    }
  }
});

// --- 5. Put-call parity ---------------------------------------------------------------------
test('put-call parity holds exactly: Call(K) - Put(K) == spot - K', () => {
  for (const spot of SPOTS) {
    for (const k of strikeGrid(spot)) {
      const call = generatePremium(k, 'call', spot);
      const put = generatePremium(k, 'put', spot);
      const expected = spot - k;
      assert.ok(Math.abs((call - put) - expected) <= tol(spot),
        `spot ${spot}, strike ${k}: Call-Put = ${call - put}, expected ${expected}`);
    }
  }
});
