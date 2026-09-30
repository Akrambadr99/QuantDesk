import { expect, it } from 'vitest'
import { evaluateScenario } from '../corporate-actions/scenario'
import { seedPortfolioCollection } from './portfolioCollection'
import { recordDecisionPath } from './recordLinks'

it('opens every selected corporate-action workbench with a valid initial ratio', () => {
  for (const record of seedPortfolioCollection().portfolios) {
    const url = new URL(recordDecisionPath(record), 'https://test.invalid')
    expect(url.searchParams.get('record')).toBe(record.id)
    expect(url.searchParams.get('ratio')).toBe('1')
    expect(evaluateScenario(Number(url.searchParams.get('ratio'))).blocked).toBe(false)
  }
})
