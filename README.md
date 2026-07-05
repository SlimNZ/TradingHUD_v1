# TradingHUD_v1
Trading Dashboard (Calendar with Daily PnL, Winrate, # of trades)

A monthly trade-journal calendar for Hyperliquid traders. Paste your main wallet
address and the app pulls your on-chain fills, groups them into round-trip
trades, and renders them as a color-coded calendar: green days = net profit,
red = net loss, with per-day trade lists, month stats, and a cumulative P&L
sparkline.

## Run locally

```bash
cd trade-journal
npm install
npm run dev     # open the printed localhost URL (default http://localhost:5173)
```

Paste your Hyperliquid **main account address** (not an agent/API wallet — those
return no fills), or click **Try demo data** to explore with a sample dataset.

## Journaling

Click a day, then any trade card, to add:
- A free-text **note** per trade and a **daily review** note for the day.
- A **grade** (A/B/C), a **followed plan** toggle, and a **setup** tag.

### Risk tools

- **Exposure meter** (left pane): live total perp notional vs a configurable
  cap, split into crypto-beta vs other (HIP-3/equities) buckets. Green under
  75%, amber to 100%, red over. Click it to open the risk panel.
- **⚖ Risk** panel (calendar header): set your portfolio/notional cap and
  risk-per-trade %, see live exposure vs cap, and a **position-size
  calculator** — enter price + stop and it returns size, notional, leverage,
  and whether the trade breaks your cap or remaining budget. Size = risk ÷
  stop distance. Cap/risk settings persist on the device.

### Journaling

The **📊 Stats** button (calendar header) summarizes all reviewed trades:
rule-adherence rate, and win rate + expectancy (avg net P&L per trade) broken
down by setup, session, and grade. Notes and grades are stored in the browser's
localStorage, keyed per wallet — they stay on your device and never leave it.

## Hosting (free, static)

The app is fully client-side and calls Hyperliquid's public API directly (it
sends open CORS headers), so any static host works with no server.

**GitHub Pages** (included): `.github/workflows/deploy.yml` builds and deploys on
every push to `main`. One-time setup: repo **Settings → Pages → Source =
GitHub Actions**. Vite `base: './'` makes assets resolve at the project subpath
(`https://<user>.github.io/TradingHUD_v1/`). Alternatives with a root-level URL:
Cloudflare Pages or Netlify (point them at `trade-journal/`, build
`npm run build`, output `dist`). Note localStorage journal notes are per-origin,
so notes saved locally won't appear on the hosted site (and vice versa).

## How it works

- `trade-journal/` — Vite + React + TypeScript app.
  - `src/lib/hyperliquid.ts` — data layer: fetches fills from the public
    Hyperliquid info API (paged via `userFillsByTime`, up to the ~10k-fill
    lookback), groups them into round-trip trades, and rolls them up into the
    `JournalMonth` payload the UI renders. No API key needed; read-only.
  - `src/components/` — `ConnectGate`, `LeftStats` (+ sparkline),
    `CalendarGrid` (day cells + weekly totals), `DetailPanel` (trade cards).
- In dev, API calls go through a Vite proxy (`/hl-api` →
  `https://api.hyperliquid.xyz`) so CORS can never bite; production builds call
  the API directly.
- Month arrows page through every month that has trade history. All times are
  bucketed into sessions (NY Open / London / Asia / NY PM) in
  `America/New_York`.

Notes: realized P&L is booked on **the day it was realized** (the day of the
closing fills), matching Hyperliquid's own attribution. A position scaled out
over several days appears on each of those days as a `partial` segment; the
segments sum to the trade's total. Still-open positions are excluded until
they return to flat — hit Refresh after closing. P&L figures are **net of
fees**: every daily/weekly/monthly total, best/worst day, and the sparkline
subtract trading fees, and each trade card shows its net P&L with the gross
(pre-fee) price P&L and the fee beside it. Fees are attributed to a trade, so
a fully-closed trade's fees always land with its realized P&L (verified: all
fees on flat positions are counted, and cards sum to the day total exactly).
A position still open at the end of the data defers its as-yet-unrealized
opening fees until it closes — consistent with excluding unrealized P&L.
**Funding is included**: it's fetched separately (paged `userFunding`) and
folded into daily/weekly/monthly P&L, with the trades-vs-funding split shown
in the left pane and detail panel. Days with funding but no closed trades
still appear (funding accrues on open positions). TP/SL display is supported
by the UI but not populated from fills — wire resting trigger orders if you
want it.

## Tax reconciliation (NZ / IRD)

Calendar days and trade times are bucketed in **NZ time** (`Pacific/Auckland`,
auto NZDT/NZST); trading sessions (NY Open, London, …) are still classified in
ET since those are US/global market windows. The left pane shows a **NZ
financial-year** total (1 Apr – 31 Mar, named by the end year: Apr 2025–Mar
2026 = FY2026) for the FY containing the month on screen, split into trades vs
funding.

Reconciled against Hyperliquid CSV exports (trade history, funding history,
deposits/withdrawals):
- All-time, incl. funding: **99.97%** (trade P&L 99.97%, funding 100%).
- **FY2026** (1 Apr 2025 – 31 Mar 2026): **99.91%** (trade 99.92%, funding 100%).

Notes for anyone auditing: the CSV `closedPnl` column is already **net of
fees** (don't subtract fees again); CSV timestamps are already NZ local time.
Residual gaps (<0.1%) are opening fees on positions still open at the data
window's end, which are booked when those positions close. The app reads the
public API (~10k most recent fills); this account fits fully, but accounts
with longer histories should reconcile against the complete CSV export. P&L is
trading P&L + funding; deposits/withdrawals are cash flow, not taxable P&L.
Spot vs perp/derivative gains may be taxed differently — reconcile the split
against the CSV's order-type column if your return needs it.
