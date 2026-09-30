import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void }
declare const document: { documentElement: { scrollWidth: number } }
declare const window: { scrollTo(options: { top: number; left: number; behavior: 'instant' }): void; scrollY: number }

const key = 'quantdesk:portfolio-collection:v1'
const legacyKey = 'quantdesk:pf-global:risk-approval:v1'
const trackedKeys = [key, legacyKey, 'snapshot-review:unrelated']
const ready = 'Comparison ready. No saved data was changed.'
interface Envelope { format: string; version: number; product: string; scope: string; createdAt: string; payload: Record<string, unknown> }
async function saved(page: Page) {
  return page.evaluate(keys => keys.map(name => [name, localStorage.getItem(name)]), trackedKeys)
}
async function prepare(page: Page) {
  await page.goto('/')
  const raw = await page.evaluate<string>('import("/src/risk/snapshot-workbench/portfolioCollection.ts").then(module => JSON.stringify(module.seedPortfolioCollection()))')
  await page.evaluate(({ key, legacyKey, raw }) => {
    localStorage.setItem(key, raw)
    localStorage.setItem(legacyKey, 'retained legacy source')
    localStorage.setItem('snapshot-review:unrelated', 'private unrelated bytes')
  }, { key, legacyKey, raw })
  await page.getByRole('link', { name: 'Snapshots', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Collection snapshots', exact: true })).toBeVisible()
  return { format: 'collection-snapshot', version: 1, product: 'QuantDesk', scope: 'portfolio-collection',
    createdAt: '2026-09-30T12:00:00.000Z', payload: JSON.parse(raw) as Record<string, unknown> } satisfies Envelope
}
async function compareText(page: Page, snapshot: Envelope) {
  await page.getByRole('textbox', { name: 'Snapshot JSON', exact: true }).fill(JSON.stringify(snapshot))
  await page.getByRole('button', { name: 'Compare snapshot', exact: true }).click()
  await expect(page.getByText(ready, { exact: true })).toBeVisible()
}
function changedSnapshot(snapshot: Envelope): Envelope {
  const records = snapshot.payload['portfolios'] as Record<string, unknown>[]
  const first = records[0]
  if (!first) throw new Error('Expected a primary fixture record')
  return { ...snapshot, payload: { ...snapshot.payload,
    portfolios: [{ ...first, archived: true }, ...records.slice(1)] } }
}

test('downloaded domain snapshot can be compared without restoring or changing storage', async ({ page }) => {
  const expected = await prepare(page)
  const before = await saved(page)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download collection snapshot', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toMatch(/\.json$/)
  const file = await download.path()
  if (!file) throw new Error('Expected a downloaded snapshot file')
  const raw = await readFile(file, 'utf8')
  const exported: unknown = JSON.parse(raw)
  expect(exported).toMatchObject({ format: expected.format, version: 1, product: expected.product,
    scope: expected.scope, payload: expected.payload })
  await page.getByLabel(/^Snapshot file/).setInputFiles({ name: 'collection.json', mimeType: 'application/json', buffer: Buffer.from(raw) })
  await expect(page.getByRole('textbox', { name: 'Snapshot JSON', exact: true })).toHaveValue(raw)
  await page.getByRole('button', { name: 'Compare snapshot', exact: true }).click()
  await expect(page.getByText(ready, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Snapshot comparison', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Show records', exact: true }).selectOption('all')
  await page.getByRole('searchbox', { name: 'Find record', exact: true }).fill('PF-HISTORY')
  await page.getByRole('button', { name: 'Inspect PF-HISTORY', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'PF-HISTORY', level: 3, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /restore|overwrite|apply snapshot/i })).toHaveCount(0)
  expect(await saved(page)).toEqual(before)
})

test('changed record preview supports filtering, inspection, and bounded narrow layouts', async ({ page }) => {
  const snapshot = changedSnapshot(await prepare(page))
  const before = await saved(page)
  await compareText(page, snapshot)
  await page.getByRole('combobox', { name: 'Show records', exact: true }).selectOption('changed')
  await page.getByRole('searchbox', { name: 'Find record', exact: true }).fill('PF-GLOBAL')
  await page.getByRole('button', { name: 'Inspect PF-GLOBAL', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'PF-GLOBAL', level: 3, exact: true })).toBeVisible()
  await page.getByText('Current local record', { exact: true }).click()
  await page.getByText('Snapshot record', { exact: true }).click()
  const detailPanels = page.locator('.snapshot-detail pre')
  await expect(detailPanels).toHaveCount(2)
  for (const panel of await detailPanels.all()) {
    await expect(panel).toBeVisible()
    await expect(panel).toHaveCSS('color', 'rgb(23, 43, 64)')
    await expect(panel).toHaveCSS('background-color', 'rgb(246, 248, 250)')
  }
  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await expect(page.getByRole('button', { name: 'Compare snapshot', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Download collection snapshot', exact: true }).focus()
    await page.evaluate(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) })
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await page.screenshot({ path: '../UI_SCREENSHOTS/snapshot-review-QuantDesk-' + String(width) + '.png', fullPage: true })
  }
  expect(await saved(page)).toEqual(before)
})

test('incompatible or malformed input clears a previous comparison and performs no writes', async ({ page }) => {
  const snapshot = await prepare(page)
  const before = await saved(page)
  await compareText(page, snapshot)
  for (const raw of [JSON.stringify({ ...snapshot, product: 'OtherProduct' }),
    JSON.stringify({ ...snapshot, payload: { ...snapshot.payload, portfolios: [null] } }), '{broken']) {
    await page.getByRole('textbox', { name: 'Snapshot JSON', exact: true }).fill(raw)
    await expect(page.getByRole('heading', { name: 'Snapshot comparison', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Compare snapshot', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Snapshot comparison', exact: true })).toHaveCount(0)
    expect(await saved(page)).toEqual(before)
  }
})

test('refresh compares the retained input against a changed current collection without writing it back', async ({ page, context }) => {
  const snapshot = await prepare(page)
  await compareText(page, snapshot)
  const submitted = await page.getByRole('textbox', { name: 'Snapshot JSON', exact: true }).inputValue()
  const updated = changedSnapshot(snapshot)
  const other = await context.newPage()
  await other.goto('/')
  await other.evaluate(({ key, raw }) => { localStorage.setItem(key, raw) }, { key, raw: JSON.stringify(updated.payload) })
  await other.close()
  await page.bringToFront()
  await expect(page.getByRole('button', { name: 'Refresh comparison', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Refresh comparison', exact: true }).click()
  await expect(page.getByText(ready, { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Snapshot JSON', exact: true })).toHaveValue(submitted)
  await page.getByRole('combobox', { name: 'Show records', exact: true }).selectOption('changed')
  await expect(page.getByRole('button', { name: 'Inspect PF-GLOBAL', exact: true })).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(JSON.stringify(updated.payload))
  expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBe('retained legacy source')
  expect(await page.evaluate(() => localStorage.getItem('snapshot-review:unrelated'))).toBe('private unrelated bytes')
})
