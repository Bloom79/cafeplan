import { useEffect, useState } from 'react'

// Persisted state hook — the model edits, favourites and step statuses all
// live in the browser, so the site itself stays a static deploy.
export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw !== null ? JSON.parse(raw) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* private mode / quota — edits still work for the session */
    }
  }, [key, value])

  return [value, setValue]
}
