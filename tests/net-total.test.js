import test from 'node:test';
import assert from 'node:assert';

/*
 * === WHY THIS FILE EXISTS ===
 *
 * The net debit/credit bar (F308) tells the user what a whole strategy costs or pays to enter.
 * It went through two wrong formulas before landing:
 *
 *   1. First try used ask for BUY, bid for SELL — correct model, but the user reported a
 *      buy+sell of the "same" option netting to a large number instead of ~the spread.
 *   2. "Fix" switched to mark price for both sides. This LOOKED consistent with the per-leg
 *      cards (which show mark) and made a same-venue round-trip net to zero — but it was worse:
 *      best-execution routes a SELL leg to whichever venue has the highest BID, and a DEX
 *      (Derive) can quote a high bid with a mark far below it. Using mark then produced a
 *      phantom ~$700 net on a trade the user knew was ~$40.
 *   3. Reverted to the ask/bid execution model, which is the correct one: you pay the ask to
 *      buy and receive the bid to sell, full stop.
 *
 * So this file pins the execution-cost model against exactly the confusion that produced the
 * bad fixes. The canonical case (B/S below) is the user's own report: BUY a call at ask 780,
 * SELL the same strike on another venue at bid 820 → +40 NET CREDIT, never 700. It also guards
 * the properties that the mark-based formula silently violated: the net must depend on ask/bid
 * (not mark) whenever a market exists on that side, and mark is used only as a fallback when a
 * side is empty (bid/ask == 0).
 *
 * The formula under test is computeNetTotal(instruments, quotesByLeg) in builder.js, exported
 * pure precisely so this can exercise it without booting the DOM/render path.
 */

// --- minimal DOM stub: builder.js touches the DOM at import time -------------------------
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
const ChartStub = function () { this.destroy = () => {}; };
ChartStub.register = function () {};
ChartStub.defaults = { font: {}, plugins: { legend: { labels: {} } } };
globalThis.Chart = ChartStub;
globalThis.fetch = async () => ({ json: async () => ({ 'wrapped-bitcoin': { usd: 64519 } }) });

const { computeNetTotal } = await import('../builder.js');

// --- helpers ----------------------------------------------------------------------------
// A quote as stored in quotesByLeg[inst.id]: the resolved single-venue quote for that leg.
const quote = (bid, ask, mark = (bid + ask) / 2) => ({ bid, ask, mark });
// Build the (instruments, quotesByLeg) pair the formula consumes.
function scenario(legs) {
  const instruments = legs.map((l, i) => ({ id: `L${i}`, position: l.position, size: l.size ?? 1 }));
  const quotesByLeg = {};
  legs.forEach((l, i) => { quotesByLeg[`L${i}`] = l.q; });
  return [instruments, quotesByLeg];
}

// =========================================================================================
test('N1. the reported case: buy call at ask 780, sell same strike at bid 820 → +40 credit', () => {
  // This is the exact trade the user described. The broken mark-based formula returned ~700
  // because the SELL leg routed to a DEX with bid 820 but mark ~100; the correct execution
  // model uses the bid the user is actually receiving.
  const [insts, q] = scenario([
    { position: 'long',  q: quote(760, 780, 770) }, // buy: pays ask 780
    { position: 'short', q: quote(820, 840, 100) }, // sell: receives bid 820 (mark 100 is a trap)
  ]);
  const r = computeNetTotal(insts, q);
  assert.strictEqual(r.debit, 780);
  assert.strictEqual(r.credit, 820);
  assert.strictEqual(r.net, 40);
  assert.strictEqual(r.isCredit, true);
  assert.strictEqual(r.missing, 0);
  assert.notStrictEqual(Math.abs(r.net), 700, 'the mark-based regression is back');
});

// =========================================================================================
test('N2. round-trip on ONE venue nets to exactly minus the bid-ask spread', () => {
  // Same instrument, same venue, bought and sold: you pay ask and receive bid, so the cost is
  // the spread. Not zero — zero would mean ignoring the spread, which is a real cost.
  const [insts, q] = scenario([
    { position: 'long',  q: quote(800, 810) }, // pays 810
    { position: 'short', q: quote(800, 810) }, // receives 800
  ]);
  const r = computeNetTotal(insts, q);
  assert.strictEqual(r.net, -10, 'round-trip net should be -(ask - bid) = -10');
  assert.strictEqual(r.isCredit, false); // NET DEBIT of 10
});

