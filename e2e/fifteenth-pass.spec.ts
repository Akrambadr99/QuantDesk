import { expect, test } from '@playwright/test'

test('detail changes reach the selected workspace record and survive reload', async ({ page }) => {
  await page.goto('/risk/portfolio-workspace?portfolio=PF-GLOBAL')
  const selected = page.getByLabel('Selected portfolio', { exact: true })
  const before = await selected.textContent()
  await page.getByRole('link', { name: 'Open record details' }).click()
  await expect(page.getByLabel('Selected record context')).toContainText('PF-GLOBAL')
  await page.getByRole('button', { name: 'Refresh stale quote evidence' }).click()
  await page.getByRole('link', { name: 'Back to workspace' }).click()
  await expect(selected).not.toHaveText(before ?? '')
  const after = await selected.textContent()
  await page.reload()
  await expect(selected).toHaveText(after ?? '')
  await page.getByRole('link', { name: 'Open record details' }).click()
  await expect(page.getByLabel('Selected record context')).toContainText('PF-GLOBAL')
})

test('secondary record selection and return navigation work at tablet width', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto('/risk/portfolio-workspace?portfolio=PF-INCOME')
  await page.getByRole('link', { name: 'Open record details' }).click()
  await expect(page.getByLabel('Selected record context')).toContainText('PF-INCOME')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect.poll(() => page.evaluate<number>('window.scrollY')).toBe(0)
  await page.screenshot({ path: '../UI_SCREENSHOTS/fifteenth-QuantDesk-detail.png', fullPage: true })
  await page.reload()
  await expect(page.getByLabel('Selected record context')).toContainText('PF-INCOME')
  await page.getByRole('link', { name: 'Back to workspace' }).click()
  await expect(page.getByLabel('Selected portfolio', { exact: true })).toContainText('PF-INCOME')
})

test('unknown record recovery never opens the default record', async ({ page }) => {
  await page.goto('/portfolios/PF-GLOBAL/snapshots/2026-09-14?record=MISSING')
  await expect(page.getByRole('alert')).toContainText('not found')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to workspace' }).click()
  await expect(page.getByRole('button', { name: 'Refresh workspace' })).toBeVisible()
})
