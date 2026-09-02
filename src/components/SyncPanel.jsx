import React, { useState } from 'react'
import { WORKER_URL } from '../config.js'

// Workspace sync: everything you type into the app lives in this browser.
// "Share" uploads a snapshot under a short code; "Load" on another device
// (or your partner's phone) pulls it in and merges. No accounts.

const KEYS = [
  'cafeplan:favs', 'cafeplan:dismissed', 'cafeplan:listingNotes', 'cafeplan:sdeInputs', 'cafeplan:deals',
  'cafeplan:savedScenarios', 'cafeplan:steps', 'cafeplan:model', 'cafeplan:scenario',
]

const read = (k) => { try { return JSON.parse(window.localStorage.getItem(k)) } catch { return null } }
const write = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }

const newCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

// Merge rule: lists union, notes/inputs keep the incoming where the local
// slot is empty, saved scenarios union by name, step statuses prefer
// whichever is further along. Model assumptions: incoming wins only if you
// have never edited yours.
const merge = (incoming) => {
  for (const k of ['cafeplan:favs', 'cafeplan:dismissed']) {
    const a = read(k) || [], b = incoming[k] || []
    write(k, [...new Set([...a, ...b])])
  }
  for (const k of ['cafeplan:listingNotes', 'cafeplan:sdeInputs', 'cafeplan:deals']) {
    const a = read(k) || {}, b = incoming[k] || {}
    write(k, { ...b, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v && (typeof v !== 'object' || Object.keys(v).length))) })
  }
  {
    const a = read('cafeplan:savedScenarios') || [], b = incoming['cafeplan:savedScenarios'] || []
    const byName = new Map([...b, ...a].map((s) => [s.name, s]))
    write('cafeplan:savedScenarios', [...byName.values()])
  }
  {
    const order = { todo: 0, 'in progress': 1, blocked: 1, done: 2 }
    const a = read('cafeplan:steps') || {}, b = incoming['cafeplan:steps'] || {}
    const out = { ...b }
    for (const [id, s] of Object.entries(a)) {
      const t = b[id]
      out[id] = !t || (order[s.status] ?? 0) >= (order[t.status] ?? 0) ? { ...t, ...s, note: s.note || t?.note || '' } : { ...s, ...t }
    }
    write('cafeplan:steps', out)
  }
  if (!read('cafeplan:model') && incoming['cafeplan:model']) {
    write('cafeplan:model', incoming['cafeplan:model'])
    write('cafeplan:scenario', incoming['cafeplan:scenario'] || 'custom')
  }
}

export default function SyncPanel() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(() => read('cafeplan:syncCode') || '')
  const [input, setInput] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const share = async () => {
    setBusy(true)
    try {
      const c = code || newCode()
      const data = Object.fromEntries(KEYS.map((k) => [k, read(k)]).filter(([, v]) => v != null))
      const res = await fetch(`${WORKER_URL}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c, data }),
      })
      if (!res.ok) throw new Error('worker ' + res.status)
      setCode(c)
      write('cafeplan:syncCode', c)
      setMsg(`shared as ${c} — enter it on the other device`)
    } catch (e) {
      setMsg('could not share: ' + String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  const load = async () => {
    const c = input.trim().toUpperCase()
    if (!/^[A-Z0-9]{6,12}$/.test(c)) { setMsg('enter the 8-character code'); return }
    setBusy(true)
    try {
      const res = await fetch(`${WORKER_URL}/sync?code=${c}`, { cache: 'no-store' })
      if (res.status === 404) throw new Error('no workspace under that code (they expire after 90 days)')
      if (!res.ok) throw new Error('worker ' + res.status)
      const { data } = await res.json()
      merge(data || {})
      setCode(c)
      write('cafeplan:syncCode', c)
      setMsg('loaded and merged — reloading')
      setTimeout(() => window.location.reload(), 900)
    } catch (e) {
      setMsg(String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sync">
      <button className="filter-chip" aria-expanded={open} onClick={() => setOpen(!open)} title="Share this workspace with another device or your partner">
        ⇅ Sync{code ? ` · ${code}` : ''}
      </button>
      {open && (
        <div className="sync-pop panel">
          <p>
            Your favourites, notes, fair-price inputs, saved scenarios and step statuses live in this browser.
            Share them with a code; load a code on another device to merge them in.
          </p>
          <div className="sync-row">
            <button className="action-btn" disabled={busy} onClick={share}>
              {code ? `Update share ${code}` : 'Share this workspace'}
            </button>
          </div>
          <div className="sync-row">
            <input
              className="sync-input mono"
              placeholder="code from the other device"
              value={input}
              maxLength={12}
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="action-btn ghost" disabled={busy} onClick={load}>Load</button>
          </div>
          {msg && <p className="sync-msg">{msg}</p>}
        </div>
      )}
    </div>
  )
}
