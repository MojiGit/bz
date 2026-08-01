/*
=== PNL Calculation Functions ===
These functions calculate PNL for different trading strategies, including spot, perpetual futures, and options.
*/
import { currentPrice, selectedTokenSymbol, priceRange as importedPriceRange } from "./mvp.js";

// Perpetual PNL
export function calculatePerpPNL(entryPrice, quantity, leverage = 1, position = 'long', priceRange = importedPriceRange) {
  return priceRange.map(currentPrice => {
    if(position === 'short'){
      const pnl = (entryPrice - currentPrice) * quantity * leverage;
      return { price: currentPrice, pnl};
    }
    const pnl = (currentPrice - entryPrice) * quantity * leverage;
    return { price: currentPrice, pnl };
  });
}

// Option PNL (Call or Put)
// tierRatioOverride: see generatePremium — lets a caller price the leg's tier off its designed
// ratio while the (rounded) strikePrice still drives the payoff. Null/omitted = unchanged.
export function calculateOptionPNL(optionType, strikePrice, quantity = 1, position = 'long', spotPrice = currentPrice, priceRange = importedPriceRange, tierRatioOverride = null) {
  return priceRange.map(currentPrice => {
    let intrinsicValue;
    if (optionType === 'call') {
      intrinsicValue = Math.max(currentPrice - strikePrice, 0);
    } else if (optionType === 'put') {
      intrinsicValue = Math.max(strikePrice - currentPrice, 0);
    } else {
      throw new Error("Invalid option type");
    }

    const totalPNL = (intrinsicValue - generatePremium(strikePrice, optionType, spotPrice, tierRatioOverride)) * quantity;
    if (position === 'short') {
      // If the position is short, we invert the PNL
      return { price: currentPrice, pnl: -totalPNL };
    }
    return { price: currentPrice, pnl: totalPNL };
  });
}

// Combine multiple PNL datasets into a single compound curve
export function combinePNLCurves(pnlArrays) {
  if (pnlArrays.length === 0) return [];

  const length = pnlArrays[0].length;
  const combined = [];

  for (let i = 0; i < length; i++) {
    let totalPNL = 0;
    let pricePoint = pnlArrays[0][i].price; // Assumes all arrays use the same price points

    for (let j = 0; j < pnlArrays.length; j++) {
      totalPNL += pnlArrays[j][i].pnl;
    }

    combined.push({ price: pricePoint, pnl: totalPNL });
  }

  return combined;
}

// Find breakeven points in a PNL array
export function findBreakevenPoints(pnlArray) {
  const breakevens = [];
  for (let i = 1; i < pnlArray.length; i++) {
    const prev = pnlArray[i - 1];
    const curr = pnlArray[i];
    // Busca un cruce de signo (de negativo a positivo o viceversa)
    if ((prev.pnl < 0 && curr.pnl >= 0) || (prev.pnl > 0 && curr.pnl <= 0)) {
      // Interpolación lineal para mayor precisión
      const ratio = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
      const breakevenPrice = prev.price + (curr.price - prev.price) * ratio;
      breakevens.push(Math.round(breakevenPrice));
    }
    // También puedes agregar el caso exacto de PNL = 0
    if (curr.pnl === 0) {
      breakevens.push(Math.round(curr.price));
    }
  }
  return [...new Set(breakevens)];
}

// Generate price range based on current price
export function generateDynamicPriceRange(spotPrice = currentPrice) {
  if (!spotPrice || isNaN(spotPrice) || spotPrice <= 0) {
    throw new Error('Invalid currentPrice for price range');
  }
  const roundedCurrent = Math.round(spotPrice);
  const min = spotPrice * 0.8;
  const max = spotPrice * 1.2;
  const step = spotPrice * 0.01;
  const prices = [];
  for (let price = min; price <= max; price += step) {
    prices.push(Math.round(price));
  }
  // Ensure current price is included in the range
  if (!prices.includes(roundedCurrent)) {
    prices.push(roundedCurrent);
    prices.sort((a, b) => a - b); // Sort to maintain order
  }
  return prices;
}

