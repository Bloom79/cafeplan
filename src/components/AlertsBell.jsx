import React, { useEffect, useState } from 'react'
import { WORKER_URL, VAPID_PUBLIC_KEY } from '../config.js'

// One-tap push alerts: new listing, price drop, listing gone. Subscription
// lives in the browser's push service; the worker keeps the endpoint in KV.

const b64ToU8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export default function AlertsBell() {
  // idle | on | busy | denied — initial value computed once, outside render churn.
  const [state, setState] = useState(() => (supported() ? 'idle' : 'unsupported'))
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!supported()) return
    let alive = true
    navigator.serviceWorker.getRegistration('sw.js').then(async (reg) => {
      const sub = await reg?.pushManager?.getSubscription()
      if (alive && sub) setState('on')
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const flash = (text) => { setMsg(text); setTimeout(() => setMsg(null), 6000) }

  const enable = async () => {
    setState('busy')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState('denied'); flash('notifications blocked — allow them in the browser settings'); return }
      const reg = await navigator.serviceWorker.register('sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToU8(VAPID_PUBLIC_KEY),
      })
      const res = await fetch(`${WORKER_URL}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!res.ok) throw new Error('worker ' + res.status)
      setState('on')
      // Prove the pipe end-to-end so "it worked" is visible on the phone.
      fetch(`${WORKER_URL}/test-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {})
      flash('alerts on — a test notification is on its way')
    } catch (e) {
      setState('idle')
      flash('could not enable alerts: ' + String(e.message || e))
    }
  }

  const disable = async () => {
    setState('busy')
    try {
      const reg = await navigator.serviceWorker.getRegistration('sw.js')
      const sub = await reg?.pushManager?.getSubscription()
      if (sub) {
        await fetch(`${WORKER_URL}/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe()
      }
      setState('idle')
      flash('alerts off')
    } catch {
      setState('idle')
    }
  }

  if (state === 'unsupported') return null

  return (
    <span className="alerts-bell">
      <button
        className="filter-chip"
        aria-pressed={state === 'on'}
        disabled={state === 'busy'}
        onClick={state === 'on' ? disable : enable}
        title="Get a notification for new listings, price drops and delistings"
      >
        {state === 'on' ? '🔔 Alerts on' : state === 'busy' ? '…' : '🔕 Get alerts'}
      </button>
      {msg && <span className="bell-msg">{msg}</span>}
    </span>
  )
}
