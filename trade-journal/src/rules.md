# Trading Rules — Perps / Leverage

_My personal risk rules. This file is the source of truth — edit it to update
the in-app Rules panel. Add to it over time._

## The one line

**Size from risk, not conviction. Never exceed my notional cap. Always have a real stop.**

Portfolio / notional cap: **$295,000 (1×)**. Risk per trade: **1% = $2,950**.

---

## 1. Cap total concurrent notional at $295k

- Exposure = the sum of ALL open position notional. Keep it at or under $295k.
- Watch it live: the left-pane exposure meter and `marginSummary.totalNtlPos`.
- It's a budget I spend down: `remaining = 295,000 − current open notional`. A new position must fit the remaining budget.
- Pre-decide tranches, e.g. max 3 concurrent positions ~$98k each, or one A+ at $200k + one runner at $95k.
- Backstop: set per-asset max leverage low on Hyperliquid (3–5×) so a fat-finger can't open an oversized position.

## 2. Treat correlated positions as one bucket

- Size against correlated risk, not per-ticker. Five crypto longs = one bet, not five.
- Buckets: **Crypto-beta** (BTC, ETH, SOL, HYPE, DOGE, alts — correlation 0.7–0.95) vs **Other** (HIP-3 equity/commodity perps like silver, MU — genuinely diversifying).
- Apply the cap per bucket AND to the whole book. Cap crypto-beta lower (e.g. $200k) so there's room for an uncorrelated position.
- Beta-weight high-beta alts (count small caps at 1.3–1.5× notional toward the crypto budget).
- Refresh a correlation view monthly — correlations regime-shift.

## 3. Size from risk, with a real stop

- Decide max loss FIRST; the stop distance then dictates size. Never the reverse.
- Formula: `size = risk$ ÷ stop distance`, where `risk$ = 1% × $295,000 = $2,950`.
- Example: BTC entry $110,000, stop $108,900 (1% away) → size $2,950 ÷ $1,100 = 2.68 BTC → $295k notional, risking exactly $2,950.
- Tighter stop → I can size bigger for the same dollar risk. Wider stop → smaller size.
- Mark the invalidation level (structure/liquidity) before entry — that's the stop, not a round number.
- Place the stop as a **resting order** immediately after fill. Mental stops don't count.
- Use the in-app **⚖ Risk** calculator to get size before every trade.

## 4. Actually take the stops

- A planned loss is a SUCCESSFUL trade. Target a 55–70% win rate with positive expectancy, not 100%.
- Never widen a stop once live. Widening turns a defined-risk trade into an undefined-risk one.
- Log every trade honestly — use the "Followed plan" toggle and A/B/C grade.
- Review rule-adherence % in the Stats panel weekly. That number matters more than P&L.

## 5. Aggressive size only on A+ setups, one at a time

- Size scales with conviction: **A+ = full R / max tranche, B = half, C = quarter or skip.**
- Only one max-size position at a time; a second concurrent trade shrinks both.
- Always know the liquidation price before entry (Positions panel shows it). Keep a buffer.

---

## Pre-trade checklist

1. Exposure budget has room (under $295k after this trade).
2. Stop level marked → size computed from risk.
3. Funding not extreme against me.
4. Whale cohort + real order-book liquidity not stacked against the trade.
5. Liquidation price ≥ 15% away.

If all five pass, take it at grade-appropriate size.

---

## Core principles

- **Daily circuit breaker:** stop trading after −3R (−$8,850) in a day. Protects against tilt/revenge.
- **Think in R-multiples,** not dollars. Expectancy (avg R per trade) is the north star.
- **Risk of ruin is non-linear with size.** 1% risk → a 10-loss streak is −10% (survivable). 5× leverage → one bad gap can be −50%, which needs +100% to recover.
- **Margin used ≠ exposure.** P&L swings track notional, not margin. Always watch notional.
- **Liquidation buffer ≥ 15–20%.** At high leverage on correlated longs, several liqs cluster in the same zone — cascade risk.
- **Funding is both a cost and a crowding signal.** Crowded-against-me funding = cut size.
