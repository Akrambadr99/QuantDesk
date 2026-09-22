import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../../data/memory-storage'
import { archivePortfolio, bulkRefreshPortfolios, claimPortfolioReview, createPortfolio,
  portfolioById, portfolioReviewInbox, portfolioRows, portfolioSummary, readPortfolioCollection,
  savePortfolioCollection, seedPortfolioCollection, setQuoteBookValidity } from './portfolioCollection'

describe('persisted portfolio collection', () => {
  it('retains six independent portfolios and one named claim across persistence and reset', () => {
    const storage = new MemoryStorage()
    const initial = readPortfolioCollection(storage)
    expect(initial.portfolios).toHaveLength(6)
    expect(portfolioReviewInbox(initial)).toHaveLength(3)
    const peer = portfolioById(initial, 'PF-INCOME')
    const growth = portfolioById(initial, 'PF-GROWTH')
    const claimed = claimPortfolioReview(initial, 'PF-GROWTH', 'checker-amina', growth.ledger.revision)
    expect(portfolioById(claimed, 'PF-GROWTH').ledger.riskReviews?.[0]?.assignee).toBe('checker-amina')
    expect(portfolioById(claimed, 'PF-INCOME')).toEqual(peer)
    expect(() => claimPortfolioReview(claimed, 'PF-GROWTH', 'checker-luis',
      portfolioById(claimed, 'PF-GROWTH').ledger.revision)).toThrow(/already assigned/)
    savePortfolioCollection(storage, claimed)
    expect(readPortfolioCollection(storage)).toEqual(claimed)
    storage.clear()
    expect(readPortfolioCollection(storage)).toEqual(seedPortfolioCollection())
  })

  it('invalidates only portfolios referencing the changed quote book', () => {
    const initial = seedPortfolioCollection()
    const unrelated = portfolioById(initial, 'PF-INCOME')
    const result = setQuoteBookValidity(initial, 'Q-ORION', false, 'market data controller', 1)
    expect(result.updated).toEqual(['PF-GLOBAL', 'PF-GROWTH', 'PF-LIQUID'])
    expect(portfolioById(result.collection, 'PF-GROWTH').ledger.riskReviews?.[0]?.status).toBe('stale')
    expect(portfolioById(result.collection, 'PF-INCOME')).toEqual(unrelated)
    expect(result.collection.events[0]).toMatchObject({ targetId: 'Q-ORION', relatedIds: result.updated })
    expect(() => setQuoteBookValidity(result.collection, 'Q-ORION', true, 'market data controller', 1)).toThrow(/revision changed/)
  })

  it('returns per-portfolio bulk outcomes without changing current peers', () => {
    const initial = seedPortfolioCollection()
    const income = portfolioById(initial, 'PF-INCOME')
    const result = bulkRefreshPortfolios(initial, ['PF-GLOBAL', 'PF-LIQUID', 'PF-INCOME', 'PF-GLOBAL'], 'portfolio manager')
    expect(result.updated).toEqual(['PF-GLOBAL', 'PF-LIQUID'])
    expect(result.skipped).toEqual(['PF-INCOME'])
    expect(result.blocked).toEqual([])
    expect(portfolioById(result.collection, 'PF-INCOME')).toEqual(income)
    expect(portfolioSummary(result.collection).active).toBe(5)
  })

  it('creates stable references and archives only portfolios without active review', () => {
    const initial = seedPortfolioCollection()
    expect(() => archivePortfolio(initial, 'PF-INCOME')).toThrow(/Open review/)
    const created = createPortfolio(initial, 'PF-NEW', 'global', 'Q-ORION')
    expect(portfolioById(created, 'PF-NEW').ledger.revision).toBe(0)
    expect(() => createPortfolio(created, 'PF-NEW', 'global', 'Q-ORION')).toThrow(/unique/)
    expect(() => createPortfolio(created, 'PF-OTHER', 'global', 'Q-MISSING')).toThrow(/referenced quote/)
    const archived = archivePortfolio(created, 'PF-NEW')
    expect(portfolioRows(archived).some(item => item.id === 'PF-NEW')).toBe(false)
    expect(portfolioRows(archived, 'PF-NEW', 'archived')).toHaveLength(1)
  })
})
