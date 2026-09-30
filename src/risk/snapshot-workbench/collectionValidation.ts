import { array, booleanValue, finiteNumber, nonEmptyText, nonNegativeInteger, nullable,
  object, oneOf, optional, text, uniqueBy } from '../../workspace/storageValidation'
import type { PortfolioCollection, PortfolioEvent, PortfolioRecord, QuoteBook } from './portfolioCollection'
import type { RiskLedger, RiskReview } from './riskLedger'
import type { Mandate, Position, RiskSnapshot } from './riskSnapshot'

const position = object<Position>({ id: nonEmptyText, issuer: text, quantity: finiteNumber,
  price: finiteNumber, quotedAt: text })
const mandate = object<Mandate>({ maxIssuerWeight: finiteNumber, maxLossPercent: finiteNumber,
  maxQuoteAgeDays: finiteNumber })
const snapshot = object<RiskSnapshot>({ id: nonEmptyText, asOf: text,
  positions: uniqueBy(array(position), 'id'), mandate, stressPercent: finiteNumber, approvedBy: optional(text) })
const review = object<RiskReview>({ id: nonEmptyText, sourceRevision: nonNegativeInteger,
  requestedBy: text, assignee: text, status: oneOf('open', 'stale', 'completed', 'superseded', 'cancelled'),
  supersedesId: optional(text), decision: optional(oneOf('approved', 'changes_requested')), reason: optional(text) })
const history = object<RiskLedger['history'][number]>({ revision: nonNegativeInteger,
  action: text, source: text, actor: optional(text) })
const ledger = object<RiskLedger>({ snapshot, maker: text, approvalRevision: nullable(nonNegativeInteger),
  riskReviews: optional(uniqueBy(array(review), 'id')), transformationApplied: booleanValue,
  transformationRequestId: nullable(text), revision: nonNegativeInteger, history: array(history) })
const portfolio = object<PortfolioRecord>({ id: nonEmptyText, mandateId: text, quoteBookId: text,
  ledger, archived: booleanValue })
const quoteBook = object<QuoteBook>({ id: nonEmptyText, revision: nonNegativeInteger,
  valid: booleanValue, issuer: text })
const event = object<PortfolioEvent>({ sequence: nonNegativeInteger, action: text, targetId: text,
  relatedIds: array(text), actor: text, sourceRevision: nonNegativeInteger })

// Structural integrity is distinct from approval eligibility: stale quotes and reviews are valid saved work.
export const portfolioCollectionRule = object<PortfolioCollection>({ portfolios: uniqueBy(array(portfolio), 'id'),
  quoteBooks: uniqueBy(array(quoteBook), 'id'), events: uniqueBy(array(event), 'sequence') })
