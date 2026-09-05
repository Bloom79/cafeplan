// Phone-width screenshots of a running preview: `node ui-tests/shot.mjs <base-url> <out-dir>`.
import { chromium } from 'playwright'
const [base = 'http://localhost:4201/cafeplan/', out = '.'] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await page.goto(base, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.listing.compact')
await page.screenshot({ path: `${out}/phone-listings.png` })
await page.locator('.listing.compact').first().click()
await page.waitForSelector('.card-actions')
await page.screenshot({ path: `${out}/phone-card.png` })
await browser.close()
console.log('saved', `${out}/phone-listings.png`, `${out}/phone-card.png`)
