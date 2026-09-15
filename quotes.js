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
// Derive's HTTP POST endpoints don't send CORS headers, so we use their
// WebSocket JSON-RPC interface instead — same methods, no preflight issues.

const DERIVE_WS_URL = 'wss://api.derive.xyz/v3/ws';

// Opens one WS connection and returns a { call(method, params), close() } handle.
// Responses are demultiplexed by JSON-RPC id so concurrent calls work safely.
function openDeriveWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DERIVE_WS_URL);
    const pending = new Map();
    let nextId = 1;

    ws.onopen = () => resolve({
      call(method, params) {
        return new Promise((res, rej) => {
          const id = nextId++;
          pending.set(id, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
          setTimeout(() => {
            if (pending.has(id)) {
              pending.delete(id);
              rej(new Error(`Derive timeout: ${method}`));
            }
          }, 10000);
        });
      },
      close() { ws.close(); },
    });

    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.id != null && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };

    ws.onerror = () => reject(new Error('Derive WebSocket error'));
    ws.onclose = () => {
      for (const { reject } of pending.values()) reject(new Error('Derive WebSocket closed'));
      pending.clear();
    };
  });
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

// Returns the active Derive instrument that exactly matches date + strike + type.
// No nearest-date or nearest-strike fallback: a different strike or expiry is a
// different instrument with a different payoff — showing its price as a proxy
// for the requested one would be misleading in a pricing aggregator.
function nearestDeriveOpt(instruments, strike, type, dateStr) {
  const typeChar = type === 'call' ? 'C' : 'P';
  return instruments.find(i => {
    if (!i.is_active) return false;
    const p = i.instrument_name.split('-');
    return p[1] === dateStr
      && p[3] === typeChar
      && parseFloat(i.option_details.strike) === strike;
  }) ?? null;
}

// Prices on Derive are already in USD — no spotPrice multiplication needed.
export async function fetchDeriveQuotes(instruments, token) {
  const currency = TOKEN_CURRENCY[token] ?? 'BTC';

  let ws;
  try {
    ws = await openDeriveWs();
  } catch (e) {
    return instruments.map(inst => ({ id: inst.id, source: 'Derive', error: `Derive unavailable: ${e.message}` }));
  }

  try {
    const hasOpts = instruments.some(i => i.asset === 'opt');
    let deriveInsts = null;
    if (hasOpts) {
      const r = await ws.call('public/get_all_instruments', {
        instrument_type: 'option', currency, expired: false, page_size: 1000,
      });
      deriveInsts = r.instruments;
    }

    return await Promise.all(instruments.map(async inst => {
      try {
        if (inst.asset === 'opt') {
          const dateStr = tsToYYYYMMDD(inst.expiryTs);
          const matched = nearestDeriveOpt(deriveInsts, inst.strike, inst.type, dateStr);
          if (!matched) return { id: inst.id, source: 'Derive', error: 'No instrument found on Derive' };
          const t = await ws.call('public/get_ticker', { instrument_name: matched.instrument_name });
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
          const t = await ws.call('public/get_ticker', { instrument_name: name });
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
  } finally {
    ws.close();
  }
}

// ─── Hyperliquid ─────────────────────────────────────────────────────────────
// CORS enabled (access-control-allow-origin: *) — plain fetch works from the browser.
// Only perpetual futures are available; option legs get an informative error.
// impactPxs[0]/[1] are $5M-notional impact bid/ask — best available proxy for top-of-book.

const HYPERLIQUID_URL = 'https://api.hyperliquid.xyz/info';

export async function fetchHyperliquidQuotes(instruments, token) {
  const currency = TOKEN_CURRENCY[token] ?? 'BTC';

  let meta, ctxs;
  try {
    const res = await fetch(HYPERLIQUID_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    [meta, ctxs] = await res.json();
  } catch (e) {
    return instruments.map(inst => ({ id: inst.id, source: 'Hyperliquid', error: `Hyperliquid unavailable: ${e.message}` }));
  }

  const coinIdx = meta.universe.findIndex(u => u.name === currency);

  return instruments.map(inst => {
    if (inst.asset === 'opt') {
      return { id: inst.id, source: 'Hyperliquid', error: 'Options not available on Hyperliquid' };
    }
    if (inst.asset === 'perp') {
      if (coinIdx === -1) return { id: inst.id, source: 'Hyperliquid', error: `${currency} not found on Hyperliquid` };
      const ctx  = ctxs[coinIdx];
      const mark = parseFloat(ctx.markPx);
      if (!mark) return { id: inst.id, source: 'Hyperliquid', error: 'No active market on Hyperliquid' };
      return {
        id: inst.id, asset: 'perp', position: inst.position, size: inst.size,
        source: 'Hyperliquid', name: `${currency}-PERP`,
        bid:     parseFloat(ctx.impactPxs[0]),
        ask:     parseFloat(ctx.impactPxs[1]),
        mark,
        funding: parseFloat(ctx.funding),
      };
    }
  });
}

// ─── Deribit ─────────────────────────────────────────────────────────────────

export async function fetchDeribitQuotes(instruments, token, spotPrice) {
  const currency = TOKEN_CURRENCY[token] ?? 'BTC';

  const hasOpts = instruments.some(i => i.asset === 'opt');
  let optInsts = null;
  if (hasOpts) {
    try {
      optInsts = await deribitFetch(`get_instruments?currency=${currency}&kind=option&expired=false`);
    } catch (e) {
      return instruments.map(inst => ({ id: inst.id, source: 'Deribit', error: e.message }));
    }
  }

  return Promise.all(instruments.map(async inst => {
    try {
      if (inst.asset === 'opt') {
        const matched = optionForExpiry(optInsts, inst.strike, inst.type, inst.expiryTs);
        if (!matched) return { id: inst.id, source: 'Deribit', error: 'No instrument found on Deribit' };
        const t = await deribitFetch(`ticker?instrument_name=${encodeURIComponent(matched.instrument_name)}`);
        // Mark = 0 means Deribit's own model values the option at zero — no usable price
        // regardless of whether a lone bid or ask exists on one side.
        if (t.mark_price === 0) {
          return { id: inst.id, source: 'Deribit', error: 'No active market on Deribit (mark = 0)' };
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
      return { id: inst.id, source: 'Deribit', error: e.message };
    }
  }));
}
