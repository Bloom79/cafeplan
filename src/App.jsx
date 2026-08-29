import React, { useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import ModelPanel from './components/ModelPanel.jsx'
import ListingsPanel from './components/ListingsPanel.jsx'
import MapPanel from './components/MapPanel.jsx'
import CasePanel from './components/CasePanel.jsx'
import StepsPanel from './components/StepsPanel.jsx'
import { SEED_DATA } from './data/listings.js'

const TABS = [
  ['model', 'Model'],
  ['listings', 'Listings', SEED_DATA.listings.length],
  ['map', 'Map'],
  ['case', 'Business case'],
  ['steps', 'Next steps'],
]

const VALID = new Set(TABS.map(([id]) => id))

export default function App() {
  const [tab, setTabState] = useState(() => {
    const h = window.location.hash.replace(/^#case-\d$/, '#case')
    return VALID.has(h.slice(1)) ? h.slice(1) : 'model'
  })

  const setTab = (t) => {
    window.history.replaceState(null, '', `#${t}`)
    window.scrollTo({ top: 0 })
    setTabState(t)
  }

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#case-\d$/, '#case')
      if (VALID.has(h.slice(1))) setTabState(h.slice(1))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <>
      <Header tab={tab} setTab={setTab} tabs={TABS} />
      <main className="page">
        {tab === 'model' && <ModelPanel />}
        {tab === 'listings' && <ListingsPanel />}
        {tab === 'map' && <MapPanel />}
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
