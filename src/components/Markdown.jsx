import React from 'react'

// Minimal GFM renderer for agent reports: headings, bold, links, bullets,
// paragraphs. Enough for the verify comments and due-diligence reports —
// anything unrecognised renders as plain text.
export default function Markdown({ text }) {
  if (!text) return null
  const lines = String(text).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split('\n')
  const out = []
  let list = null

  const inline = (s, key) => {
    const parts = []
    let rest = s
    let n = 0
    while (rest) {
      const m = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\((https?:\/\/[^)]+)\))/.exec(rest)
      if (!m) { parts.push(<React.Fragment key={n++}>{rest}</React.Fragment>); break }
      if (m.index > 0) parts.push(<React.Fragment key={n++}>{rest.slice(0, m.index)}</React.Fragment>)
      if (m[2]) parts.push(<strong key={n++}>{m[2]}</strong>)
      else parts.push(<a key={n++} href={m[5]} target="_blank" rel="noreferrer">{m[4]}</a>)
      rest = rest.slice(m.index + m[0].length)
    }
    return <>{parts}</>
  }

  const flush = () => {
    if (list) { out.push(<ul key={`ul-${out.length}`}>{list}</ul>); list = null }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^\s*[-*]\s+/.test(line)) {
      list = list || []
      list.push(<li key={list.length}>{inline(line.replace(/^\s*[-*]\s+/, ''))}</li>)
    } else if (/^#{1,3}\s+/.test(line)) {
      flush()
      out.push(<h4 key={`h-${out.length}`}>{inline(line.replace(/^#{1,3}\s+/, ''))}</h4>)
    } else if (line === '') {
      flush()
    } else {
      flush()
      out.push(<p key={`p-${out.length}`}>{inline(line)}</p>)
    }
  }
  flush()
  return <div className="md">{out}</div>
}
