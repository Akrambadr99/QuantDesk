import { expect, test } from '@playwright/test'

test('a stale reviewed risk revision blocks a corporate action until refreshed', async ({ page }) => {
  await page.goto('/portfolios/PF-GLOBAL/snapshots/2026-09-14')
  await page.getByRole('button', { name: 'Refresh stale quote evidence' }).click()
  await page.getByLabel('Independent approver').fill('R. Shah')
  await page.getByLabel('Independent from portfolio manager').check()
  await page.getByRole('button', { name: 'Approve snapshot' }).click()
  await page.goto('/portfolios/PF-GLOBAL/actions/CA-117?ratio=1')
  await page.getByLabel('Decision authority').selectOption('independent approver')
  await page.getByLabel('Reviewed risk revision').fill('0')
  await expect(page.getByRole('alert')).toContainText('Risk snapshot changed')
  await expect(page.getByRole('button', { name: 'Approve position transformation' })).toBeDisabled()
  await page.getByRole('button', { name: 'Review current risk snapshot' }).click()
  await page.getByRole('button', { name: 'Approve position transformation' }).click()
  await expect(page.getByRole('status')).toContainText('Position transformation applied')
})
