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

## Tax reconciliation

Reconciled against Hyperliquid CSV exports (trade history, funding history,
deposits/withdrawals) at the grand-total level: trade P&L matches 99.97% and
funding 100%. Notes for anyone auditing: the CSV `closedPnl` column is
already **net of fees** (don't subtract fees again); CSV timestamps are in
**local time** (this account's exports are NZ, UTC+12/+13), while the app
buckets days in `America/New_York` — totals are tz-independent but per-day
and per-month attribution near midnight can shift, and tax-year boundaries
(e.g. NZ 1 Apr–31 Mar) should be computed in local time. The app reads the
public API (~10k most recent fills); accounts with longer histories should
reconcile against the full CSV export.
