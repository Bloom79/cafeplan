import React, { Suspense, lazy, useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import ModelPanel from './components/ModelPanel.jsx'
import ListingsPanel from './components/ListingsPanel.jsx'
import CasePanel from './components/CasePanel.jsx'
import StepsPanel from './components/StepsPanel.jsx'
import { useListings } from './hooks/useListings.js'

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
  const h = window.location.hash.replace(/^#case-\d$/, '#case').slice(1)
  return VALID.has(h) ? h : null
}

export default function App() {
  const [tab, setTabState] = useState(() => readHash() || 'model')
  const [data] = useListings()

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
