/*
=== PNL Calculation Functions ===
These functions calculate PNL for different trading strategies, including spot, perpetual futures, and options.
*/
import { currentPrice, selectedTokenSymbol } from "./mvp.js";

// Perpetual PNL
function calculatePerpPNL(entryPrice, quantity, leverage, priceRange) {
  return priceRange.map(currentPrice => {
    const pnl = (currentPrice - entryPrice) * quantity * leverage;
    return { price: currentPrice, pnl };
  });
}

// Option PNL (Call or Put)
function calculateOptionPNL(optionType, strikePrice, premium, quantity, priceRange, position = 'long') {
  return priceRange.map(currentPrice => {
    let intrinsicValue;
    if (optionType === 'call') {
      intrinsicValue = Math.max(currentPrice - strikePrice, 0);
    } else if (optionType === 'put') {
      intrinsicValue = Math.max(strikePrice - currentPrice, 0);
    } else {
      throw new Error("Invalid option type");
    }

    const totalPNL = (intrinsicValue - premium) * quantity;
    if (position === 'short') {
      // If the position is short, we invert the PNL
      return { price: currentPrice, pnl: -totalPNL };
    }
    return { price: currentPrice, pnl: totalPNL };
  });
}

// Combine multiple PNL datasets into a single compound curve
function combinePNLCurves(pnlArrays) {
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
function findBreakevenPoints(pnlArray) {
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
function generateDynamicPriceRange() {
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


// Mapping from strategy ID to strategy functions
export const strategiesIdMap = {
  'strangle': {
    fn: createStrangle,
    name: 'Strangle',
    description:'We simply buy lower strike puts and higher strike calls with the same expiration date so that we can profit from the stock soaring up or plummeting down.',
    maxProfit: 'Unlimited',
    maxLoss: 'Limited',
    strategyType: 'Capital Gain',
    sentiment: 'neutral',
    proficiency: 'Intermediate'
  },
  'bull-put-spread': {
    fn: createBullPutSpread,
    name: 'Bull Put Spread',
    description:'Protect the downside of a Naked Put by buying a lower strike put to insure the one you sold. Both put strikes should be lower than the current market price so as to ensure a profit even if the stock doesn’t move at all.',
    maxProfit: 'Limited',
    maxLoss: 'Limited',
    strategyType: 'Income',
    sentiment: 'bullish',
    proficiency: 'Intermediate'
  },
  'bear-call-spread': {
    fn: createBearCallSpread,
    name: 'Bear Call Spread',
    description:'The concept is to protect the downside of a Naked Call by buying a higher strike call to insure the one you sold. Both call strikes should be higher than the current stock price so as to ensure a profit even if the stock doesn’t move at all. ',
    maxProfit: 'Limited',
    maxLoss: 'Limited',
    strategyType: 'Income',
    sentiment: 'bearish',
    proficiency: 'Intermediate'
  },
  // Add more strategies
};

// === Default Strategy: Long Call ATM ===
// buy ATM call 
export async function defaultStrategy() {
  const priceRange = generateDynamicPriceRange();

  // Default strategy: Long Call ATM
  const strikePrice = currentPrice;
  const premium = currentPrice * 0.09; // Example premium
  const quantity = 1;

  const pnlData = calculateOptionPNL('call', strikePrice, premium, quantity, priceRange);
  const breakeven = findBreakevenPoints(pnlData); // Break-even price for the long call

  return {
    datasets: [
      {data: pnlData, color: '#D8DDEF', bgColor: 'rgba(183, 184, 183, 0.16)'},
    ],
    strikePrices: [Math.round(strikePrice)],
    breakeven: breakeven,
  };
}

// === Predefined Strategy: Long Strangle (Neutral Volatility Bet) ===
// Buy OTM Put + Buy OTM Call
export async function createStrangle() {

  const priceRange = generateDynamicPriceRange();

  const longPutStrike = currentPrice * 0.98;
  const longCallStrike = currentPrice * 1.02;
  const premiumPut = currentPrice * 0.05;
  const premiumCall = currentPrice * 0.05;
  const quantity = 1;
  

  const putPNL = calculateOptionPNL('put', longPutStrike, premiumPut, quantity, priceRange);
  const callPNL = calculateOptionPNL('call', longCallStrike, premiumCall, quantity, priceRange);
  const combinedPNL = combinePNLCurves([putPNL, callPNL]);

  const breakeven = findBreakevenPoints(combinedPNL);

  return {
    datasets: [
      { label: `Long Put`, data: putPNL, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Long Call`, data: callPNL, color: '#D8DDEF', bgColor: 'rgba(183, 184, 183, 0)', borderDash: [5, 5] },
      { label: `Compound`, data: combinedPNL, color: 'blue', bgColor: 'rgba(0, 0, 255, 0.1)' },
    ],
    strikePrices: [Math.round(longPutStrike), Math.round(longCallStrike)],
    breakeven: breakeven,
  };
}

// === Predefined Strategy: Bull Put Spread (bullish capital gain) ===
// Buy OTM Put + sell OTM Put
export async function createBullPutSpread() {

  const priceRange = generateDynamicPriceRange();

  const longPutStrike = currentPrice * 0.9; // Long Put Strike
  const shortPutStrike = currentPrice * 0.95; // Short Put Strike
  const premiumLong = currentPrice * 0.05;
  const premiumShort = currentPrice * 0.09;
  const quantity = 1;

  const Shortput = calculateOptionPNL('put', shortPutStrike, premiumShort, quantity, priceRange, 'short');
  const Longput = calculateOptionPNL('put', longPutStrike, premiumLong, quantity, priceRange);
  const combinedPNL = combinePNLCurves([Shortput, Longput]);

  const breakeven = findBreakevenPoints(combinedPNL); // Breakeven for the Bull Put Spread

  return {
    datasets: [
      { label: `Short Put`, data: Shortput, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Long Put`, data: Longput, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Compound`, data: combinedPNL, color: 'blue', bgColor: 'rgba(0, 0, 255, 0.1)' },
    ],
    strikePrices: [Math.round(longPutStrike), Math.round(shortPutStrike)],
    breakeven: breakeven,
  };
  
}

// === Predefined Strategy: Bear Call Spread (bearish capital gain) ===
// Buy OTM Call + sell OTM Call
export async function createBearCallSpread() {
  const priceRange = generateDynamicPriceRange();

  const longCallStrike = currentPrice * 1.05;
  const shortCallStrike = currentPrice;
  const premiumLong = currentPrice * 0.06;
  const premiumShort = currentPrice * 0.09;
  const quantity = 1;

  const ShortCall = calculateOptionPNL('call', shortCallStrike, premiumShort, quantity, priceRange, 'short');
  const LongCall = calculateOptionPNL('call', longCallStrike, premiumLong, quantity, priceRange);
  const combinedPNL = combinePNLCurves([ShortCall, LongCall]);

  const breakeven = findBreakevenPoints(combinedPNL); // Breakeven for the Bear Call Spread

  return {
    datasets: [
      { label: `Short Call`, data: ShortCall, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Long Call`, data: LongCall, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Compound`, data: combinedPNL, color: 'blue', bgColor: 'rgba(0, 0, 255, 0.1)'},
    ],
    strikePrices: [Math.round(longCallStrike), Math.round(shortCallStrike)],
    breakeven: breakeven,
  };
}