import { useState } from 'react'
import type { OpenPositions } from '../lib/hyperliquid'
import type { RiskConfig } from '../lib/risk'
import { computeExposure, sizeFromRisk } from '../lib/risk'
import { usd, price } from '../lib/format'

export function RiskPanel({
  config,
  positions,
  onChange,
  onClose,
}: {
  config: RiskConfig
  positions: OpenPositions | null
  onChange: (cfg: RiskConfig) => void
  onClose: () => void
}) {
  const cap = config.portfolioCap
  const riskDollars = (cap * config.riskPct) / 100

  const ex = positions ? computeExposure(positions) : null
  const openNotional = ex?.totalPerp ?? 0
  const remaining = Math.max(0, cap - openNotional)

  // calculator inputs
  const [entry, setEntry] = useState('')
  const [stop, setStop] = useState('')
  const e = parseFloat(entry)
  const st = parseFloat(stop)
  const res = sizeFromRisk(e, st, riskDollars)
  const overCapAlone = res ? res.notional > cap : false
  const overBudget = res ? res.notional > remaining : false
  const leverage = res ? res.notional / cap : 0

  const num = (v: string) => (v === '' ? '' : v)

  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="stats-head">
          <div>
            <div className="stats-title">Risk &amp; position sizing</div>
            <div className="stats-sub">size from risk · cap your exposure</div>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Close risk panel">
            ✕
          </button>
        </div>

        {/* Config */}
        <div className="risk-cfg">
          <label className="risk-field">
            <span className="klabel">Portfolio / notional cap (USD)</span>
            <input
              className="setup-input"
              type="number"
              value={num(String(config.portfolioCap))}
              onChange={(ev) => onChange({ ...config, portfolioCap: Math.max(0, Number(ev.target.value)) })}
            />
          </label>
          <label className="risk-field">
            <span className="klabel">Risk per trade (%)</span>
            <input
              className="setup-input"
              type="number"
              step="0.1"
              value={num(String(config.riskPct))}
              onChange={(ev) => onChange({ ...config, riskPct: Math.max(0, Number(ev.target.value)) })}
            />
          </label>
        </div>
        <div className="risk-derived mono">
          Max loss per trade = <b>{usd(riskDollars)}</b> ({config.riskPct}% of {usd(cap)})
        </div>

        {/* Live exposure vs cap */}
        {ex && (
          <div className="risk-exposure">
            <div className="stats-block-title">Live exposure</div>
            <div className="risk-expbar">
              <div
                className={`risk-expfill ${openNotional > cap ? 'over' : openNotional > cap * 0.75 ? 'warn' : ''}`}
                style={{ width: `${Math.min(100, cap > 0 ? (openNotional / cap) * 100 : 0)}%` }}
              />
            </div>
            <div className="risk-expnums mono">
              <span className={openNotional > cap ? 'red' : ''}>{usd(openNotional)} open</span>
              <span className="sep">·</span>
              <span>{usd(remaining)} left of {usd(cap)}</span>
              <span className="sep">·</span>
              <span>crypto {usd(ex.crypto)}{ex.other > 0 ? ` · other ${usd(ex.other)}` : ''}</span>
            </div>
          </div>
        )}

        {/* Calculator */}
        <div className="risk-calc">
          <div className="stats-block-title">Position-size calculator</div>
          <div className="risk-calc-inputs">
            <label className="risk-field">
              <span className="klabel">Entry price</span>
              <input className="setup-input" type="number" value={entry} placeholder="e.g. 110000"
                onChange={(ev) => setEntry(ev.target.value)} />
            </label>
            <label className="risk-field">
              <span className="klabel">Stop price</span>
              <input className="setup-input" type="number" value={stop} placeholder="e.g. 108900"
                onChange={(ev) => setStop(ev.target.value)} />
            </label>
          </div>

          {res ? (
            <div className="risk-out">
              <div className="risk-out-row">
                <span>Position size</span>
                <span className="mono">{res.size.toLocaleString('en-US', { maximumFractionDigits: 4 })} units</span>
              </div>
              <div className="risk-out-row">
                <span>Notional</span>
                <span className={`mono ${overCapAlone ? 'red' : ''}`}>{usd(res.notional)}</span>
              </div>
              <div className="risk-out-row">
                <span>Stop distance</span>
                <span className="mono">{price(res.stopDistance)} ({res.stopPct.toFixed(2)}%)</span>
              </div>
              <div className="risk-out-row">
                <span>Leverage vs cap</span>
                <span className={`mono ${leverage > 1 ? 'red' : ''}`}>{leverage.toFixed(2)}×</span>
              </div>
              <div className="risk-out-row">
                <span>Risk if stopped</span>
                <span className="mono">{usd(riskDollars)}</span>
              </div>
              {(overCapAlone || overBudget) && (
                <div className="risk-warn">
                  {overCapAlone
                    ? `⚠ This position alone is ${(res.notional / cap).toFixed(1)}× your ${usd(cap)} cap.`
                    : `⚠ Adding this would push total exposure over your ${usd(cap)} cap (only ${usd(remaining)} left).`}
                </div>
              )}
              {!overCapAlone && !overBudget && (
                <div className="risk-ok">✓ Within your cap and risk budget.</div>
              )}
            </div>
          ) : (
            <div className="stats-empty">
              Enter an entry and a different stop price to compute size. Size = risk ÷ stop
              distance, so a tighter stop allows a larger position at the same dollar risk.
            </div>
          )}
        </div>

        <div className="stats-foot">
          Cap and risk % are saved on this device. Sizing assumes a linear (USD-margin) contract
          and the risk is realized only if price reaches your stop — set the stop as a resting order.
        </div>
      </div>
    </div>
  )
}
