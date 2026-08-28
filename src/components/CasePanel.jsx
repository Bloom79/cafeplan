import React, { useEffect, useState } from 'react'
import { CASE_SECTIONS } from '../data/businessCase.js'

export default function CasePanel() {
  const [active, setActive] = useState(() => {
    const hash = window.location.hash.match(/^#case-(\d)$/)
    return hash ? parseInt(hash[1], 10) : 1
  })

  const section = CASE_SECTIONS[active - 1]

  useEffect(() => {
    window.history.replaceState(null, '', `#case-${active}`)
    window.scrollTo({ top: 0 })
  }, [active])

  return (
    <div className="case-layout">
      <nav className="case-toc" aria-label="Business case sections">
        {CASE_SECTIONS.map((s) => (
          <a
            key={s.n}
            href={`#case-${s.n}`}
            className={s.n === active ? 'sel' : ''}
            aria-current={s.n === active ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); setActive(s.n) }}
          >
            <span className="n">{String(s.n).padStart(2, '0')}</span>
            {s.title}
          </a>
        ))}
      </nav>

      <article className="case-article panel" style={{ padding: '26px clamp(18px, 3vw, 34px)' }}>
        <h2>{section.title}</h2>
        <div className="sec-eyebrow">Section {String(section.n).padStart(2, '0')} / 09</div>
        {section.blocks.map((b, i) => {
          if (b.p) return <p key={i}>{b.p}</p>
          if (b.h) return <h3 key={i}>{b.h}</h3>
          if (b.ul) return <ul key={i}>{b.ul.map((li, j) => <li key={j}>{li}</li>)}</ul>
          if (b.table) {
            const [head, ...rows] = b.table
            return (
              <table className="case-table" key={i}>
                <thead><tr>{head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((row, j) => (
                    <tr key={j}>{row.map((cell, k) => <td key={k}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            )
          }
          return null
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26 }}>
          {section.n > 1 ? (
            <button className="scenario-pill" onClick={() => setActive(section.n - 1)}>
              ← {CASE_SECTIONS[section.n - 2].title}
            </button>
          ) : <span />}
          {section.n < CASE_SECTIONS.length && (
            <button className="scenario-pill" onClick={() => setActive(section.n + 1)}>
              {CASE_SECTIONS[section.n].title} →
            </button>
          )}
        </div>
      </article>
    </div>
  )
}
