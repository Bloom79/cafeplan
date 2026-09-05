import { useEffect, useState } from 'react'

// A media query as state: the phone layout is a different layout, not a
// squeezed desktop, and a few components need to know which one they are in.
export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

export const usePhone = () => useMediaQuery('(max-width: 640px)')
