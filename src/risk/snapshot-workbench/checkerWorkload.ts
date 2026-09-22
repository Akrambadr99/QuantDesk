import type { RiskLedger } from './riskLedger'
import { riskFindings } from './riskSnapshot'

export interface RiskChecker { id: string; name: string; mandates: readonly string[]; maxOpen: number; available: boolean }
export interface PortfolioWorkRecord { portfolioId: string; mandateId: string; ledger: RiskLedger }
export interface CheckerWorkItem { portfolioId: string; reviewId: string; assignee: string; findingCount: number; actionable: boolean }
export const riskCheckers: readonly RiskChecker[] = [
  { id: 'checker-amina', name: 'Amina Shah', mandates: ['global', 'income'], maxOpen: 2, available: true },
  { id: 'checker-luis', name: 'Luis Chen', mandates: ['global'], maxOpen: 1, available: true },
  { id: 'checker-priya', name: 'Priya Vale', mandates: ['income'], maxOpen: 2, available: false },
]
export function checkerWorkInbox(records: readonly PortfolioWorkRecord[], actorId?: string): CheckerWorkItem[] {
  return records.flatMap(({ portfolioId, ledger }) => (ledger.riskReviews ?? []).filter(item => item.status === 'open')
    .map(item => ({ portfolioId, reviewId: item.id, assignee: item.assignee,
      findingCount: riskFindings(ledger.snapshot).length,
      actionable: item.sourceRevision === ledger.revision && !ledger.snapshot.approvedBy,
    }))).filter(item => actorId === undefined || item.assignee === actorId)
    .sort((a, b) => Number(b.actionable) - Number(a.actionable) || b.findingCount - a.findingCount ||
      a.portfolioId.localeCompare(b.portfolioId))
}
export function checkerLoad(records: readonly PortfolioWorkRecord[], actorId: string): number {
  return checkerWorkInbox(records, actorId).filter(item => item.actionable).length
}
export function checkerEligibility(records: readonly PortfolioWorkRecord[], record: PortfolioWorkRecord, actorId: string): string[] {
  const actor = riskCheckers.find(item => item.id === actorId)
  const blockers: string[] = []
  if (!actor?.available) blockers.push('Risk checker is unavailable.')
  if (actor && !actor.mandates.includes(record.mandateId)) blockers.push('Checker lacks mandate qualification.')
  if (actor && checkerLoad(records, actorId) >= actor.maxOpen) blockers.push('Checker is at capacity.')
  if (record.ledger.maker === actorId) blockers.push('Snapshot maker cannot review their own work.')
  return blockers
}
export function claimRiskReview(record: PortfolioWorkRecord, actorId: string, records: readonly PortfolioWorkRecord[], expectedRevision: number): RiskLedger {
  const state = record.ledger
  if (state.revision !== expectedRevision) throw new Error('Risk revision changed before claim.')
  const review = (state.riskReviews ?? []).find(item => item.status === 'open' && item.sourceRevision === state.revision)
  if (!review) throw new Error('No current risk review is available.')
  if (review.assignee !== 'risk checker') throw new Error('Review is already assigned to a checker.')
  const blockers = checkerEligibility(records, record, actorId)
  if (blockers.length) throw new Error(blockers[0])
  const revision = state.revision + 1
  return { ...state, revision, riskReviews: state.riskReviews?.map(item => item.id === review.id ?
    { ...item, assignee: actorId, sourceRevision: revision } : item), history: [...state.history,
      { revision, action: 'risk-review-claimed', source: 'checker-work-queue', actor: actorId }] }
}
