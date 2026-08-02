# Delta — Options Strategy Explorer

Delta is a simple, visual tool for designing and understanding crypto options strategies
**before** you ever put money on the line. Pick an asset, choose a ready-made strategy or
build your own, and instantly see how it would perform across a range of prices — profit,
loss, and break-even, all on one chart.

No spreadsheets. No math. Just a clear picture of the trade.

---

## Getting started

1. Open the app in your web browser (the strategy page).
2. Pick the asset you want to trade at the top — **WBTC** (Bitcoin) or **ETH** (Ethereum).
   The app pulls the **live market price** so every strategy is priced around where the
   market actually is right now.
3. Browse a strategy template, or build your own from scratch. The chart updates as you go.

That's it — everything below is just explaining what you're looking at.

---

## Reading the payoff chart

The chart is the heart of the app. It answers one question: **"if the price moves, what
happens to my trade?"**

- **Horizontal axis** — the price of the asset. The chart covers a realistic range around
  today's price (roughly 20% below to 20% above).
- **Vertical axis** — your profit or loss at each of those prices.
- **The colored curve** — your strategy's outcome. It turns **green where you're in profit**
  and **red where you're at a loss**, so you can see the good and bad zones at a glance.
- **"SPOT" line** — a marker showing today's live price, so you always know where the market
  sits relative to your trade.
- **"Break-even" line** — the level where your trade neither makes nor loses money. Where the
  curve crosses it is the price the market needs to reach for you to start profiting.
- **Faint vertical lines** — the strike prices of the options in your strategy.

---

## Using a ready-made strategy

Delta comes with a shelf of classic strategies, each shown as a card. Tap a card to expand it
and load its payoff chart.

Each card tells you, in plain terms:

- **Sentiment** — whether the strategy is built for a **bullish** (price up), **bearish**
  (price down), or **neutral** (price stays in a range) market view.
- **Proficiency** — roughly how advanced the strategy is (Novice, Intermediate, Advanced).
- **Strategy Type** — what it's designed to do, e.g. collect **Income** or chase a
  **Capital Gain**.
- **Max Profit / Max Loss** — whether your best case and worst case are **Capped** (limited)
  or **Uncapped** (open-ended). This is the single most important thing to check before any
  trade.

### The strategies included

| Strategy | Market view | Best for |
| --- | --- | --- |
| **Covered Call** | Bullish | Earning steady income while holding the asset |
| **Covered Put** | Bearish | Earning income when you expect the price to fall |
| **Bull Put Spread** | Bullish | A defined-risk income trade in a rising market |
| **Bear Call Spread** | Bearish | A defined-risk income trade in a falling market |
| **Strangle** | Neutral | Profiting from a big move in *either* direction |
| **Long Iron Condor** | Neutral | Profiting when the price stays in a range (capped risk) |
| **Long Iron Butterfly** | Neutral | A tighter range play with capped risk |
| **Custom** | Your call | Building a strategy from scratch |

### Filtering the shelf

- Use the **sentiment filter** (bullish / bearish / neutral / all) to show only strategies
  that match your market view.
- Use the **search box** to find a strategy by name.

---

## Building your own strategy

Want something the templates don't cover? Tap **Build** on any card (or start from
**Custom**) to open the builder.

In the builder you assemble a strategy out of individual pieces ("legs"). You can mix and
match:

- **Options** — tap *Add Option*, then choose:
  - **BUY or SELL** — whether you're buying the option (paying) or selling it (collecting).
  - **Call or Put** — a **call** profits when the price rises; a **put** profits when it
    falls.
  - **Strike** — the price level the option is tied to (pick from the dropdown).
  - **Size** — how many contracts.
- **Perpetuals (Perps)** — tap *Add Perp* for a straight long or short position:
  - **BUY (long)** to profit when the price rises, or **SELL (short)** to profit when it
    falls.
  - **Entry** — the price you're entering at.
  - **Size** and **Leverage** — how big the position is, and how much it's amplified.

As you add, remove, or tweak legs, the chart **redraws instantly** and shows the **combined
result** of the whole strategy — so you can experiment freely and watch the profit/loss
shape change in real time. Remove any leg with the small **X** on its card.

---

## A quick plain-English glossary

- **Call option** — a bet that the price will go **up**.
- **Put option** — a bet that the price will go **down**.
- **Buy / Sell (an option)** — buying pays a **premium** for the right to a payoff; selling
  **collects** that premium in exchange for taking on the obligation.
- **Premium** — the price of an option; think of it as the ticket price for the trade.
- **Strike** — the reference price an option is built around.
- **Break-even** — the price where you stop losing and start making money.
- **Spot** — the current live market price.
- **Perp (perpetual)** — a simple long or short position on the asset, with no expiry.
- **Leverage** — a multiplier that amplifies both gains **and** losses.
- **Capped vs Uncapped** — whether the most you can make or lose is limited, or open-ended.

---

## Good to know

- Prices shown are **live market data**, refreshed when you switch assets.
- The chart is a **simulation to help you understand and compare strategies** — a planning
  and learning tool, not financial advice. Always do your own research before trading.
