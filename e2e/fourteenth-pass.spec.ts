import { expect, test } from '@playwright/test'

test('portfolio checker queue persists across selection and isolates quote-book propagation', async ({ page }) => {
  await page.goto('/risk/portfolio-workspace?portfolio=PF-GROWTH')
  await expect(page.getByRole('heading', { name: 'Portfolio review workspace' })).toBeVisible()
  await page.getByRole('button', { name: 'Claim selected review' }).click()
  await expect(page.getByLabel('Selected portfolio')).toContainText('checker-amina')
  await page.getByRole('button', { name: /PF-INCOME · income · pending/ }).click()
  await expect(page).toHaveURL(/portfolio=PF-INCOME/)
  await expect(page.getByLabel('Selected portfolio')).toContainText('risk checker')
  await page.goto('/operations')
  await page.goto('/risk/portfolio-workspace?portfolio=PF-GROWTH')
  await expect(page.getByLabel('Selected portfolio')).toContainText('checker-amina')
  await page.getByRole('button', { name: 'Toggle linked quote book' }).click()
  await expect(page.getByRole('status')).toContainText('3 related portfolios updated')
  await page.getByRole('button', { name: /PF-INCOME · income · pending/ }).click()
  await expect(page.getByLabel('Selected portfolio')).toContainText('Risk revision 2')
})
