import { requireThat } from '../workspace/values'
export const workflowKey = "settlement-cycle"
export const workflowLabel = "Settlement sequencing"
export const ruleKind = "sequence"
export interface SettlementCycleRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: SettlementCycleRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured >= record.limit, 'Completed settlement step have not reached Required settlement step.')
  requireThat(record.evidence.trim().length >= 8, 'Settlement sequencing require traceable evidence.')
  requireThat(record.revision > 0, 'Settlement sequencing require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
