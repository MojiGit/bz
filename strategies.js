/*
=== PNL Calculation Functions ===
These functions calculate PNL for different trading strategies, including spot, perpetual futures, and options.
*/
import { currentPrice, selectedTokenSymbol, priceRange } from "./mvp.js";

// Perpetual PNL
export function calculatePerpPNL(entryPrice, quantity, leverage = 1, position = 'long') {
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
export function calculateOptionPNL(optionType, strikePrice, quantity = 1, position = 'long') {
  return priceRange.map(currentPrice => {
    let intrinsicValue;
    if (optionType === 'call') {
      intrinsicValue = Math.max(currentPrice - strikePrice, 0);
    } else if (optionType === 'put') {
      intrinsicValue = Math.max(strikePrice - currentPrice, 0);
    } else {
      throw new Error("Invalid option type");
    }

    const totalPNL = (intrinsicValue - generatePremium(strikePrice, optionType)) * quantity;
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
      breakevens.push(curr.price);
    }
  }
  return breakevens;
}

// Generate price range based on current price
export function generateDynamicPriceRange() {
  if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
    throw new Error('Invalid currentPrice for price range');
  }
  const roundedCurrent = Math.round(currentPrice);
  const min = currentPrice * 0.8;
  const max = currentPrice * 1.2;
  const step = currentPrice * 0.01;
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

export function generatePremium(strike, position) {
  const nearRate = 0.08;
  const midRate = 0.04;
  const farRate = 0.02;

  if (position === 'call') {
    if (strike <= currentPrice * 0.9 || strike >= currentPrice * 1.1) {
      return Math.max(currentPrice - strike, 0) + strike * farRate;
    }
    if (strike <= currentPrice * 0.95 || strike >= currentPrice * 1.05) {
      return Math.max(currentPrice - strike, 0) + strike * midRate;
    }
    return strike * nearRate;
  } else if (position === 'put') {
    if (strike <= currentPrice * 0.9 || strike >= currentPrice * 1.1) {
      return Math.max(strike - currentPrice, 0) + strike * farRate;
    }
    if (strike <= currentPrice * 0.95 || strike >= currentPrice * 1.05) {
      return Math.max(strike - currentPrice, 0) + strike * midRate;
    }
    return strike * nearRate;
  } else {
    throw new Error("Invalid position type. Use 'call' or 'put'.");
  }
}

// === default strategy ===
export async function defaultStrategy(strike = currentPrice, size = 1, lineColor = '#D8DDEF'){

  const pnlData = calculateOptionPNL('call', strike, size, priceRange, 'long');
  const breakeven = findBreakevenPoints(pnlData)

  return {
    datasets: [
      {data: pnlData, color: lineColor, bgColor: 'rgba(183, 184, 183, 0.16)'},
    ],
    strikePrices: [Math.round(strike)],
    breakeven: breakeven,
  };
}

export async function generateStrategy(strategyId){
  let strategy = {datasets: [], strikeprices: [], breakeven: null};
  let combined = [];
  let pnl;

  for (const inst of strategiesIdMap[strategyId].components){
    if (inst.asset === 'opt'){
      pnl = calculateOptionPNL(inst.type, inst.strike * currentPrice, inst.size, inst.position);
      strategy.strikeprices.push(inst.strike);
    } else if (inst.asset === 'perp'){
      pnl = calculatePerpPNL(inst.entry * currentPrice, inst.size, inst.leverage, inst.position);
      strategy.strikeprices.push(inst.entry);
    }

    let data = {
      label: inst.position +' '+ inst.type,
      data: pnl,
      color: '#D8DDEF',
      bgColor: 'rgba(255, 107, 107, 0)',
      borderDash: [5,5]
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
  strategy.breakeven = findBreakevenPoints(compoundPnl);

  return strategy;

}

// Mapping from strategy ID to strategy functions
export const strategiesIdMap = {
  'custom':{
    name: 'Custom',
    description: 'Design your strategy from scratch by adding assets and defining their parameters.',
  },

  'coveredPut':{
    name: 'Covered Put',
    description:'The Covered Put is the opposite process to a Covered Call, and it achieves the oppo￾site risk profile. Whereas the Covered Call is bullish, the Covered Put is a bearish income strategy, where you receive a substantial net credit for shorting both the put and the stock simultaneously to create the spread. ',
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
    description: 'A variation of the Long Iron Butterfly, it is in fact the combi￾nation of a Bull Put Spread and a Bear Call Spread. The higher strike put is lower than the lower strike call in order to create the condor shape. The combination of two income strategies also makes this an income strategy',
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
    description: 'It is, in fact, the combination of a Bull Put Spread and a Bear Call Spread. The higher strike put shares the same strike as the lower strike call to create the butterfly shape. The combination of two income strategies also makes this an income strategy',
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
    maxProfit: 'Unlimited',
    maxLoss: 'Limited',
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
    description:'Protect the downside of a Naked Put by buying a lower strike put to insure the one you sold. Both put strikes should be lower than the current market price so as to ensure a profit even if the stock doesn’t move at all.',
    maxProfit: 'Limited',
    maxLoss: 'Limited',
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
    description:'The concept is to protect the downside of a Naked Call by buying a higher strike call to insure the one you sold. Both call strikes should be higher than the current stock price so as to ensure a profit even if the stock doesn’t move at all. ',
    maxProfit: 'Limited',
    maxLoss: 'Limited',
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
    description: 'The concept is that in owning the stock, you then sell an Out of the Money call option on a monthly basis as a means of collecting rent (or a dividend) while you own the stock. If the stock rises above the call strike, you’ll be exercised, and the stock will be sold . . . but you make a profit anyway. (You’re covered because you own the stock in the first place.) If the stock remains static, then you’re better off because you collected the call premium. If the stock falls, you have the cushion of the call premium you collected.',
    maxProfit: 'Limited',
    maxLoss: 'Unlimted',
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
