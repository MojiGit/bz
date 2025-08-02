import fetch from "node-fetch";
import { ethers } from "ethers";

const API_URL = "https://api-demo.lyra.finance/public/get_all_instruments";
let instruments = [];



let options = {
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

getInstruments().then(() => {
  const calls = getInstrumentsByType('C');
  console.log(calls); // Only options with type 'C'
});