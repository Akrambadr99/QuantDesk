import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../../data/memory-storage'
import { applyTransformation, approveRisk, corporateActionBlockers, readRiskLedger, refreshRiskQuotes, revokeRiskApproval, saveRiskLedger } from './riskLedger'
describe('risk approval to corporate action', () => {
  it('persists independent approval and changes transformation eligibility', () => {
    const storage = new MemoryStorage()
    expect(corporateActionBlockers(readRiskLedger(storage))).toHaveLength(1)
    const refreshed = refreshRiskQuotes(readRiskLedger(storage))
    saveRiskLedger(storage, approveRisk(refreshed, 'R. Shah', true))
    expect(corporateActionBlockers(readRiskLedger(storage))).toEqual([])
  })
  it('protects the approved snapshot after a dependent position transformation', () => {
    const approved = approveRisk(refreshRiskQuotes(readRiskLedger(new MemoryStorage())), 'R. Shah', true)
    expect(revokeRiskApproval(approved).snapshot.approvedBy).toBeUndefined()
    const transformed = applyTransformation(approved)
    expect(() => revokeRiskApproval(transformed)).toThrow(/depends/)
    expect(transformed.history.map(item => item.source)).toEqual(['risk-snapshot', 'risk-snapshot', 'corporate-action'])
  })
})