// Premium as a single smooth, convex curve in strike — a "rounded corner" on intrinsic value
// itself, rather than intrinsic plus a separate hump of extrinsic value stacked on top.
//
// A hump (Gaussian or otherwise) is inherently CONCAVE right at its own peak — any function
// that rises then falls has an interior maximum, which a convex function can never have. That
// concavity is what let a long iron condor/butterfly collect more net credit than its own
// maximum possible loss: a riskless arbitrage no real market allows (see tests/arbitrage.test.js
// for why — real listed markets enforce exactly this "combined credit can't exceed max single-
// wing width" bound as a live sanity check on option chains). Monotonicity (previous step) rules
// out premium rising with strike; convexity is the strictly stronger property that also rules
// out THIS failure mode, and every other multi-leg combination that isn't a plain vertical
// spread.
//
// smoothedIntrinsic(x, spotPrice) = (x + sqrt(x^2 + eps^2)) / 2 is the standard hyperbolic
// smoothing of max(x, 0): as eps -> 0 it converges to intrinsic value exactly, and for any
// eps > 0 it is PROVABLY convex everywhere —
//   d^2/dx^2 = eps^2 / (2 * (x^2 + eps^2)^1.5) > 0 for every x
// — with no calibration against particular strikes required, unlike the Gaussian's margin.
// It also keeps every property already relied on: slope stays in (-1, 0) for calls / (0, 1)
// for puts (so a single vertical spread still can't cost more than its width), premium(x=0) is
// still EXTRINSIC_ATM_RATE * spotPrice (continuous with the previous two steps' ATM value), and
// call/put parity — Call(K) - Put(K) = S - K — holds exactly (both formulas share the same
// sqrt(x^2+eps^2) term with x negated, which cancels in the difference).
const EXTRINSIC_ATM_RATE = 0.08;

function smoothedIntrinsic(x, spotPrice) {
  const eps = 2 * EXTRINSIC_ATM_RATE * spotPrice; // premium(x=0) == eps/2 == EXTRINSIC_ATM_RATE * spotPrice
  return (x + Math.sqrt(x * x + eps * eps)) / 2;
}

// tierRatioOverride: same role as before — price the leg off the moneyness it was DESIGNED at
// (strategiesIdMap's ratio) rather than the moneyness its rounded, tradeable strike happens to
// land on, so a template leg's premium can't drift with the strike ladder. It no longer exists
// to dodge a pricing cliff (continuity means there isn't one); it's a precision nicety now, not
// a correctness requirement the way it was for the old tier table.
export function generatePremium(strike, position, spotPrice = currentPrice, tierRatioOverride = null) {
  const ratio = tierRatioOverride ?? strike / spotPrice;
  const moneyness = spotPrice * (1 - ratio); // > 0 the more ITM a call is; < 0 the more ITM a put is

  if (position === 'call') {
    return smoothedIntrinsic(moneyness, spotPrice);
  } else if (position === 'put') {
    return smoothedIntrinsic(-moneyness, spotPrice);
  } else {
    throw new Error("Invalid position type. Use 'call' or 'put'.");
  }
}

// Round a raw strike to the nearest round-dollar step on a per-token ladder. The step
// tightens near the money and widens in the wings: BTC uses $500 within ±10% of spot and
// $1,000 beyond it; ETH uses $25 within ±10% and $50 beyond. tokenSymbol can be
// null/undefined before the first price resolves, so it falls back to the BTC ladder rather
// than throwing.
export function roundToStrikeStep(rawStrike, spotPrice, tokenSymbol) {
  // Unrecognized/null symbols silently default to the BTC steps — intentional while only WBTC/ETH exist; revisit if a third token is ever added.
  const isEth = tokenSymbol === 'ETH';
  const nearStep = isEth ? 25 : 500;
  const farStep = isEth ? 50 : 1000;
  const withinBand = Math.abs(rawStrike - spotPrice) <= 0.1 * spotPrice;
  const step = withinBand ? nearStep : farStep;
  return Math.round(rawStrike / step) * step;
}

