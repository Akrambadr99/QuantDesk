import { requireThat } from '../workspace/values'
export const workflowKey = "mandate-version"
export const workflowLabel = "Investment mandate version"
export const ruleKind = "dependency"
export interface MandateVersionRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: MandateVersionRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured === record.limit, 'Trade mandate revision does not match Approved mandate revision.')
  requireThat(record.evidence.trim().length >= 8, 'Investment mandate version require traceable evidence.')
  requireThat(record.revision > 0, 'Investment mandate version require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
