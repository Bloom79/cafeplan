import { useEffect, useRef, useState } from 'react'

// True once the element has been near the viewport — used to defer the
// map thumbnails (four tile requests each) until a card is actually about
// to be seen. Sticks at true: a thumbnail that loaded stays loaded.
export function useInView(margin = '300px') {
  const ref = useRef(null)
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const el = ref.current
    if (seen || !el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [seen, margin])

  return [ref, seen]
}
