import { expect, test } from '@playwright/test'
test('risk approval needs fresh quotes and independent identity', async ({ page }) => {
  await page.goto('/portfolios/PF-GLOBAL/snapshots/2026-09-14')
  await expect(page.getByText('POS-2 price is stale.')).toBeVisible()
  await page.getByRole('button', { name: 'Refresh stale quote evidence' }).click()
  await page.getByLabel('Independent approver').fill('R. Shah')
  await page.getByLabel('Independent from portfolio manager').check()
  await page.getByRole('button', { name: 'Approve snapshot' }).click()
  await expect(page.getByText('Approved by R. Shah')).toBeVisible()
})
