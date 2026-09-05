import React, { useRef, useState } from 'react'

// The photos of a listing, one screen at a time: a scroll-snap strip you
// swipe on a phone and scroll on a desk, with dots and a counter. No
// library, no JavaScript in the swipe itself — the browser does the
// snapping; we only read where it landed to light the right dot.
export default function Gallery({ images = [], alt = '', className = '', height, onOpen }) {
  const ref = useRef(null)
  const [i, setI] = useState(0)
  const [broken, setBroken] = useState(() => new Set())
  const pics = images.filter((u) => u && !broken.has(u))
  if (!pics.length) return null

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
    if (idx !== i) setI(idx)
  }
  const go = (n) => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className={`gallery ${className}`} style={height ? { '--gallery-h': `${height}px` } : undefined}>
      <div className="gallery-strip" ref={ref} onScroll={onScroll}>
        {pics.map((u, n) => (
          <img
            key={u}
            src={u}
            alt={n === 0 ? alt : ''}
            loading={n === 0 ? 'eager' : 'lazy'}
            draggable={false}
            onClick={onOpen}
            onError={() => setBroken((s) => new Set([...s, u]))}
          />
        ))}
      </div>
      {pics.length > 1 && (
        <>
          <div className="gallery-dots" aria-hidden="true">
            {pics.map((u, n) => <span key={u} className={n === i ? 'on' : ''} />)}
          </div>
          <span className="gallery-count mono">{Math.min(i + 1, pics.length)}/{pics.length}</span>
          <button type="button" className="gallery-nav prev" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); go(Math.max(0, i - 1)) }}>‹</button>
          <button type="button" className="gallery-nav next" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); go(Math.min(pics.length - 1, i + 1)) }}>›</button>
        </>
      )}
    </div>
  )
}
