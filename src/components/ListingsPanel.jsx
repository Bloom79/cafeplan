import React from 'react'
import { AREAS, LISTINGS } from '../data/listings.js'
import { gbp } from '../data/model.js'
import { useLocalStorage } from '../hooks/useLocalStorage.js'

export default function ListingsPanel() {
  const [area, setArea] = useLocalStorage('cafeplan:area', 'All')
  const [favsOnly, setFavsOnly] = useLocalStorage('cafeplan:favsOnly', false)
  const [favs, setFavs] = useLocalStorage('cafeplan:favs', [])

  const toggleFav = (id) =>
    setFavs(favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id])

  const shown = LISTINGS.filter(
    (l) => (area === 'All' || l.area === area) && (!favsOnly || favs.includes(l.id)),
  )

  return (
    <>
      <div className="filters-row">
        {AREAS.map((ar) => (
          <button
            key={ar}
            className="filter-chip"
            aria-pressed={area === ar}
            onClick={() => setArea(ar)}
          >
            {ar}
          </button>
        ))}
        <button
          className="filter-chip"
          aria-pressed={favsOnly}
          onClick={() => setFavsOnly(!favsOnly)}
          title="Show saved listings only"
        >
          ♥ Saved {favs.length > 0 && `(${favs.length})`}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="empty panel">
          No listings match. Clear the area filter or turn off “♥ Saved”.
        </div>
      ) : (
        <div className="listing-grid">
          {shown.map((l) => (
            <article key={l.id} className={`listing ${favs.includes(l.id) ? 'fav' : ''}`}>
              <div className="top">
                <h3>{l.name}</h3>
                <button
                  className={`fav-btn ${favs.includes(l.id) ? 'on' : ''}`}
                  aria-label={favs.includes(l.id) ? `Remove ${l.name} from saved` : `Save ${l.name}`}
                  aria-pressed={favs.includes(l.id)}
                  onClick={() => toggleFav(l.id)}
                >
                  {favs.includes(l.id) ? '★' : '☆'}
                </button>
              </div>
              <div className="price">{l.price != null ? gbp(l.price) : 'POA'}</div>
              <div className="meta">
                <span>{l.area} · {l.tenure}</span>
                {l.rent != null && <span>Rent {gbp(l.rent)}/yr</span>}
                {l.turnover != null && (
                  <span>Turnover {gbp(l.turnover)}/yr · profit {gbp(l.profit)} ({Math.round((l.profit / l.turnover) * 100)}%)</span>
                )}
              </div>
              <span className={`status-badge ${l.status === 'under offer' ? 'under' : 'active'}`}>
                {l.status}
              </span>
              <div className="tag-row">{l.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
              <p className="notes">{l.notes}</p>
              <span className="src">snapshot · {l.source}</span>
            </article>
          ))}
        </div>
      )}

      <p className="footnote" style={{ marginTop: 18 }}>
        Seeded with the Aug 2026 research comparables (Rightbiz / Daltons). These are snapshots, not
        live listings — verify anything promising directly with the agent, and always ask for real
        trading accounts before trusting an asking price.
      </p>
    </>
  )
}
