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
export function calculateOptionPNL(optionType, strikePrice, quantity = 1, position = 'long', spotPrice = currentPrice, priceRange = importedPriceRange) {
  return priceRange.map(currentPrice => {
    let intrinsicValue;
    if (optionType === 'call') {
      intrinsicValue = Math.max(currentPrice - strikePrice, 0);
    } else if (optionType === 'put') {
      intrinsicValue = Math.max(strikePrice - currentPrice, 0);
    } else {
      throw new Error("Invalid option type");
    }

    const totalPNL = (intrinsicValue - generatePremium(strikePrice, optionType, spotPrice)) * quantity;
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

// Tier boundaries are compared on the strike/spot RATIO, not on absolute dollars. Template
// strikes are authored as exact multiples of spot and so land exactly on a boundary, while
// the builder rounds its strikes to whole dollars (populateStrikeOptions) — comparing
// absolutes made that sub-dollar difference flip the tier, and the tiers are 2x apart, so
// the same leg silently priced at double or half. TIER_EPSILON is far wider than dollar
// rounding noise at realistic spot prices and far narrower than one strike-ladder step.
const TIER_EPSILON = 0.001;

export function generatePremium(strike, position, spotPrice = currentPrice) {
  const nearRate = 0.08;
  const midRate = 0.04;
  const farRate = 0.02;

  const ratio = strike / spotPrice;
  const isFar = ratio <= 0.9 + TIER_EPSILON || ratio >= 1.1 - TIER_EPSILON;
  const isMid = ratio <= 0.95 + TIER_EPSILON || ratio >= 1.05 - TIER_EPSILON;

  if (position === 'call') {
    if (isFar) {
      return Math.max(spotPrice - strike, 0) + strike * farRate;
    }
    if (isMid) {
      return Math.max(spotPrice - strike, 0) + strike * midRate;
    }
    return strike * nearRate;
  } else if (position === 'put') {
    if (isFar) {
      return Math.max(strike - spotPrice, 0) + strike * farRate;
    }
    if (isMid) {
      return Math.max(strike - spotPrice, 0) + strike * midRate;
    }
    return strike * nearRate;
  } else {
    throw new Error("Invalid position type. Use 'call' or 'put'.");
  }
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
      strikeOrEntryAbsolute = inst.strike * currentPrice;
      pnl = calculateOptionPNL(inst.type, strikeOrEntryAbsolute, inst.size, inst.position);
      strategy.strikePrices.push(strikeOrEntryAbsolute);
    } else if (inst.asset === 'perp'){
      strikeOrEntryAbsolute = inst.entry * currentPrice;
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
