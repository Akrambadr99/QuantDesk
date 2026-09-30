import type { ExplorerPolicy } from '../../workspace/collectionExplorer'
import type { PortfolioCollection, PortfolioRecord } from './portfolioCollection'

export function portfolioTriage(collection: PortfolioCollection): ExplorerPolicy<PortfolioRecord> {
  return {
    searchText: record => [record.id, record.mandateId, record.quoteBookId, record.ledger.snapshot.approvedBy ?? ''].join(' '),
    revision: record => record.ledger.revision,
    states: [
      { value: 'quote-book-invalid', label: 'Quote book unavailable' },
      { value: 'quotes-stale', label: 'Stale quotes' },
      { value: 'review-stale', label: 'Review needs renewal' },
      { value: 'approved', label: 'Approved snapshot' },
      { value: 'review-open', label: 'Awaiting independent review' },
      { value: 'pending', label: 'Ready for review request' },
    ],
    state: record => {
      const ledger = record.ledger
      if (!collection.quoteBooks.find(book => book.id === record.quoteBookId)?.valid) return 'quote-book-invalid'
      if (ledger.snapshot.positions.some(position => position.quotedAt < ledger.snapshot.asOf)) return 'quotes-stale'
      if (ledger.riskReviews?.some(review => review.status === 'stale' ||
        (review.status === 'open' && review.sourceRevision !== ledger.revision))) return 'review-stale'
      if (ledger.snapshot.approvedBy) return 'approved'
      if (ledger.riskReviews?.some(review => review.status === 'open')) return 'review-open'
      return 'pending'
    },
  }
}
