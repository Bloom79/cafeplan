import React, { Suspense, lazy, useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import ModelPanel from './components/ModelPanel.jsx'
import ListingsPanel from './components/ListingsPanel.jsx'
import CasePanel from './components/CasePanel.jsx'
import StepsPanel from './components/StepsPanel.jsx'
import { useListings } from './hooks/useListings.js'
import { useLocalStorage } from './hooks/useLocalStorage.js'

// The first visit — yours, or the partner's from a sync code. Four lines
// on what the tabs are for, gone for good once dismissed.
function StartHere({ onDone }) {
  return (
    <div className="panel start-here" role="note">
      <b>Start here.</b>
      <ol>
        <li><b>Model</b> — your café, as numbers. Change any assumption; profit, take-home and the month-by-month cash follow.</li>
        <li><b>Listings</b> — what is actually for sale, ranked against your own model. Save the ones to call, dismiss the rest.</li>
        <li><b>On a card</b> — the deal sheet: what to ask, what to look for, what to see before an offer; the fair-price check says where to open.</li>
        <li><b>Next steps</b> — the six gates between interesting and signed. <b>Export PDF</b> prints all of it.</li>
      </ol>
      <span className="muted">Everything you type stays in this browser; <b>Sync</b> shares it with another device, <b>Backup</b> keeps a file.</span>
      <button className="filter-chip" onClick={onDone}>Got it</button>
    </div>
  )
}

// Leaflet is a third of the bundle and only the Map tab needs it — load it
// when that tab is opened, not on the first paint of the Model tab.
const MapPanel = lazy(() => import('./components/MapPanel.jsx'))
const PrintView = lazy(() => import('./components/PrintView.jsx'))

const TABS = [
  ['model', 'Model'],
  ['listings', 'Listings'],
  ['map', 'Map'],
  ['case', 'Business case'],
  ['steps', 'Next steps'],
]

const VALID = new Set([...TABS.map(([id]) => id), 'print'])

const readHash = () => {
  const h = window.location.hash.replace(/^#case-\d+$/, '#case').slice(1)
  return VALID.has(h) ? h : null
}

export default function App() {
  const [tab, setTabState] = useState(() => readHash() || 'model')
  const [data] = useListings()
  const [started, setStarted] = useLocalStorage('cafeplan:started', false)

  const setTab = (t) => {
    window.history.replaceState(null, '', `#${t}`)
    window.scrollTo({ top: 0 })
    setTabState(t)
  }

  useEffect(() => {
    const onHash = () => {
      const h = readHash()
      if (h) setTabState(h)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const tabs = TABS.map(([id, label]) =>
    id === 'listings' ? [id, label, data.listings.length] : [id, label],
  )

  // The document view stands alone: no tabs, no chrome, ready for paper.
  if (tab === 'print') {
    return (
      <Suspense fallback={<div className="empty panel">preparing the document…</div>}>
        <PrintView onClose={() => setTab('case')} />
      </Suspense>
    )
  }

  return (
    <>
      <Header tab={tab} setTab={setTab} tabs={tabs} onPrint={() => setTab('print')} />
      <main className="page" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {!started && <StartHere onDone={() => setStarted(true)} />}
        {tab === 'model' && <ModelPanel />}
        {tab === 'listings' && <ListingsPanel />}
        {tab === 'map' && (
          <Suspense fallback={<div className="empty panel">loading the map…</div>}>
            <MapPanel />
          </Suspense>
        )}
        {tab === 'case' && <CasePanel />}
        {tab === 'steps' && <StepsPanel />}
      </main>
      <footer className="site-footer">
        <span>Canalside · working business case · Aug 2026</span>
        <span>edits &amp; notes stay in your browser — the site is static</span>
      </footer>
    </>
  )
}
