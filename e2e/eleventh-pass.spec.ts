import { expect, test } from '@playwright/test'

test('portfolio maker cannot approve their own refreshed risk evidence', async ({ page }) => {
  await page.goto('/portfolios/PF-GLOBAL/snapshots/2026-09-14')
  await page.getByRole('button', { name: 'Refresh stale quote evidence' }).click()
  await page.getByLabel('Independent approver').fill('portfolio manager')
  await page.getByLabel('Independent from portfolio manager').check()
  await expect(page.getByText('Risk maker cannot approve their own snapshot.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve snapshot' })).toBeDisabled()
  await page.getByLabel('Independent approver').fill('R. Shah')
  await page.getByRole('button', { name: 'Approve snapshot' }).click()
  await expect(page.getByText('Approval queue: corporate-action')).toBeVisible()
})
