// UI smoke tests: build the app, serve dist/, drive it headless. Run with
// `npm run test:ui` (needs `npx playwright install chromium` once). Kept out
// of `npm test` so the unit suite stays instant.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const PORT = 4199
const BASE = `http://localhost:${PORT}/cafeplan/`

let server, browser, page
const errors = []

const waitFor = async (url, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(url)).ok) return } catch { /* not yet */ }
    await sleep(250)
  }
  throw new Error('preview server did not start')
}

before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  await waitFor(BASE)
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => errors.push(String(e)))
})

after(async () => {
  await browser?.close()
  server?.kill()
})

test('model tab renders the live figures and the trading-day ribbon', async () => {
  await page.goto(BASE + '#model', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.stat .v')
  const stats = await page.locator('.stat .v').allTextContents()
  assert.equal(stats.length, 4)
  assert.match(stats[0], /^£[\d,]+$/)
  assert.ok(await page.locator('.ribbon-svg').count())
})

test('listings tab shows cards with verdicts and the compare view toggles', async () => {
  await page.goto(BASE + '#listings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.listing')
  assert.ok((await page.locator('.listing').count()) >= 5)
  assert.ok((await page.locator('.verdict-line').count()) >= 1)
  await page.getByRole('button', { name: /Compare/ }).click()
  await page.waitForSelector('.compare th')
  const heads = await page.locator('.compare th').allTextContents()
  assert.ok(heads.some((h) => /Verdict/.test(h)))
  await page.getByRole('button', { name: /Compare/ }).click()
})

test('saving a scenario adds a chip; steps checkbox persists', async () => {
  await page.goto(BASE + '#model', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.save-as')
  await page.locator('.save-as').click()
  await page.locator('.save-form input').fill('smoke test')
  await page.locator('.save-form .scenario-pill').click()
  assert.ok((await page.locator('.saved-chip').count()) >= 1)
  await page.goto(BASE + '#steps', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.step-check')
  await page.locator('.step-check').first().check()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.step-check')
  assert.equal(await page.locator('.step-check').first().isChecked(), true)
})

test('print view renders the document with KPIs and case sections', async () => {
  await page.goto(BASE + '#print', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.print-kpis')
  assert.equal(await page.locator('.print-kpis div').count(), 6)
  assert.ok((await page.locator('.print-section.case').count()) >= 9)
})

test('no page errors across the tabs', () => {
  assert.deepEqual(errors, [])
})
