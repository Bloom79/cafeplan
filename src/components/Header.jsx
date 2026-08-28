import React from 'react'

export default function Header({ tab, setTab, tabs }) {
  return (
    <>
      <header className="site-header">
        <div className="wordmark">
          <span className="name">Canalside<span className="dot">.</span></span>
          <span className="eyebrow">Café business case — Edinburgh</span>
        </div>
        <div className="header-spacer" />
        <div className="header-meta">
          SHANDON · POLWARTH · MERCHISTON<br />
          UNION CANAL CORRIDOR
        </div>
      </header>
      <nav className="tabs" role="tablist" aria-label="Sections">
        {tabs.map(([id, label, count]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className="tab"
            onClick={() => setTab(id)}
          >
            {label}
            {count != null && <span className="count">{count}</span>}
          </button>
        ))}
      </nav>
    </>
  )
}
