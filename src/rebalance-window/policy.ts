import { requireThat } from '../workspace/values'
export const workflowKey = "rebalance-window"
export const workflowLabel = "Portfolio rebalance window"
export const ruleKind = "window"
export interface RebalanceWindowRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: RebalanceWindowRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured <= record.limit, 'Execution day falls outside Latest mandate day.')
  requireThat(record.evidence.trim().length >= 8, 'Portfolio rebalance window require traceable evidence.')
  requireThat(record.revision > 0, 'Portfolio rebalance window require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
