import React, { useEffect } from 'react'
import Gallery from './Gallery.jsx'

// The photos at full screen: the same strip, the whole viewport, a close
// button, and the advert one tap away. Escape or a tap outside closes it.
export default function Lightbox({ images, start = 0, title, href, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${title} — photos`} onClick={onClose}>
      <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
        <Gallery images={images} alt={title} start={start} className="full" />
      </div>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox-title">{title}</span>
        {href && <a className="action-btn ghost" href={href} target="_blank" rel="noreferrer">Open the advert ↗</a>}
        <button type="button" className="action-btn" onClick={onClose} aria-label="Close photos">✕ Close</button>
      </div>
    </div>
  )
}
