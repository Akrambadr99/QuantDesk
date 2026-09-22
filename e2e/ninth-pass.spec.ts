import { expect, test } from '@playwright/test'

test('approved risk snapshot governs corporate action and cannot be revoked afterward', async ({ page }) => {
  await page.goto('/portfolios/PF-GLOBAL/actions/CA-117?ratio=1')
  await page.getByLabel('Decision authority').selectOption('independent approver')
  await expect(page.getByRole('button', { name: 'Approve position transformation' })).toBeDisabled()
  await page.goto('/portfolios/PF-GLOBAL/snapshots/2026-09-14')
  await page.getByRole('button', { name: 'Refresh stale quote evidence' }).click()
  await page.getByLabel('Independent approver').fill('R. Shah')
  await page.getByLabel('Independent from portfolio manager').check()
  await page.getByRole('button', { name: 'Approve snapshot' }).click()
  await page.goto('/portfolios/PF-GLOBAL/actions/CA-117?ratio=1')
  await page.getByLabel('Decision authority').selectOption('independent approver')
  await page.getByRole('button', { name: 'Approve position transformation' }).click()
  await expect(page.getByText('Transformation applied')).toBeVisible()
  await page.goto('/portfolios/PF-GLOBAL/snapshots/2026-09-14')
  await page.getByRole('button', { name: 'Revoke risk approval' }).click()
  await expect(page.getByRole('status')).toContainText('Corporate action depends')
})