// =========================================================================================
test('N3. size scales debit and credit linearly', () => {
  const [insts, q] = scenario([
    { position: 'long',  size: 3, q: quote(100, 120) }, // 120 * 3 = 360 out
    { position: 'short', size: 2, q: quote(200, 220) }, // 200 * 2 = 400 in
  ]);
  const r = computeNetTotal(insts, q);
  assert.strictEqual(r.debit, 360);
  assert.strictEqual(r.credit, 400);
  assert.strictEqual(r.net, 40);
});

// =========================================================================================
test('N4. a bull put spread collects a net credit; a long strangle pays a net debit', () => {
  // Bull put spread: sell higher-strike put (rich), buy lower-strike put (cheap) → net credit.
  const [bpsInsts, bpsQ] = scenario([
    { position: 'short', q: quote(820, 840) }, // sell put: +820
    { position: 'long',  q: quote(180, 200) }, // buy put:  -200
  ]);
  const bps = computeNetTotal(bpsInsts, bpsQ);
  assert.strictEqual(bps.net, 620);
  assert.strictEqual(bps.isCredit, true);

  // Long strangle: buy a call and buy a put → you pay both asks, always a debit.
  const [lsInsts, lsQ] = scenario([
    { position: 'long', q: quote(280, 300) }, // -300
    { position: 'long', q: quote(230, 250) }, // -250
  ]);
  const ls = computeNetTotal(lsInsts, lsQ);
  assert.strictEqual(ls.net, -550);
  assert.strictEqual(ls.isCredit, false);
});

// =========================================================================================
test('N5. legs without a usable quote are counted as missing and excluded from the net', () => {
  const [insts, q] = scenario([
    { position: 'long',  q: quote(100, 120) },                 // counted: -120
    { position: 'short', q: { error: 'No instrument found' } },// missing
    { position: 'long',  q: { bid: 0, ask: 0, mark: 0 } },     // missing (mark 0 → no market)
  ]);
  const r = computeNetTotal(insts, q);
  assert.strictEqual(r.quoted, 1);
  assert.strictEqual(r.missing, 2);
  assert.strictEqual(r.net, -120, 'only the one quotable leg should reach the net');
});

// =========================================================================================
test('N6. net uses bid/ask, not mark — mark cannot move the result while a market exists', () => {
  // Two identical scenarios except for a wildly different mark on each leg. If the formula ever
  // regresses to using mark, these two nets diverge; with the execution model they are equal.
  const legsA = [
    { position: 'long',  q: quote(500, 520, 510) },
    { position: 'short', q: quote(600, 620, 610) },
  ];
  const legsB = [
    { position: 'long',  q: quote(500, 520, 50) },   // mark trashed
    { position: 'short', q: quote(600, 620, 9999) }, // mark trashed
  ];
  const a = computeNetTotal(...scenario(legsA));
  const b = computeNetTotal(...scenario(legsB));
  assert.strictEqual(a.net, b.net, 'net changed when only mark changed — formula is using mark');
  assert.strictEqual(a.net, 600 - 520); // credit 600 - debit 520 = 80
});

// =========================================================================================
test('N7. mark is used only as a fallback when that side has no market (bid/ask == 0)', () => {
  // BUY leg with no asks (ask 0) falls back to mark for the debit; SELL leg with no bids
  // (bid 0) falls back to mark for the credit. This is the only place mark is allowed in.
  const [insts, q] = scenario([
    { position: 'long',  q: { bid: 300, ask: 0, mark: 330 } }, // no ask → pay mark 330
    { position: 'short', q: { bid: 0, ask: 400, mark: 360 } }, // no bid → receive mark 360
  ]);
  const r = computeNetTotal(insts, q);
  assert.strictEqual(r.debit, 330);
  assert.strictEqual(r.credit, 360);
  assert.strictEqual(r.net, 30);
});

// =========================================================================================
test('N8. no quotable legs → net 0, nothing counted (bar is hidden by the caller)', () => {
  const [insts, q] = scenario([
    { position: 'long',  q: { error: 'In maintenance' } },
    { position: 'short', q: null },
  ]);
  const r = computeNetTotal(insts, q);
  assert.strictEqual(r.quoted, 0);
  assert.strictEqual(r.net, 0);
  assert.strictEqual(r.missing, 2);
});