// Normalize a leg/component from either schema into one common absolute-value shape.
// strategiesIdMap components (this file) store strike/entry as a ratio of spot, converted
// at point of use. builder.js instruments store strike/entry as absolute dollars already,
// and are distinguishable by having an `id` field (assigned at creation for DOM binding),
// which strategiesIdMap components never have.
export function normalizeLeg(component, spotPrice) {
  const assetType = component.asset;
  const isAbsolute = component.id !== undefined;
  const rawStrikeOrEntry = assetType === 'opt' ? component.strike : component.entry;

  return {
    assetType,
    strikeOrEntryAbsolute: isAbsolute ? rawStrikeOrEntry : rawStrikeOrEntry * spotPrice,
    size: component.size,
    leverage: assetType === 'perp' ? component.leverage : 1,
    position: component.position === 'short' ? 'short' : 'long',
    optionType: assetType === 'opt' ? component.type : null,
  };
}

// === default strategy ===
export async function defaultStrategy(strike = currentPrice, size = 1, lineColor = '#D8DDEF'){

  const pnlData = calculateOptionPNL('call', strike, size, 'long');
  const breakeven = findBreakevenPoints(pnlData)

  return {
    datasets: [
      {data: pnlData, color: lineColor, bgColor: 'rgba(183, 184, 183, 0.16)'},
    ],
    strikePrices: [Math.round(strike)],
    breakeven: breakeven,
  };
}

// Visual styling for one leg line, shared by the template render (generateStrategy) and the
// builder render (charts.updateBuilderChart). Following the reference prototype, every
// individual leg is a uniform light-gray dotted line regardless of type/position — color
// is reserved exclusively for the consolidated PnL curve. Strike/entry is conveyed via the
// legend label (legLabel), not the line style. Args kept for call-site compatibility.
export function legLineStyle(assetType, optionType, position) {
  return { color: '#D8DDEF', borderDash: [2, 2] };
}

// Legend label for one leg, including its absolute strike (options) or entry (perps).
// e.g. "Short Put 64,000", "Long Call 68,000", "Long Perp 65,000".
export function legLabel(assetType, optionType, position, strikeOrEntry) {
  const pos = position === 'short' ? 'Short' : 'Long';
  const kind = assetType === 'perp' ? 'Perp' : (optionType === 'call' ? 'Call' : 'Put');
  const price = Math.round(strikeOrEntry).toLocaleString('en-US');
  return `${pos} ${kind} ${price}`;
}

export async function generateStrategy(strategyId){
  let strategy = {datasets: [], strikePrices: [], breakeven: null};
  let combined = [];
  let pnl;

  for (const inst of strategiesIdMap[strategyId].components){
    let strikeOrEntryAbsolute;
    if (inst.asset === 'opt'){
      strikeOrEntryAbsolute = roundToStrikeStep(inst.strike * currentPrice, currentPrice, selectedTokenSymbol);
      // Payoff uses the rounded, tradeable strike; the premium tier is decided by the leg's
      // designed ratio so rounding can't push it across a boundary (see generatePremium).
      pnl = calculateOptionPNL(inst.type, strikeOrEntryAbsolute, inst.size, inst.position, undefined, undefined, inst.strike);
      strategy.strikePrices.push(strikeOrEntryAbsolute);
    } else if (inst.asset === 'perp'){
      strikeOrEntryAbsolute = roundToStrikeStep(inst.entry * currentPrice, currentPrice, selectedTokenSymbol);
      pnl = calculatePerpPNL(strikeOrEntryAbsolute, inst.size, inst.leverage, inst.position);
      strategy.strikePrices.push(strikeOrEntryAbsolute);
    }

    const style = legLineStyle(inst.asset, inst.type, inst.position);
    let data = {
      label: legLabel(inst.asset, inst.type, inst.position, strikeOrEntryAbsolute),
      data: pnl,
      color: style.color,
      bgColor: 'rgba(255, 107, 107, 0)',
      borderDash: style.borderDash
    };

    combined.push(pnl);
    strategy.datasets.push(data);
    
  }

  let combinedPnl = combinePNLCurves(combined);

  let compoundPnl = {
    label: 'PnL',
    data: combinedPnl,
    color: 'blue',
    bgColor:'rgba(0, 0, 255, 0.1)'
  };

  strategy.datasets.push(compoundPnl);
  strategy.breakeven = findBreakevenPoints(combinedPnl);

  return strategy;

}

