import { describe, expect, it } from 'vitest'
import { approveRisk, initialRiskLedger, refreshRiskQuotes, requestRiskReview } from './riskLedger'
import { checkerWorkInbox, claimRiskReview } from './checkerWorkload'

function review() { return requestRiskReview(refreshRiskQuotes(initialRiskLedger), 'portfolio manager', 'risk checker') }
describe('named checker workload', () => {
  it('sorts multiple portfolio findings and protects named approval', () => {
    const first = { portfolioId: 'PF-A', mandateId: 'global', ledger: review() }
    const second = { portfolioId: 'PF-B', mandateId: 'global', ledger: review() }
    expect(checkerWorkInbox([second, first]).map(item => item.portfolioId)).toEqual(['PF-A', 'PF-B'])
    const claimed = claimRiskReview(first, 'checker-amina', [first, second], first.ledger.revision)
    expect(() => approveRisk(claimed, 'checker-luis', true)).toThrow(/assigned/)
    expect(approveRisk(claimed, 'checker-amina', true).snapshot.approvedBy).toBe('checker-amina')
  })
  it('rejects unqualified and stale checker claims', () => {
    const first = { portfolioId: 'PF-A', mandateId: 'income', ledger: review() }
    expect(() => claimRiskReview(first, 'checker-luis', [first], first.ledger.revision)).toThrow(/mandate/)
    expect(() => claimRiskReview(first, 'checker-amina', [first], 0)).toThrow(/revision changed/)
  })
})
