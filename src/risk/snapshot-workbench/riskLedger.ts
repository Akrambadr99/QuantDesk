import type { StoragePort } from '../../workspace/repository'
import { approveSnapshot, baselineSnapshot } from './riskSnapshot'
import type { RiskSnapshot } from './riskSnapshot'

export interface RiskLedger {
  snapshot: RiskSnapshot
  transformationApplied: boolean
  transformationRequestId: string | null
  revision: number
  history: readonly { revision: number; action: string; source: string }[]
}
const key = 'quantdesk:pf-global:risk-approval:v1'
export const initialRiskLedger: RiskLedger = { snapshot: baselineSnapshot, transformationApplied: false, transformationRequestId: null, revision: 0, history: [] }
export function readRiskLedger(storage: StoragePort): RiskLedger {
  const raw = storage.getItem(key)
  if (!raw) return initialRiskLedger
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('snapshot' in value) || !value.snapshot ||
    typeof value.snapshot !== 'object' || !('positions' in value.snapshot) ||
    !('transformationApplied' in value) || typeof value.transformationApplied !== 'boolean' ||
    !('revision' in value) || typeof value.revision !== 'number' ||
    !('history' in value) || !Array.isArray(value.history)) throw new Error('Invalid risk-ledger record.')
  const record = value as RiskLedger
  return { ...record, transformationRequestId: record.transformationRequestId ?? null }
}
function event(state: RiskLedger, action: string, source: string, snapshot = state.snapshot): RiskLedger {
  const revision = state.revision + 1
  return { ...state, snapshot, revision, history: [...state.history, { revision, action, source }] }
}
export function refreshRiskQuotes(state: RiskLedger): RiskLedger {
  if (state.snapshot.approvedBy) throw new Error('Approved snapshot quotes cannot be edited.')
  const snapshot = { ...state.snapshot, positions: state.snapshot.positions.map(position =>
    position.quotedAt < state.snapshot.asOf ? { ...position, quotedAt: state.snapshot.asOf } : position) }
  return event(state, 'quotes-refreshed', 'risk-snapshot', snapshot)
}
export function approveRisk(state: RiskLedger, actor: string, independent: boolean): RiskLedger {
  return event(state, 'approved', 'risk-snapshot', approveSnapshot(state.snapshot, actor, independent))
}
export function corporateActionBlockers(state: RiskLedger): string[] {
  return state.snapshot.approvedBy ? [] : ['An independently approved risk snapshot is required before position transformation.']
}
export function applyTransformation(state: RiskLedger): RiskLedger {
  if (corporateActionBlockers(state).length) throw new Error(corporateActionBlockers(state)[0])
  if (state.transformationApplied) throw new Error('Position transformation is already applied.')
  const next = event(state, 'position-transformed', 'corporate-action')
  return { ...next, transformationApplied: true }
}
export function evaluateRiskRevision(state: RiskLedger, expectedRevision: number): { allowed: boolean; conflicts: string[]; resolutionOptions: string[] } {
  const conflicts = state.revision === expectedRevision ? [] :
    [`Risk snapshot changed from revision ${String(expectedRevision)} to ${String(state.revision)}; review and reapprove the current exposure.`]
  return { allowed: conflicts.length === 0, conflicts, resolutionOptions: conflicts.length ? ['Review current risk snapshot'] : [] }
}
export function applyTransformationAtRevision(state: RiskLedger, expectedRevision: number, requestId: string): RiskLedger {
  if (!requestId.trim()) throw new Error('A corporate-action request ID is required.')
  if (state.transformationRequestId === requestId) return state
  const decision = evaluateRiskRevision(state, expectedRevision)
  if (!decision.allowed) throw new Error(decision.conflicts[0])
  return { ...applyTransformation(state), transformationRequestId: requestId }
}
export function revokeRiskApproval(state: RiskLedger): RiskLedger {
  if (!state.snapshot.approvedBy) throw new Error('No approval exists to revoke.')
  if (state.transformationApplied) throw new Error('Corporate action depends on this approved snapshot.')
  const snapshot = { ...state.snapshot }
  delete snapshot.approvedBy
  return event(state, 'approval-revoked', 'risk-snapshot', snapshot)
}
export function saveRiskLedger(storage: StoragePort, state: RiskLedger): RiskLedger {
  storage.setItem(key, JSON.stringify(state))
  return state
}