// Mapping from strategy ID to strategy functions
export const strategiesIdMap = {
  'custom':{
    name: 'Custom',
    description: 'Design your strategy from scratch by adding assets and defining their parameters.',
    components: [],
    sentiment: 'neutral',
  },

  'coveredPut':{
    name: 'Covered Put',
    description:'Is a bearish income strategy, where you receive a substantial net credit for shorting both the put and the stock simultaneously to create the spread. ',
    maxProfit:'Capped',
    maxLoss:'Uncapped',
    strategyType:'Income',
    sentiment:'bearish',
    proficiency: 'Advance',
    components: [
      {asset: 'perp', entry: 1, size: 1, leverage: 1, position: 'short'},
      {asset: 'opt', type: 'put', strike: 0.95, size: 1, position: 'short'}
    ],
  },
  
  'longIronCondor':{
    name: 'Long Iron Condor',
    description: 'It is the combination of a Bull Put Spread and a Bear Call Spread. The higher strike put is lower than the lower strike call in order to create the condor shape',
    maxProfit:'Capped',
    maxLoss:'Capped',
    strategyType:'Income',
    sentiment:'neutral',
    proficiency: 'Intermediate',
    components: [
      {asset: 'opt', type: 'put', strike: 0.95, size: 1, position: 'short'},
      {asset: 'opt', type: 'put', strike: 0.9, size: 1},
      {asset: 'opt', type: 'call', strike: 1.05, size: 1, position: 'short'},
      {asset: 'opt', type: 'call', strike: 1.1, size: 1}
    ],
  },

  'longIronButterfly':{
    name: 'Long Iron Butterfly',
    description: 'The combination of a Bull Put Spread and a Bear Call Spread. The higher strike put shares the same strike as the lower strike call to create the butterfly shape',
    maxProfit:'Capped',
    maxLoss:'Capped',
    strategyType:'Income',
    sentiment:'neutral',
    proficiency:'Intermediate',
    components: [
      {asset: 'opt', type: 'put', strike: 1, size: 1, position: 'short'},
      {asset: 'opt', type: 'put', strike: 0.85, size: 1},
      {asset: 'opt', type: 'call', strike: 1, size: 1, position: 'short'},
      {asset: 'opt', type: 'call', strike: 1.15, size: 1}
    ],
  },

  'strangle': {
    name: 'Strangle',
    description:'We simply buy lower strike puts and higher strike calls with the same expiration date so that we can profit from the stock soaring up or plummeting down.',
    maxProfit: 'Uncapped',
    maxLoss: 'Capped',
    strategyType: 'Capital Gain',
    sentiment: 'neutral',
    proficiency: 'Intermediate',
    components: [
      {asset: 'opt', type: 'put', strike: 0.95, size: 1},
      {asset: 'opt', type: 'call', strike: 1.05, size: 1}
    ],
  },

  'bull-put-spread': {
    name: 'Bull Put Spread',
    description:'Protect the downside of a Naked Put by buying a lower strike put to insure the one you sold',
    maxProfit: 'Capped',
    maxLoss: 'Capped',
    strategyType: 'Income',
    sentiment: 'bullish',
    proficiency: 'Intermediate',
    components: [
      {asset: 'opt', type: 'put', strike: 1, size: 1, position: 'short'},
      {asset: 'opt', type: 'put', strike: 0.9, size: 1}
    ],
  },

  'bear-call-spread': {
    name: 'Bear Call Spread',
    description:'The concept is to protect the downside of a Naked Call by buying a higher strike call to insure the one you sold.',
    maxProfit: 'Capped',
    maxLoss: 'Capped',
    strategyType: 'Income',
    sentiment: 'bearish',
    proficiency: 'Intermediate',
    components: [
      {asset: 'opt', type: 'call', strike: 1, size: 1, position: 'short'},
      {asset: 'opt', type: 'call', strike: 1.1, size: 1}
    ],
  },

  'covered-call': {
    name: 'Covered Call',
    description: 'The concept is that in owning the stock, you then sell an Out of the Money call option on a monthly basis as a means of collecting rent while you own the stock',
    maxProfit: 'Capped',
    maxLoss: 'Uncapped',
    strategyType: 'Income',
    sentiment: 'bullish',
    proficiency: 'Novice',
    components: [
      {asset: 'perp', entry: 1, size: 1, leverage: 1, position: 'long'},
      {asset: 'opt', type: 'call', strike: 1.1, size: 1, position: 'short'}
    ],
  },
  
  // Add more strategies
};
