import React, { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { SEED_DATA } from '../data/listings.js'
import { gbp } from '../data/model.js'
import { DATA_URL } from '../config.js'
import { useLocalStorage } from '../hooks/useLocalStorage.js'

const EDINBURGH = [55.9435, -3.2015]

const STATUS_COLOR = {
  live: '#4ca97e',      // stream-green: for sale
  under: '#d9a441',     // brass: under offer
  gone: '#c96f4a',      // clay: gone
}

const statusOf = (l) =>
  l.status === 'gone' ? 'gone' : l.status === 'under offer' ? 'under' : 'live'

const pinIcon = (color) =>
  L.divIcon({
    className: 'cp-pin',
    html: `<span class="cp-dot" style="--pin:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  })

// Fit the map to the visible markers whenever filters change.
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length <= 1) return
    map.fitBounds(L.latLngBounds(points.map((l) => [l.lat, l.lng])).pad(0.2), {
      animate: true,
    })
  }, [points, map])
  return null
}

const PRICE_BANDS = [
  ['all', 'Any price'],
  ['low', 'under £25k'],
  ['mid', '£25k–£40k'],
  ['high', 'over £40k'],
]

const bandOf = (l) => {
  if (l.price == null) return 'mid'
  if (l.price < 25000) return 'low'
  if (l.price <= 40000) return 'mid'
  return 'high'
}

export default function MapPanel() {
  const [data, setData] = useState(SEED_DATA)
  const [band, setBand] = useState('all')
  const [statuses, setStatuses] = useLocalStorage('cafeplan:mapStatus', {
    live: true, under: true, gone: false,
  })
  const [favs, setFavs] = useLocalStorage('cafeplan:favs', [])
  const [favsOnly, setFavsOnly] = useState(false)

  useEffect(() => {
    fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {})
  }, [])

  const shown = useMemo(
    () =>
      data.listings.filter(
        (l) =>
          l.lat != null &&
          l.lng != null &&
          (band === 'all' || bandOf(l) === band) &&
          statuses[statusOf(l)] !== false &&
          (!favsOnly || favs.includes(l.id)),
      ),
    [data, band, statuses, favsOnly, favs],
  )

  const areas = useMemo(
    () => [...new Set(data.listings.map((l) => l.area))],
    [data],
  )

  const toggleStatus = (s) => setStatuses({ ...statuses, [s]: !statuses[s] })

  return (
    <>
      <div className="filters-row map-filters">
        <button
          className="filter-chip"
          aria-pressed={statuses.live}
          onClick={() => toggleStatus('live')}
        >
          <span className="dot" style={{ background: STATUS_COLOR.live }} /> for sale
        </button>
        <button
          className="filter-chip"
          aria-pressed={statuses.under}
          onClick={() => toggleStatus('under')}
        >
          <span className="dot" style={{ background: STATUS_COLOR.under }} /> under offer
        </button>
        <button
          className="filter-chip"
          aria-pressed={statuses.gone}
          onClick={() => toggleStatus('gone')}
        >
          <span className="dot" style={{ background: STATUS_COLOR.gone }} /> gone
        </button>
        <select
          className="status-select"
          value={band}
          aria-label="Price band"
          onChange={(e) => setBand(e.target.value)}
        >
          {PRICE_BANDS.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <button
          className="filter-chip"
          aria-pressed={favsOnly}
          onClick={() => setFavsOnly(!favsOnly)}
        >
          ♥ Saved {favs.length > 0 && `(${favs.length})`}
        </button>
        <span className="updated-line mono">
          {shown.length} of {data.listings.length} on map · data {data.updated}
        </span>
      </div>

      <div className="panel map-wrap">
        <MapContainer center={EDINBURGH} zoom={12} className="the-map" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <FitBounds points={shown} />
          {shown.map((l) => {
            const st = statusOf(l)
            return (
              <Marker key={l.id} position={[l.lat, l.lng]} icon={pinIcon(STATUS_COLOR[st])}>
                <Popup>
                  <div className="cp-pop">
                    {l.image && (
                      <img
                        className="cp-pop-img"
                        src={l.image}
                        alt=""
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    )}
                    <strong>{l.name}</strong>
                    <span className="cp-pop-meta">
                      {l.area} · {l.price != null ? gbp(l.price) : 'POA'}
                      {l.rent != null && ` · rent ${gbp(l.rent)}/yr`}
                    </span>
                    <span className={`cp-pop-status ${st}`}>
                      {st === 'live' ? 'for sale' : st === 'under' ? 'under offer' : 'gone / withdrawn'}
                    </span>
                    <a className="cp-btn primary" href={l.url} target="_blank" rel="noreferrer">
                      Open the listing ↗
                    </a>
                    <a
                      className="cp-btn"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name} ${l.area} Edinburgh`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Google Maps ↗
                    </a>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>

      <p className="footnote" style={{ marginTop: 14 }}>
        Points sit at the listing's exact address when known, at the area centre otherwise —
        the agent refines them at every verification. Areas covered so far: {areas.join(' · ')}.
      </p>
    </>
  )
}
