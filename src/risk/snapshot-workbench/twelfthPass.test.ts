import { describe, expect, it } from 'vitest'
import { approveRisk, checkerInbox, initialRiskLedger, refreshRiskQuotes, requestRiskReview } from './riskLedger'

describe('maker-to-checker responsibility', () => {
  it('stales an open request on quote refresh and requires a new review', () => {
    let state = requestRiskReview(refreshRiskQuotes(initialRiskLedger), 'portfolio manager', 'risk checker')
    expect(checkerInbox(state, 'risk checker')).toHaveLength(1)
    state = refreshRiskQuotes(state)
    expect(checkerInbox(state, 'risk checker')).toHaveLength(0)
    expect(() => approveRisk(state, 'risk checker', true)).toThrow(/current risk review/)
    state = requestRiskReview(state, 'portfolio manager', 'risk checker')
    const approved = approveRisk(state, 'risk checker', true)
    expect(approved.riskReviews?.map(item => item.status)).toEqual(['superseded', 'completed'])
  })
})
