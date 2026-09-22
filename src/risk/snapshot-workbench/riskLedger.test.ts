import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../../data/memory-storage'
import { applyTransformation, applyTransformationAtRevision, approveRisk, corporateActionBlockers, evaluateRiskRevision, readRiskLedger, refreshRiskQuotes, revokeRiskApproval, riskApprovalPolicy, saveRiskLedger } from './riskLedger'
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
  it('rejects a stale reviewed revision and suppresses duplicate transformation requests', () => {
    const oldRevision = readRiskLedger(new MemoryStorage()).revision
    const approved = approveRisk(refreshRiskQuotes(readRiskLedger(new MemoryStorage())), 'R. Shah', true)
    expect(evaluateRiskRevision(approved, oldRevision)).toMatchObject({ allowed: false, resolutionOptions: ['Review current risk snapshot'] })
    expect(() => applyTransformationAtRevision(approved, oldRevision, 'CA-117')).toThrow(/changed/)
    const applied = applyTransformationAtRevision(approved, approved.revision, 'CA-117')
    expect(applyTransformationAtRevision(applied, approved.revision, 'CA-117')).toBe(applied)
    expect(() => applyTransformationAtRevision(applied, applied.revision, 'CA-118')).toThrow(/already applied/)
  })
  it('routes stale price evidence to the maker and prevents self-approval after refresh', () => {
    const original = readRiskLedger(new MemoryStorage())
    expect(riskApprovalPolicy(original, 'R. Shah', true).queue).toBe('maker')
    const refreshed = refreshRiskQuotes(original, 'R. Shah')
    expect(riskApprovalPolicy(refreshed, 'R. Shah', true)).toMatchObject({ allowed: false, queue: 'independent-review' })
    expect(() => approveRisk(refreshed, 'R. Shah', true)).toThrow(/maker cannot approve/)
    const approved = approveRisk(refreshed, 'M. Chen', true)
    expect(approved.approvalRevision).toBe(approved.revision)
    expect(approved.history.at(-1)).toMatchObject({ actor: 'M. Chen', action: 'approved' })
    expect(riskApprovalPolicy(approved, 'M. Chen', true).queue).toBe('corporate-action')
  })
})
