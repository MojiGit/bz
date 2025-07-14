import fetch from "node-fetch";
import { ethers } from "ethers";

const API_URL = "https://api-demo.lyra.finance/public/get_all_instruments";
let instruments = [];

const options = {
  method: 'POST',
  headers: {accept: 'application/json', 'content-type': 'application/json'},
  body: JSON.stringify({
    currency: 'ETH',
    expired: false,
    instrument_type: 'option',
    page: 1,
    page_size: 100
  })
};

export const getInstruments = () => {
  return new Promise((resolve, reject) => {
    fetch(API_URL, options)
      .then(res => res.json())
      .then(res => {
        // Access the instruments array
        if (res.result && Array.isArray(res.result.instruments)) {
          instruments = res.result.instruments;
          resolve(instruments);
        } else {
          reject(new Error("Invalid response format"));
        }
      })
      .catch(err => reject(err));
  });
};

export const getInstrumentsByType = (type) => {
  return instruments.filter(instrument => instrument.option_details.option_type === type);
};

export const getInstrumentsByDate = (date) => {
  return instruments.filter(instrument => {
    const expiryDate = new Date(instrument.option_details.expiry * 1000);
    return expiryDate.toISOString().split('T')[0].replace(/-/g, '') === date;
  });
}

export async function fetchDatesAndStrikesByType() {
  await getInstruments();

  // Structure: { C: { date1: [strike1, strike2], ... }, P: { ... } }
  const result = { C: {}, P: {} };

  for (const instrument of instruments) {
    const type = instrument.option_details.option_type; // 'C' or 'P'
    const expiryDate = new Date(instrument.option_details.expiry * 1000)
      .toISOString()
      .split('T')[0]
      .replace(/-/g, '');
    const strike = instrument.option_details.strike;

    if (!result[type][expiryDate]) {
      result[type][expiryDate] = new Set();
    }
    result[type][expiryDate].add(strike);
  }

  // Convert Sets to arrays for output
  for (const type of Object.keys(result)) {
    for (const date of Object.keys(result[type])) {
      result[type][date] = Array.from(result[type][date]);
    }
  }

  return result;
}

// Example usage:
fetchDatesAndStrikesByType().then(res => {
  console.log('Calls:', res.C); // { '20250725': [strike1, strike2, ...], ... }
  console.log('Puts:', res.P);  // { '20250725': [strike1, strike2, ...], ... }
});
