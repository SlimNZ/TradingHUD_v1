import type { ReactNode } from 'react'
import rulesMd from '../rules.md?raw'

// Inline: **bold** and `code`. Content is trusted (my own rules file), and
// everything is emitted as React text nodes, so there's no injection surface.
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|`(.+?)`/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] != null) out.push(<strong key={`${keyBase}-b${i}`}>{m[1]}</strong>)
    else out.push(<code key={`${keyBase}-c${i}`}>{m[2]}</code>)
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Minimal markdown → JSX for the rules file: #/##/### headings, ---, bullet
 * and numbered lists, bold/inline-code, and paragraphs. */
function renderMarkdown(md: string): ReactNode[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  let k = 0

  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `li${k}-${i}`)}</li>)
    blocks.push(list.ordered ? <ol key={`ol${k++}`}>{items}</ol> : <ul key={`ul${k++}`}>{items}</ul>)
    list = null
  }
  const flushPara = () => {
    if (!para.length) return
    const text = para.join(' ')
    blocks.push(<p key={`p${k++}`}>{inline(text, `p${k}`)}</p>)
    para = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    const numbered = /^\d+\.\s+(.*)$/.exec(line)

    if (h) {
      flushList(); flushPara()
      const level = h[1].length
      const content = inline(h[2], `h${k}`)
      blocks.push(
        level === 1 ? <h2 key={`h${k++}`} className="rule-h1">{content}</h2>
        : level === 2 ? <h3 key={`h${k++}`} className="rule-h2">{content}</h3>
        : <h4 key={`h${k++}`} className="rule-h3">{content}</h4>,
      )
    } else if (/^---+$/.test(line)) {
      flushList(); flushPara()
      blocks.push(<hr key={`hr${k++}`} />)
    } else if (bullet) {
      flushPara()
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] } }
      list.items.push(bullet[1])
    } else if (numbered) {
      flushPara()
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] } }
      list.items.push(numbered[1])
    } else if (line.trim() === '') {
      flushList(); flushPara()
    } else {
      para.push(line.replace(/^_(.*)_$/, '$1'))
    }
  }
  flushList(); flushPara()
  return blocks
}

export function RulesPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-modal rules-modal" onClick={(e) => e.stopPropagation()}>
        <div className="stats-head">
          <div>
            <div className="stats-title">Trading rules</div>
            <div className="stats-sub">edit src/rules.md to update</div>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Close rules">
            ✕
          </button>
        </div>
        <div className="rules-body">{renderMarkdown(rulesMd)}</div>
      </div>
    </div>
  )
}
