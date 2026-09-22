import type { StoragePort } from '../../workspace/repository'
import { approveRisk, initialRiskLedger, readRiskLedger, refreshRiskQuotes, requestRiskReview } from './riskLedger'
import type { RiskLedger } from './riskLedger'
import { checkerWorkInbox, claimRiskReview } from './checkerWorkload'

export interface PortfolioRecord { id: string; mandateId: string; quoteBookId: string; ledger: RiskLedger; archived: boolean }
export interface QuoteBook { id: string; revision: number; valid: boolean; issuer: string }
export interface PortfolioEvent { sequence: number; action: string; targetId: string; relatedIds: readonly string[]; actor: string; sourceRevision: number }
export interface PortfolioCollection { portfolios: readonly PortfolioRecord[]; quoteBooks: readonly QuoteBook[]; events: readonly PortfolioEvent[] }
export interface PortfolioBatchResult { collection: PortfolioCollection; updated: string[]; skipped: string[]; blocked: { id: string; reason: string }[] }
const key = 'quantdesk:portfolio-collection:v1'

function portfolioLedger(id: string, state: RiskLedger): RiskLedger {
  return { ...state, snapshot: { ...state.snapshot, id: `${id}/2026-09-14` } }
}
function ready(id: string): RiskLedger { return portfolioLedger(id, refreshRiskQuotes(initialRiskLedger)) }
function requested(id: string): RiskLedger { return requestRiskReview(ready(id), 'portfolio manager', 'risk checker') }
export function seedPortfolioCollection(legacy: RiskLedger = initialRiskLedger): PortfolioCollection {
  return { portfolios: [
    { id: 'PF-GLOBAL', mandateId: 'global', quoteBookId: 'Q-ORION', ledger: legacy, archived: false },
    { id: 'PF-INCOME', mandateId: 'income', quoteBookId: 'Q-MARINER', ledger: requested('PF-INCOME'), archived: false },
    { id: 'PF-GROWTH', mandateId: 'global', quoteBookId: 'Q-ORION', ledger: requested('PF-GROWTH'), archived: false },
    { id: 'PF-CORE', mandateId: 'global', quoteBookId: 'Q-MARINER', ledger: requested('PF-CORE'), archived: false },
    { id: 'PF-LIQUID', mandateId: 'income', quoteBookId: 'Q-ORION', ledger: portfolioLedger('PF-LIQUID', initialRiskLedger), archived: false },
    { id: 'PF-HISTORY', mandateId: 'global', quoteBookId: 'Q-MARINER', ledger: approveRisk(ready('PF-HISTORY'), 'historical checker', true), archived: true },
  ], quoteBooks: [
    { id: 'Q-ORION', revision: 1, valid: true, issuer: 'Orion' },
    { id: 'Q-MARINER', revision: 1, valid: true, issuer: 'Mariner' },
  ], events: [] }
}
export function readPortfolioCollection(storage: StoragePort): PortfolioCollection {
  const raw = storage.getItem(key)
  if (!raw) return seedPortfolioCollection(readRiskLedger(storage))
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('portfolios' in value) || !Array.isArray(value.portfolios) ||
    !('quoteBooks' in value) || !Array.isArray(value.quoteBooks) || !('events' in value) || !Array.isArray(value.events))
    throw new Error('Invalid portfolio collection.')
  return value as PortfolioCollection
}
export function savePortfolioCollection(storage: StoragePort, collection: PortfolioCollection): PortfolioCollection {
  storage.setItem(key, JSON.stringify(collection))
  return collection
}
export function portfolioById(collection: PortfolioCollection, id: string): PortfolioRecord {
  const record = collection.portfolios.find(item => item.id === id)
  if (!record) throw new Error(`Portfolio ${id} was not found.`)
  return record
}
export function portfolioRows(collection: PortfolioCollection, query = '', filter = 'active'): PortfolioRecord[] {
  const needle = query.trim().toLowerCase()
  return collection.portfolios.filter(item => (filter === 'all' || (filter === 'archived') === item.archived) &&
    (!needle || [item.id, item.mandateId, item.quoteBookId, item.ledger.snapshot.approvedBy ?? ''].some(value =>
      value.toLowerCase().includes(needle)))).toSorted((a, b) => a.id.localeCompare(b.id))
}
export function portfolioReviewInbox(collection: PortfolioCollection, actorId?: string) {
  return checkerWorkInbox(collection.portfolios.filter(item => !item.archived).map(item => ({
    portfolioId: item.id, mandateId: item.mandateId, ledger: item.ledger,
  })), actorId)
}
export function portfolioSummary(collection: PortfolioCollection) {
  const active = collection.portfolios.filter(item => !item.archived)
  const inbox = portfolioReviewInbox(collection)
  return { active: active.length, archived: collection.portfolios.length - active.length,
    approved: active.filter(item => Boolean(item.ledger.snapshot.approvedBy)).length,
    unclaimed: inbox.filter(item => item.assignee === 'risk checker').length,
    stale: active.flatMap(item => item.ledger.riskReviews ?? []).filter(item => item.status === 'stale').length }
}
function log(collection: PortfolioCollection, action: string, targetId: string, relatedIds: readonly string[],
  actor: string, sourceRevision: number): PortfolioEvent {
  return { sequence: collection.events.length + 1, action, targetId, relatedIds, actor, sourceRevision }
}
function replace(collection: PortfolioCollection, record: PortfolioRecord, action: string, actor: string): PortfolioCollection {
  return { ...collection, portfolios: collection.portfolios.map(item => item.id === record.id ? record : item),
    events: [...collection.events, log(collection, action, record.id, [record.quoteBookId], actor, record.ledger.revision)] }
}
export function claimPortfolioReview(collection: PortfolioCollection, id: string, checkerId: string,
  expectedRevision: number): PortfolioCollection {
  const record = portfolioById(collection, id)
  if (record.archived) throw new Error('Archived portfolios cannot be claimed.')
  const ledger = claimRiskReview({ portfolioId: id, mandateId: record.mandateId, ledger: record.ledger }, checkerId,
    collection.portfolios.filter(item => !item.archived).map(item => ({ portfolioId: item.id,
      mandateId: item.mandateId, ledger: item.ledger })), expectedRevision)
  return replace(collection, { ...record, ledger }, 'risk-review-claimed', checkerId)
}
export function refreshPortfolioQuotes(collection: PortfolioCollection, id: string, maker: string): PortfolioCollection {
  const record = portfolioById(collection, id)
  if (record.archived) throw new Error('Archived portfolios cannot be refreshed.')
  if (maker !== record.ledger.maker) throw new Error('Only this portfolio maker may refresh quotes.')
  const source = collection.quoteBooks.find(item => item.id === record.quoteBookId)
  if (!source?.valid) throw new Error('The linked quote book must be restored before refresh.')
  return replace(collection, { ...record, ledger: refreshRiskQuotes(record.ledger, maker) }, 'quotes-refreshed', maker)
}
export function bulkRefreshPortfolios(collection: PortfolioCollection, ids: readonly string[], maker: string): PortfolioBatchResult {
  let next = collection
  const updated: string[] = []
  const skipped: string[] = []
  const blocked: { id: string; reason: string }[] = []
  for (const id of [...new Set(ids)]) {
    const record = next.portfolios.find(item => item.id === id)
    if (record?.ledger.snapshot.positions.every(item => item.quotedAt >= record.ledger.snapshot.asOf)) {
      skipped.push(id); continue
    }
    try { next = refreshPortfolioQuotes(next, id, maker); updated.push(id) }
    catch (error) { blocked.push({ id, reason: error instanceof Error ? error.message : 'Quote refresh failed.' }) }
  }
  return { collection: next, updated, skipped, blocked }
}
export function setQuoteBookValidity(collection: PortfolioCollection, id: string, valid: boolean,
  actor: string, expectedRevision: number): PortfolioBatchResult {
  const source = collection.quoteBooks.find(item => item.id === id)
  if (!source) throw new Error('Quote book was not found.')
  if (source.revision !== expectedRevision) throw new Error('Quote book revision changed before update.')
  if (source.valid === valid) return { collection, updated: [], skipped: [id], blocked: [] }
  const updated: string[] = []
  const skipped: string[] = []
  const blocked: { id: string; reason: string }[] = []
  const portfolios = collection.portfolios.map(record => {
    if (record.archived || record.quoteBookId !== id) { skipped.push(record.id); return record }
    if (record.ledger.snapshot.approvedBy) {
      blocked.push({ id: record.id, reason: 'Approved snapshot requires governed revocation before quote invalidation.' })
      return record
    }
    const revision = record.ledger.revision + 1
    const ledger: RiskLedger = { ...record.ledger, revision,
      snapshot: { ...record.ledger.snapshot, positions: record.ledger.snapshot.positions.map(position =>
        position.issuer === source.issuer && !valid ? { ...position, quotedAt: '2026-09-01' } : position) },
      riskReviews: record.ledger.riskReviews?.map(item => item.status === 'open' ?
        { ...item, status: 'stale' as const } : item),
      history: [...record.ledger.history, { revision, action: valid ? 'quote-book-restored' : 'quote-book-invalidated', source: id, actor }] }
    updated.push(record.id)
    return { ...record, ledger }
  })
  const revision = source.revision + 1
  return { collection: { ...collection, portfolios, quoteBooks: collection.quoteBooks.map(item => item.id === id ?
    { ...item, valid, revision } : item), events: [...collection.events,
    log(collection, valid ? 'quote-book-restored' : 'quote-book-invalidated', id, updated, actor, revision)] },
    updated, skipped, blocked }
}
export function createPortfolio(collection: PortfolioCollection, id: string, mandateId: string,
  quoteBookId: string): PortfolioCollection {
  if (!/^PF-[A-Z0-9-]+$/.test(id) || collection.portfolios.some(item => item.id === id))
    throw new Error('Choose a unique portfolio ID.')
  if (!['global', 'income'].includes(mandateId)) throw new Error('Mandate is not supported.')
  if (!collection.quoteBooks.some(item => item.id === quoteBookId)) throw new Error('A referenced quote book is required.')
  const record: PortfolioRecord = { id, mandateId, quoteBookId, ledger: portfolioLedger(id, initialRiskLedger), archived: false }
  return { ...collection, portfolios: [...collection.portfolios, record], events: [...collection.events,
    log(collection, 'portfolio-created', id, [quoteBookId], 'portfolio manager', record.ledger.revision)] }
}
export function archivePortfolio(collection: PortfolioCollection, id: string): PortfolioCollection {
  const record = portfolioById(collection, id)
  if (record.archived) return collection
  if (record.ledger.riskReviews?.some(item => item.status === 'open') || record.ledger.transformationApplied)
    throw new Error('Open review or applied transformation prevents archival.')
  return replace(collection, { ...record, archived: true }, 'portfolio-archived', 'portfolio manager')
}
