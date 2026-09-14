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

// ─── Derive ──────────────────────────────────────────────────────────────────

const DERIVE = 'https://api.derive.xyz/v3';

async function deriveFetch(endpoint, params) {
  const res = await fetch(`${DERIVE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result;
}

// expiryTs is in ms (from Deribit dropdown); Derive names use YYYYMMDD UTC.
function tsToYYYYMMDD(tsMs) {
  const d = new Date(tsMs);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('');
}

// Find the active Derive instrument with the nearest strike for a given date + type.
function nearestDeriveOpt(instruments, strike, type, dateStr) {
  const typeChar = type === 'call' ? 'C' : 'P';
  const candidates = instruments.filter(i => {
    if (!i.is_active) return false;
    const p = i.instrument_name.split('-');
    return p[1] === dateStr && p[3] === typeChar;
  });
  if (!candidates.length) return null;
  return candidates.reduce((best, i) => {
    const s = parseFloat(i.option_details.strike);
    const b = parseFloat(best.option_details.strike);
    return Math.abs(s - strike) < Math.abs(b - strike) ? i : best;
  });
}

// Prices on Derive are already in USD — no spotPrice multiplication needed.
export async function fetchDeriveQuotes(instruments, token) {
  const currency = TOKEN_CURRENCY[token] ?? 'BTC';

  const hasOpts = instruments.some(i => i.asset === 'opt');
  let deriveInsts = null;
  if (hasOpts) {
    const r = await deriveFetch('public/get_all_instruments', {
      instrument_type: 'option',
      currency,
      expired: false,
      page_size: 1000,
    });
    deriveInsts = r.instruments;
  }

  return Promise.all(instruments.map(async inst => {
    try {
      if (inst.asset === 'opt') {
        const dateStr = tsToYYYYMMDD(inst.expiryTs);
        const matched = nearestDeriveOpt(deriveInsts, inst.strike, inst.type, dateStr);
        if (!matched) return { id: inst.id, source: 'Derive', error: 'No instrument found on Derive' };
        const t = await deriveFetch('public/get_ticker', { instrument_name: matched.instrument_name });
        const mark = parseFloat(t.M);
        if (mark === 0) return { id: inst.id, source: 'Derive', error: 'No active market on Derive (mark = 0)' };
        const expiry = new Date(matched.option_details.expiry * 1000)
          .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
        return {
          id: inst.id, asset: 'opt', type: inst.type, position: inst.position, size: inst.size,
          source: 'Derive', name: matched.instrument_name,
          strike: parseFloat(matched.option_details.strike), expiry,
          bid:  parseFloat(t.b),
          ask:  parseFloat(t.a),
          mark,
          iv: t.option_pricing ? parseFloat(t.option_pricing.v) : null,
        };
      }
      if (inst.asset === 'perp') {
        const name = `${currency}-PERP`;
        const t = await deriveFetch('public/get_ticker', { instrument_name: name });
        const mark = parseFloat(t.M);
        if (mark === 0) return { id: inst.id, source: 'Derive', error: 'No active market on Derive (mark = 0)' };
        return {
          id: inst.id, asset: 'perp', position: inst.position, size: inst.size,
          source: 'Derive', name,
          bid:     parseFloat(t.b),
          ask:     parseFloat(t.a),
          mark,
          funding: t.f != null ? parseFloat(t.f) : null,
        };
      }
    } catch (e) {
      return { id: inst.id, source: 'Derive', error: e.message };
    }
  }));
}

// ─── Deribit ─────────────────────────────────────────────────────────────────

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
        // Mark = 0 means Deribit's own model values the option at zero — no usable price
        // regardless of whether a lone bid or ask exists on one side.
        if (t.mark_price === 0) {
          return { id: inst.id, error: 'No active market on Deribit (mark = 0)' };
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
