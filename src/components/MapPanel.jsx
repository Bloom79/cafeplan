import React, { useEffect, useMemo, useState } from 'react'
import { Circle, MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { gbp } from '../data/model.js'
import { applyListingToModel } from '../lib/applyListing.js'
import { gmapsHref, isWalled, listingHref, listingLabel, searchHref } from '../lib/links.js'
import { useLocalStorage } from '../hooks/useLocalStorage.js'
import { useListings } from '../hooks/useListings.js'

const EDINBURGH = [55.9435, -3.2015]

// The thesis in one shape: everything the case argues about — canal-side
// residential trade, walk-in catchment, the £14k rent anchor — is within a
// kilometre of Ashley Terrace. A pin outside it is a comparable, not a
// candidate, and on a plain map the two look identical.
const ANCHOR = [55.9323, -3.228] // Ashley Terrace, Shandon (Nominatim)
const CATCHMENT_M = 1000

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
  const [data] = useListings()
  const [band, setBand] = useState('all')
  const [statuses, setStatuses] = useLocalStorage('cafeplan:mapStatus', {
    live: true, under: true, gone: false,
  })
  const [favs] = useLocalStorage('cafeplan:favs', [])
  const [favsOnly, setFavsOnly] = useState(false)
  const [showCatchment, setShowCatchment] = useLocalStorage('cafeplan:catchment', true)

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
        <button
          className="filter-chip"
          aria-pressed={showCatchment}
          onClick={() => setShowCatchment(!showCatchment)}
          title="1 km around Ashley Terrace — the corridor the case is built on"
        >
          ◎ Target corridor
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
          {showCatchment && (
            <>
              {/* Dark casing first: a thin brass line alone disappears into
                  the pastel OSM raster. */}
              <Circle
                center={ANCHOR}
                radius={CATCHMENT_M}
                interactive={false}
                pathOptions={{ color: '#0c2321', weight: 6, opacity: 0.45, fill: false }}
              />
              <Circle
                center={ANCHOR}
                radius={CATCHMENT_M}
                pathOptions={{
                  color: '#d9a441', weight: 2.5, dashArray: '9 7',
                  fillColor: '#d9a441', fillOpacity: 0.08,
                }}
              >
                <Tooltip>Target corridor — 1 km around Ashley Terrace</Tooltip>
              </Circle>
            </>
          )}
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
                    <a className="cp-btn primary" href={listingHref(l)} target="_blank" rel="noreferrer">
                      {listingLabel(l)}
                    </a>
                    {l.url && isWalled(l) && (
                      <a className="cp-btn" href={searchHref(l)} target="_blank" rel="noreferrer">
                        via search ↗
                      </a>
                    )}
                    <button
                      className="cp-btn model"
                      onClick={() => { applyListingToModel(l); window.location.hash = '#model' }}
                    >
                      Run in the model →
                    </button>
                    <a className="cp-btn" href={gmapsHref(l)} target="_blank" rel="noreferrer">
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
