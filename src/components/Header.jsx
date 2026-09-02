import React, { useRef } from 'react'
import SyncPanel from './SyncPanel.jsx'

// Short labels for narrow screens — "Business case" and "Next steps" were
// the two that fell off the right edge of the tab strip on a phone.
const SHORT = { model: 'Model', listings: 'Listings', map: 'Map', case: 'Case', steps: 'Steps' }

export default function Header({ tab, setTab, tabs }) {
  const navRef = useRef(null)

  // Arrow keys move between tabs, as a tablist is expected to.
  const onKeyDown = (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const i = tabs.findIndex(([id]) => id === tab)
    const next = tabs[(i + step + tabs.length) % tabs.length][0]
    setTab(next)
    navRef.current?.querySelector(`#tab-${next}`)?.focus()
  }

  return (
    <>
      <header className="site-header">
        <div className="wordmark">
          <span className="name">Canalside<span className="dot">.</span></span>
          <span className="eyebrow">Café business case — Edinburgh</span>
        </div>
        <div className="header-spacer" />
        <SyncPanel />
        <div className="header-meta">
          SHANDON · POLWARTH · MERCHISTON<br />
          UNION CANAL CORRIDOR
        </div>
      </header>
      <nav className="tabs" role="tablist" aria-label="Sections" ref={navRef} onKeyDown={onKeyDown}>
        {tabs.map(([id, label, count]) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className="tab"
            onClick={() => setTab(id)}
          >
            <span className="long">{label}</span>
            <span className="short">{SHORT[id] || label}</span>
            {count != null && <span className="count">{count}</span>}
          </button>
        ))}
      </nav>
    </>
  )
}
