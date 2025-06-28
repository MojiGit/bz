/*
=== PNL Calculation Functions ===
These functions calculate PNL for different trading strategies, including spot, perpetual futures, and options.
*/
import { currentPrice, selectedTokenSymbol } from "./mvp.js";

// Perpetual PNL
export function calculatePerpPNL(entryPrice, quantity, leverage, priceRange, position = 'long') {
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
export function calculateOptionPNL(optionType, strikePrice, premium, quantity, priceRange, position = 'long') {
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

// === Long Call ===
export async function longCall(strike = currentPrice, size = 1, lineColor = '#D8DDEF'){
  const priceRange = generateDynamicPriceRange();
  const premium = generatePremium(strike, 'call'); 

  const pnlData = calculateOptionPNL('call', strike, premium, size, priceRange, 'long');
  const breakeven = findBreakevenPoints(pnlData)

  return {
    datasets: [
      {data: pnlData, color: lineColor, bgColor: 'rgba(183, 184, 183, 0.16)'},
    ],
    strikePrices: [Math.round(strike)],
    breakeven: breakeven,
  };
}
// == Short Call ==
export async function nakedCall(strike = currentPrice, size = 1, lineColor = '#D8DDEF') {
  const priceRange = generateDynamicPriceRange();
  const premium = generatePremium(strike, 'call');

  const pnlData = calculateOptionPNL('call',strike,premium,size,priceRange,'short');
  const breakeven = findBreakevenPoints(pnlData);

  return {
    datasets: [
      {data: pnlData, color: lineColor, bgColor: 'rgba(183, 184, 183, 0.16)'},
    ],
    strikePrice: [Math.round(strike)],
    breakeven: breakeven,
  };
}

// == Long Put ==
export async function longPut(strike = currentPrice, size = 1, lineColor = '#D8DDEF'){
  const priceRange = generateDynamicPriceRange();
  const premium = generatePremium(strike,'put');

  const pnlData = calculateOptionPNL('put', strike, premium, size, priceRange, 'long');
  const breakeven = findBreakevenPoints(pnlData)

  return {
    datasets: [
      {data: pnlData, color: lineColor, bgColor: 'rgba(183, 184, 183, 0.16)'}
    ],
    strikePrice: [Math.round(strike)],
    breakeven: breakeven,
  };
}

// == Short Put ==
export async function nakedPut(strike = currentPrice, size = 1, lineColor = '#D8DDEF'){
  const priceRange = generateDynamicPriceRange();
  const premium = generatePremium(strike,'put');

  const pnlData = calculateOptionPNL('put', strike, premium, size, priceRange, 'short');
  const breakeven = findBreakevenPoints(pnlData)

  return {
    datasets: [
      {data: pnlData, color: lineColor, bgColor: 'rgba(183, 184, 183, 0.16)'}
    ],
    strikePrice: [Math.round(strike)],
    breakeven: breakeven,
  };
}

// == long perp ==
export async function longPerp(entryPrice = currentPrice, size = 1, leverage = 1,lineColor = '#D8DDEF'){
  const priceRange = generateDynamicPriceRange();
  
  const pnlData = calculatePerpPNL(entryPrice,size,leverage,priceRange,);
  const breakeven = findBreakevenPoints(pnlData);
  return {
    datasets: [
      {data: pnlData, color: lineColor, bgColor: 'rgba(183, 184, 183, 0.16)'}
    ],
    strikePrice: ['N/A'],
    breakeven: breakeven,
  };
}

// == Short perp ==
export async function shortPerp(entryPrice = currentPrice, size = 1, leverage = 1,lineColor = '#D8DDEF'){
  const priceRange = generateDynamicPriceRange();
  
  const pnlData = calculatePerpPNL(entryPrice,size,leverage,priceRange,'short');
  const breakeven = findBreakevenPoints(pnlData);
  return {
    datasets: [
      {data: pnlData, color: lineColor, bgColor: 'rgba(183, 184, 183, 0.16)'}
    ],
    strikePrice: ['N/A'],
    breakeven: breakeven,
  };
}

// == covered call
export async function coveredCall() {

  const priceRange = generateDynamicPriceRange();
  const entryPrice = currentPrice;
  const strike = currentPrice * 1.1;
  const premiumCall = generatePremium(strike, 'call');

  const perpPnl = calculatePerpPNL(entryPrice, 1, 1, priceRange, 'long');
  const callPnl = calculateOptionPNL('call', strike, premiumCall, 1, priceRange, 'short');

  const combinedPNL = combinePNLCurves([perpPnl, callPnl]);
  const breakeven = findBreakevenPoints(combinedPNL);

  return {
    datasets: [
      { label: `Long Call`, data: callPnl, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Long Perp`, data: perpPnl, color: '#D8DDEF', bgColor: 'rgba(183, 184, 183, 0)', borderDash: [5, 5] },
      { label: `Compound`, data: combinedPNL, color: 'blue', bgColor: 'rgba(0, 0, 255, 0.1)' },
    ],
    strikePrices: [Math.round(strike), Math.round(entryPrice)],
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

  const longPutStrike = currentPrice * 0.90; // Long Put Strike
  const shortPutStrike = currentPrice * 1; // Short Put Strike
  const premiumLong = generatePremium(longPutStrike,'put');
  const premiumShort = generatePremium(shortPutStrike,'put');
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

  const longCallStrike = currentPrice * 1.1;
  const shortCallStrike = currentPrice * 1.02;
  const premiumLong = generatePremium(longCallStrike,'call');
  const premiumShort = generatePremium(shortCallStrike,'call');
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

export async function createLongIronButterfly(){
  
  const priceRange = generateDynamicPriceRange();

  const longCallStrike = currentPrice * 1.1;
  const shortCallStrike = currentPrice * 1;
  const premiumLongCall = generatePremium(longCallStrike,'call');
  const premiumShortCall = generatePremium(shortCallStrike,'call');
  const quantity = 1;
  const longPutStrike = currentPrice * 0.9; // Long Put Strike
  const shortPutStrike = currentPrice * 1; // Short Put Strike
  const premiumLongPut = generatePremium(longPutStrike,'put');
  const premiumShortPut = generatePremium(shortPutStrike,'put');

  const ShortPut = calculateOptionPNL('put', shortPutStrike, premiumShortPut, quantity, priceRange, 'short');
  const LongPut = calculateOptionPNL('put', longPutStrike, premiumLongPut, quantity, priceRange);
  const ShortCall = calculateOptionPNL('call', shortCallStrike, premiumShortCall, quantity, priceRange, 'short');
  const LongCall = calculateOptionPNL('call', longCallStrike, premiumLongCall, quantity, priceRange);
  const combinedPNL = combinePNLCurves([ShortCall, LongCall, LongPut, ShortPut]);

  const breakeven = findBreakevenPoints(combinedPNL); // Breakeven for the Bear Call Spread

  return {
    datasets: [
      { label: `Short Call`, data: ShortCall, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Long Call`, data: LongCall, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Long Put`, data: LongPut, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Short Put`, data: ShortPut, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Compound`, data: combinedPNL, color: 'blue', bgColor: 'rgba(0, 0, 255, 0.1)'},
    ],
    strikePrices: [Math.round(longCallStrike), Math.round(shortCallStrike), Math.round(longPutStrike), Math.round(shortPutStrike)],
    breakeven: breakeven,
  };
}

export async function createLongIronCondor() {

  const priceRange = generateDynamicPriceRange();

  const longCallStrike = currentPrice * 1.1;
  const shortCallStrike = currentPrice * 1.05;
  const premiumLongCall = generatePremium(longCallStrike,'call');
  const premiumShortCall = generatePremium(shortCallStrike,'call');
  const quantity = 1;
  const longPutStrike = currentPrice * 0.9; // Long Put Strike
  const shortPutStrike = currentPrice * 0.95; // Short Put Strike
  const premiumLongPut = generatePremium(longPutStrike,'put');
  const premiumShortPut = generatePremium(shortPutStrike,'put');

  const ShortPut = calculateOptionPNL('put', shortPutStrike, premiumShortPut, quantity, priceRange, 'short');
  const LongPut = calculateOptionPNL('put', longPutStrike, premiumLongPut, quantity, priceRange);
  const ShortCall = calculateOptionPNL('call', shortCallStrike, premiumShortCall, quantity, priceRange, 'short');
  const LongCall = calculateOptionPNL('call', longCallStrike, premiumLongCall, quantity, priceRange);
  const combinedPNL = combinePNLCurves([ShortCall, LongCall, LongPut, ShortPut]);

  const breakeven = findBreakevenPoints(combinedPNL); // Breakeven for the Bear Call Spread

  return {
    datasets: [
      { label: `Short Call`, data: ShortCall, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Long Call`, data: LongCall, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Long Put`, data: LongPut, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Short Put`, data: ShortPut, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Compound`, data: combinedPNL, color: 'blue', bgColor: 'rgba(0, 0, 255, 0.1)'},
    ],
    strikePrices: [Math.round(longCallStrike), Math.round(shortCallStrike), Math.round(longPutStrike), Math.round(shortPutStrike)],
    breakeven: breakeven,
  };
}

// == covered Put
export async function createCoveredPut() {

  const priceRange = generateDynamicPriceRange();
  const entryPrice = currentPrice;
  const strike = currentPrice * 0.95;
  const premiumCall = generatePremium(strike, 'put');

  const perpPnl = calculatePerpPNL(entryPrice, 1, 1, priceRange, 'short');
  const callPnl = calculateOptionPNL('put', strike, premiumCall, 1, priceRange, 'short');

  const combinedPNL = combinePNLCurves([perpPnl, callPnl]);
  const breakeven = findBreakevenPoints(combinedPNL);

  return {
    datasets: [
      { label: `Short Put`, data: callPnl, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5] },
      { label: `Short Perp`, data: perpPnl, color: '#D8DDEF', bgColor: 'rgba(183, 184, 183, 0)', borderDash: [5, 5] },
      { label: `Compound`, data: combinedPNL, color: 'blue', bgColor: 'rgba(0, 0, 255, 0.1)' },
    ],
    strikePrices: [Math.round(strike), Math.round(entryPrice)],
    breakeven: breakeven,
  };
}

/* This strategy involved different times, which is not included so far
export async function createCalendarCall(){
  const priceRange = generateDynamicPriceRange();

  const strike = currentPrice * 1.05;
  const premium = generatePremium(strike,'call')
  const quantity = 1;

  const longCall = calculateOptionPNL('call', strike, premium, quantity, priceRange, 'long' );
  const shortCall = calculateOptionPNL('call', strike, premium, quantity, priceRange, 'short' );
  const combinedPNL = combinePNLCurves([longCall, shortCall]);

  const breakeven = findBreakevenPoints(combinedPNL);

  return {
    datasets: [
      {label: 'Long Call', data: longCall, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5]},
      {label: 'Short Call', data: shortCall, color: '#D8DDEF', bgColor: 'rgba(255, 107, 107, 0)', borderDash: [5, 5]},
      {label: `Compound`, data: combinedPNL, color: 'blue', bgColor: 'rgba(0, 0, 255, 0.1)'},
    ],
    strikePrices: [Math.round(strike)],
    breakeven: breakeven,
  };
}
'calendarCall':{
    fn: createCalendarCall,
    name: 'Calendar Call',
    description: 'Calendar spreads are known as horizontal spreads, and the Calendar Call is a variation of a Covered Call, where you substitute the long stock with a long-term long call option instead. This has the effect of radically reducing the investment, thereby increasing the initial yield. ',
    maxProfit:'Capped',
    maxLoss: 'capped',
    strategyType: 'Income',
    sentiment: 'Neutral',
    proficiency: 'Intermediate'
  },  
*/


// Mapping from strategy ID to strategy functions
export const strategiesIdMap = {

  'coveredPut':{
    fn: createCoveredPut,
    name: 'Covered Put',
    description:'The Covered Put is the opposite process to a Covered Call, and it achieves the oppo￾site risk profile. Whereas the Covered Call is bullish, the Covered Put is a bearish income strategy, where you receive a substantial net credit for shorting both the put and the stock simultaneously to create the spread. ',
    maxProfit:'Capped',
    maxLoss:'Uncapped',
    strategyType:'Income',
    sentiment:'bearish',
    proficiency: 'Advance'
  },
  
  'longIronCondor':{
    fn: createLongIronCondor,
    name: 'Long Iron Condor',
    description: 'A variation of the Long Iron Butterfly, it is in fact the combi￾nation of a Bull Put Spread and a Bear Call Spread. The higher strike put is lower than the lower strike call in order to create the condor shape. The combination of two income strategies also makes this an income strategy',
    maxProfit:'Capped',
    maxLoss:'Capped',
    strategyType:'Income',
    sentiment:'neutral',
    proficiency: 'Intermediate'
  },
  'longIronButterfly':{
    fn: createLongIronButterfly,
    name: 'Long Iron Butterfly',
    description: 'It is, in fact, the combination of a Bull Put Spread and a Bear Call Spread. The higher strike put shares the same strike as the lower strike call to create the butterfly shape. The combination of two income strategies also makes this an income strategy',
    maxProfit:'Capped',
    maxLoss:'Capped',
    strategyType:'Income',
    sentiment:'neutral',
    proficiency:'Intermediate'
  },
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

  'covered-call': {
    fn: coveredCall,
    name: 'Covered Call',
    description: 'The concept is that in owning the stock, you then sell an Out of the Money call option on a monthly basis as a means of collecting rent (or a dividend) while you own the stock. If the stock rises above the call strike, you’ll be exercised, and the stock will be sold . . . but you make a profit anyway. (You’re covered because you own the stock in the first place.) If the stock remains static, then you’re better off because you col￾lected the call premium. If the stock falls, you have the cushion of the call premium you collected.',
    maxProfit: 'Limited',
    maxLoss: 'Unlimted',
    strategyType: 'Income',
    sentiment: 'bullish',
    proficiency: 'Novice'
  },
  
  // Add more strategies
};
