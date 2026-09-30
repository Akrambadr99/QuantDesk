import { describe, expect, it } from 'vitest'
import { portfolioTriage } from './collectionTriage'
import { portfolioById, seedPortfolioCollection, setQuoteBookValidity } from './portfolioCollection'
import { refreshRiskQuotes } from './riskLedger'

describe('portfolio triage states', () => {
  it('distinguishes stale quotes, current reviews and archived approvals without mutating records', () => {
    const collection = seedPortfolioCollection()
    const before = JSON.stringify(collection)
    const policy = portfolioTriage(collection)
    expect(policy.state(portfolioById(collection, 'PF-GLOBAL'))).toBe('quotes-stale')
    expect(policy.state(portfolioById(collection, 'PF-INCOME'))).toBe('review-open')
    expect(policy.state(portfolioById(collection, 'PF-HISTORY'))).toBe('approved')
    expect(JSON.stringify(collection)).toBe(before)
  })
  it('prioritizes unavailable source evidence over stale reviews and approvals', () => {
    const collection = seedPortfolioCollection()
    const changed = setQuoteBookValidity(collection, 'Q-ORION', false, 'market data controller', 1).collection
    expect(portfolioTriage(changed).state(portfolioById(changed, 'PF-GROWTH'))).toBe('quote-book-invalid')
    const approved = portfolioById(collection, 'PF-HISTORY')
    const unavailable = { ...collection, quoteBooks: collection.quoteBooks.filter(book => book.id !== approved.quoteBookId) }
    expect(portfolioTriage(unavailable).state(approved)).toBe('quote-book-invalid')
  })
  it('recognizes stale review evidence independently of the open-only checker inbox', () => {
    const collection = seedPortfolioCollection()
    const record = portfolioById(collection, 'PF-INCOME')
    const policy = portfolioTriage(collection)
    expect(policy.state({ ...record, ledger: refreshRiskQuotes(record.ledger) })).toBe('review-stale')
    expect(policy.state({ ...record, ledger: { ...record.ledger, revision: record.ledger.revision + 1 } })).toBe('review-stale')
  })
  it('searches domain references and exposes numeric ledger revision', () => {
    const collection = seedPortfolioCollection()
    const record = portfolioById(collection, 'PF-INCOME')
    const policy = portfolioTriage(collection)
    expect(policy.searchText(record)).toContain('income Q-MARINER')
    expect(policy.revision(record)).toBe(record.ledger.revision)
    expect(policy.state({ ...record, ledger: { ...record.ledger, riskReviews: [] } })).toBe('pending')
  })
})
