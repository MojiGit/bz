const LOCAL_JSON_URL = 'lyra_instruments.json'; // Adjust path if needed
let instruments = [];

export const getInstruments = () => {
  return fetch(LOCAL_JSON_URL)
    .then(res => res.json())
    .then(res => {
      // Access the instruments array
      if (res.result && Array.isArray(res.result.instruments)) {
        instruments = res.result.instruments;
        return instruments;
      } else {
        throw new Error("Invalid response format");
      }
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