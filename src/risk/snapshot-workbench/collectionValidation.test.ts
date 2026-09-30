import { describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from '../../data/memory-storage'
import { StoredDataError } from '../../workspace/storageValidation'
import { portfolioCollectionRule } from './collectionValidation'
import { portfolioById, readPortfolioCollection, savePortfolioCollection, seedPortfolioCollection,
  setQuoteBookValidity } from './portfolioCollection'
import type { PortfolioCollection } from './portfolioCollection'
import { initialRiskLedger, refreshRiskQuotes, requestRiskReview } from './riskLedger'

const key = 'quantdesk:portfolio-collection:v1'
const legacyKey = 'quantdesk:pf-global:risk-approval:v1'
const seed = seedPortfolioCollection()
const record = portfolioById(seed, 'PF-INCOME')
function withLedger(ledger: unknown) { return { ...seed, portfolios: [{ ...record, ledger }] } }

describe('portfolio collection storage integrity', () => {
  it('seeds only absent data without writing', () => {
    const storage = new MemoryStorage()
    const write = vi.spyOn(storage, 'setItem')
    expect(readPortfolioCollection(storage)).toEqual(seed)
    expect(write).not.toHaveBeenCalled()
  })

  it.each(['', '{broken', 'null', '[]', '{}'])('preserves unreadable saved text %j', raw => {
    const storage = new MemoryStorage()
    storage.setItem(key, raw)
    const write = vi.spyOn(storage, 'setItem')
    expect(() => readPortfolioCollection(storage)).toThrow(StoredDataError)
    expect(storage.getItem(key)).toBe(raw)
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    ['null ledger', withLedger(null)],
    ['position shape', withLedger({ ...record.ledger, snapshot: { ...record.ledger.snapshot, positions: [null] } })],
    ['price type', withLedger({ ...record.ledger, snapshot: { ...record.ledger.snapshot,
      positions: [{ id: 'POS-X', issuer: 'private issuer', quantity: 1, price: 'private price', quotedAt: '2026-09-14' }] } })],
    ['mandate number', withLedger({ ...record.ledger, snapshot: { ...record.ledger.snapshot, mandate: { maxIssuerWeight: '0.5' } } })],
    ['review state', withLedger({ ...record.ledger, riskReviews: [{ ...record.ledger.riskReviews?.[0], status: 'approved' }] })],
    ['review decision', withLedger({ ...record.ledger, riskReviews: [{ ...record.ledger.riskReviews?.[0], decision: 'released' }] })],
    ['history actor', withLedger({ ...record.ledger, history: [{ revision: 1, action: 'old', source: 'quotes', actor: 22 }] })],
    ['boolean', withLedger({ ...record.ledger, transformationApplied: 'false' })],
    ['source shape', { ...seed, quoteBooks: [null] }],
    ['event references', { ...seed, events: [{ sequence: 1, action: 'old', targetId: 'PF-INCOME', relatedIds: [1], actor: 'maker', sourceRevision: 1 }] }],
  ])('rejects malformed %s before it reaches a screen', (_name, candidate) => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify(candidate)
    storage.setItem(key, raw)
    const write = vi.spyOn(storage, 'setItem')
    expect(() => readPortfolioCollection(storage)).toThrow(StoredDataError)
    expect(storage.getItem(key)).toBe(raw)
    expect(write).not.toHaveBeenCalled()
  })

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])('rejects invalid revision %s without overwriting', revision => {
    const storage = new MemoryStorage()
    savePortfolioCollection(storage, seed)
    const before = storage.getItem(key)
    const write = vi.spyOn(storage, 'setItem')
    expect(() => savePortfolioCollection(storage, withLedger({ ...record.ledger, revision }) as PortfolioCollection)).toThrow(StoredDataError)
    expect(storage.getItem(key)).toBe(before)
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    ['portfolio', { ...seed, portfolios: [record, record] }],
    ['quote book', { ...seed, quoteBooks: [...seed.quoteBooks, ...seed.quoteBooks] }],
    ['position', withLedger({ ...record.ledger, snapshot: { ...record.ledger.snapshot,
      positions: [...record.ledger.snapshot.positions, ...record.ledger.snapshot.positions] } })],
    ['review', withLedger({ ...record.ledger, riskReviews: [...(record.ledger.riskReviews ?? []), ...(record.ledger.riskReviews ?? [])] })],
  ])('rejects ambiguous duplicate %s identity', (_name, candidate) => {
    expect(() => portfolioCollectionRule(candidate)).toThrow(/duplicate identifiers/)
  })

  it('round-trips optional legacy fields, unknown metadata, negative stress, and historical approvals', () => {
    const optionalLedger = { ...record.ledger, riskReviews: undefined }
    const value = { ...seed, futureMetadata: { version: 2 }, portfolios: [...seed.portfolios,
      { ...record, id: 'PF-EXTRA', ledger: { ...optionalLedger, futureSource: { retained: true } } }] }
    expect(portfolioCollectionRule(value)).toBe(value)
    const storage = new MemoryStorage()
    savePortfolioCollection(storage, value)
    expect(readPortfolioCollection(storage)).toEqual(JSON.parse(JSON.stringify(value)))
    expect(portfolioById(readPortfolioCollection(storage), 'PF-HISTORY').ledger.snapshot.approvedBy).toBeTruthy()
  })

  it('retains stale review history and blocked source states from real transitions', () => {
    const invalidated = setQuoteBookValidity(seed, 'Q-ORION', false, 'market data controller', 1).collection
    const stale = refreshRiskQuotes(record.ledger)
    const renewed = requestRiskReview(stale, 'portfolio manager', 'risk checker')
    const value = { ...invalidated, portfolios: invalidated.portfolios.map(item => item.id === record.id ? { ...item, ledger: renewed } : item) }
    const storage = new MemoryStorage()
    savePortfolioCollection(storage, value)
    expect(readPortfolioCollection(storage)).toEqual(value)
    expect(renewed.riskReviews?.map(item => item.status)).toEqual(['superseded', 'open'])
  })

  it('validates migrated legacy output without rewriting the legacy record', () => {
    const storage = new MemoryStorage()
    const legacy = { ...initialRiskLedger, maker: undefined, approvalRevision: undefined,
      transformationRequestId: undefined, riskReviews: undefined }
    const raw = JSON.stringify(legacy)
    storage.setItem(legacyKey, raw)
    const write = vi.spyOn(storage, 'setItem')
    expect(portfolioById(readPortfolioCollection(storage), 'PF-GLOBAL').ledger).toEqual(initialRiskLedger)
    expect(storage.getItem(legacyKey)).toBe(raw)
    expect(write).not.toHaveBeenCalled()
  })

  it.each(['', JSON.stringify({ ...initialRiskLedger, snapshot: { ...initialRiskLedger.snapshot, positions: [null] } })])(
    'identifies the damaged legacy key without resetting it', raw => {
      const storage = new MemoryStorage()
      storage.setItem(legacyKey, raw)
      const write = vi.spyOn(storage, 'setItem')
      expect(() => readPortfolioCollection(storage)).toThrow(expect.objectContaining({ key: legacyKey, operation: 'read' }))
      expect(storage.getItem(legacyKey)).toBe(raw)
      expect(storage.getItem(key)).toBeNull()
      expect(write).not.toHaveBeenCalled()
    })

  it('reports a safe field path without saved private values', () => {
    const storage = new MemoryStorage()
    storage.setItem(key, JSON.stringify(withLedger({ ...record.ledger, maker: { secret: 'private-value' } })))
    expect(() => readPortfolioCollection(storage)).toThrow(/\$\.portfolios\[0\]\.ledger\.maker/)
    expect(() => readPortfolioCollection(storage)).not.toThrow(/private-value/)
  })
})
