const DERIBIT = 'https://www.deribit.com/api/v2/public';

const TOKEN_CURRENCY = { WBTC: 'BTC', ETH: 'ETH' };

async function deribitFetch(endpoint) {
  const res = await fetch(`${DERIBIT}/${endpoint}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function optionForExpiry(instruments, strike, type, expiryTs) {
  const candidates = instruments.filter(
    i => i.option_type === type && i.expiration_timestamp === expiryTs
  );
  if (!candidates.length) return null;
  return candidates.reduce((a, b) =>
    Math.abs(a.strike - strike) <= Math.abs(b.strike - strike) ? a : b
  );
}

export async function fetchDeribitExpiries(token) {
  const currency = TOKEN_CURRENCY[token] ?? 'BTC';
  const instruments = await deribitFetch(`get_instruments?currency=${currency}&kind=option&expired=false`);
  const now = Date.now();
  const seen = new Set();
  const expiries = [];
  for (const i of instruments) {
    if (i.expiration_timestamp > now && !seen.has(i.expiration_timestamp)) {
      seen.add(i.expiration_timestamp);
      expiries.push({
        ts: i.expiration_timestamp,
        label: new Date(i.expiration_timestamp).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        }),
      });
    }
  }
  expiries.sort((a, b) => a.ts - b.ts);
  return expiries;
}

export async function fetchDeribitQuotes(instruments, token, spotPrice) {
  const currency = TOKEN_CURRENCY[token] ?? 'BTC';

  const hasOpts = instruments.some(i => i.asset === 'opt');
  const optInsts = hasOpts
    ? await deribitFetch(`get_instruments?currency=${currency}&kind=option&expired=false`)
    : null;

  return Promise.all(instruments.map(async inst => {
    try {
      if (inst.asset === 'opt') {
        const matched = optionForExpiry(optInsts, inst.strike, inst.type, inst.expiryTs);
        if (!matched) return { id: inst.id, error: 'No instrument found on Deribit' };
        const t = await deribitFetch(`ticker?instrument_name=${encodeURIComponent(matched.instrument_name)}`);
        // No active market: both bid and ask are zero — only a model price exists, not a
        // tradeable one. Treat as no quote so the chart is not polluted with a $0 premium.
        if (t.best_bid_price === 0 && t.best_ask_price === 0) {
          return { id: inst.id, error: 'No active market on Deribit (no bid / no ask)' };
        }
        const expiry = new Date(matched.expiration_timestamp)
          .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
        return {
          id: inst.id, asset: 'opt', type: inst.type, position: inst.position, size: inst.size,
          source: 'Deribit', name: matched.instrument_name,
          strike: matched.strike, expiry,
          bid:  t.best_bid_price  * spotPrice,
          ask:  t.best_ask_price  * spotPrice,
          mark: t.mark_price      * spotPrice,
          iv:   t.mark_iv,
        };
      }
      if (inst.asset === 'perp') {
        const name = `${currency}-PERPETUAL`;
        const t = await deribitFetch(`ticker?instrument_name=${encodeURIComponent(name)}`);
        return {
          id: inst.id, asset: 'perp', position: inst.position, size: inst.size,
          source: 'Deribit', name,
          bid:     t.best_bid_price,
          ask:     t.best_ask_price,
          mark:    t.mark_price,
          funding: t.current_funding,
        };
      }
    } catch (e) {
      return { id: inst.id, error: e.message };
    }
  }));
}
