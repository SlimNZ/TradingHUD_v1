import { useState } from 'react'

interface Props {
  loading: boolean
  error: string | null
  onConnect: (wallet: string) => void
  onDemo: () => void
}

export function ConnectGate({ loading, error, onConnect, onDemo }: Props) {
  const [value, setValue] = useState('')
  const submit = () => {
    const v = value.trim()
    if (v && !loading) onConnect(v)
  }

  return (
    <div className="gate-wrap">
      <div className="gate-card">
        <div className="gate-eyebrow">TRADE JOURNAL</div>
        <div className="gate-h1">Connect your wallet</div>
        <div className="gate-sub">
          Paste your Hyperliquid main wallet address. We read your on-chain fills and build your
          monthly journal automatically.
        </div>
        <input
          className="gate-input"
          placeholder="0x…"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          autoFocus
        />
        <button className="gate-primary" onClick={submit} disabled={loading}>
          {loading ? 'Fetching fills…' : 'Connect wallet'}
        </button>
        {error && <div className="gate-error">{error}</div>}
        <div className="gate-or">
          <div className="line" />
          <span>OR</span>
          <div className="line" />
        </div>
        <div className="gate-row">
          <button className="gate-secondary" disabled title="Coming soon">
            Import CSV
          </button>
          <button className="gate-secondary" onClick={onDemo} disabled={loading}>
            Try demo data
          </button>
        </div>
        <div className="gate-foot">
          <span className="grn">✓</span>
          <span>
            Read-only. Use your <b>main account address</b>, not an agent / API wallet. Nothing is
            signed and no funds can move.
          </span>
        </div>
      </div>
    </div>
  )
}
