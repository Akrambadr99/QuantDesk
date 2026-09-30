import { describe, expect, it, vi } from 'vitest'
import { collectionSignature, compareCollectionSnapshot, createCollectionSnapshot } from '../../workspace/collectionSnapshot'
import type { StorageReader } from '../../platform/storage-port'
import { StoredDataError } from '../../workspace/storageValidation'
import { collectionSnapshotAdapter as adapter } from './collectionSnapshot'
import { seedPortfolioCollection, setQuoteBookValidity } from './portfolioCollection'
import type { PortfolioCollection } from './portfolioCollection'
import { initialRiskLedger } from './riskLedger'

const key = 'quantdesk:portfolio-collection:v1'
const legacyKey = 'quantdesk:pf-global:risk-approval:v1'
const createdAt = '2026-09-30T12:00:00.000Z'
const seed = seedPortfolioCollection()
function storage(entries: [string, string][] = [[key, JSON.stringify(seed)]]) {
  const values = new Map(entries)
  const setItem = vi.fn((name: string, raw: string) => { values.set(name, raw) })
  return { values, setItem, getItem: (name: string) => values.get(name) ?? null }
}
function envelope(payload: unknown, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ format: 'collection-snapshot', version: 1, product: adapter.product,
    scope: adapter.scope, createdAt, payload, ...extra })
}

describe('QuantDesk read-only collection snapshots', () => {
  it('exports the complete domain payload, including archives and metadata, without writes', () => {
    const value = { ...seed, futureMetadata: { retained: true } }
    const port = storage([[key, JSON.stringify(value)], [legacyKey, 'legacy bytes'], ['unrelated', 'private bytes']])
    const before = [...port.values]
    const exported: unknown = JSON.parse(createCollectionSnapshot(adapter, port, createdAt))
    expect(exported).toMatchObject({ format: 'collection-snapshot', version: 1, product: 'QuantDesk',
      scope: adapter.scope, createdAt, payload: value })
    expect(seed.portfolios.some(record => record.archived)).toBe(true)
    expect([...port.values]).toEqual(before)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('compares primary records and keyed sources without treating history as uniquely keyed rows', () => {
    const port = storage()
    const groups = adapter.groups(seed)
    expect(groups.map(group => group.key)).toEqual(['portfolios', 'quoteBooks'])
    const comparison = compareCollectionSnapshot(createCollectionSnapshot(adapter, port, createdAt), adapter, port)
    expect(comparison.rows).toHaveLength(seed.portfolios.length + seed.quoteBooks.length)
    expect(comparison.rows.every(row => row.status === 'unchanged')).toBe(true)
    expect(comparison.payloadChanged).toBe(false)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it.each([
    ['null primary record', { ...seed, portfolios: [null] }],
    ['malformed related source', { ...seed, quoteBooks: [null] }],
    ['duplicate identity', { ...seed, portfolios: [seed.portfolios[0], seed.portfolios[0]] }],
    ['malformed nested ledger', { ...seed, portfolios: [{ ...seed.portfolios[0], ledger: { revision: -1 } }] }],
  ])('rejects %s in uploaded payload without touching any saved entry', (_name, candidate) => {
    const port = storage([[key, JSON.stringify(seed)], [legacyKey, 'legacy bytes'], ['unrelated', 'private bytes']])
    const before = [...port.values]
    expect(() => compareCollectionSnapshot(envelope(candidate), adapter, port)).toThrow()
    expect([...port.values]).toEqual(before)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it.each([{ product: 'OtherProduct' }, { scope: 'other-collection' }, { version: 2 }, { format: 'raw-recovery' }])(
    'rejects incompatible envelope %j', extra => {
      const port = storage()
      expect(() => compareCollectionSnapshot(envelope(seed, extra), adapter, port)).toThrow()
      expect(port.setItem).not.toHaveBeenCalled()
    })

  it('detects changes from a real source transition while preserving valid blocked work', () => {
    const candidate = setQuoteBookValidity(seed, 'Q-ORION', false, 'market data controller', 1).collection
    const port = storage()
    const before = [...port.values]
    const comparison = compareCollectionSnapshot(envelope(candidate), adapter, port)
    expect(comparison.payloadChanged).toBe(true)
    expect(comparison.rows.filter(row => row.status === 'changed')).toHaveLength(4)
    expect([...port.values]).toEqual(before)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('detects history-only differences without inventing duplicate record identities', () => {
    const candidate: PortfolioCollection = { ...seed, events: [{ sequence: 1, action: 'reviewed', targetId: 'PF-GLOBAL', relatedIds: [], actor: 'checker', sourceRevision: 0 }] }
    const port = storage()
    const comparison = compareCollectionSnapshot(envelope(candidate), adapter, port)
    expect(comparison.payloadChanged).toBe(true)
    expect(comparison.rows.every(row => row.status === 'unchanged')).toBe(true)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('does not hide unknown metadata-only differences', () => {
    const port = storage()
    const comparison = compareCollectionSnapshot(envelope({ ...seed, futureMetadata: { retained: true } }), adapter, port)
    expect(comparison.payloadChanged).toBe(true)
    expect(comparison.rows.every(row => row.status === 'unchanged')).toBe(true)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('reads a valid legacy source without materializing or modifying collection storage', () => {
    const legacy = JSON.stringify(initialRiskLedger)
    const port = storage([[legacyKey, legacy]])
    const raw = createCollectionSnapshot(adapter, port, createdAt)
    expect(compareCollectionSnapshot(raw, adapter, port).payloadChanged).toBe(false)
    expect([...port.values]).toEqual([[legacyKey, legacy]])
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('refuses to export or compare against malformed current data without resetting it', () => {
    const port = storage([[key, '{broken'], [legacyKey, JSON.stringify(initialRiskLedger)]])
    const before = [...port.values]
    expect(() => createCollectionSnapshot(adapter, port, createdAt)).toThrow()
    expect(() => compareCollectionSnapshot(envelope(seed), adapter, port)).toThrow()
    expect([...port.values]).toEqual(before)
    expect(port.setItem).not.toHaveBeenCalled()
  })
})

// Supplying no writer is intentional: these calls must compile with read capability alone.
describe('collection snapshot storage capabilities', () => {
  it('exports, signs and compares from a getItem-only port, preserving every stored byte', () => {
    const value = { ...seed, futureMetadata: { retained: true } }
    const values = new Map([[key, JSON.stringify(value)], [legacyKey, 'legacy bytes'], ['unrelated', 'private bytes']])
    const before = [...values]
    const reader: StorageReader = { getItem: name => values.get(name) ?? null }
    const raw = createCollectionSnapshot(adapter, reader, createdAt)
    expect(JSON.parse(raw)).toMatchObject({ payload: value })
    const result = compareCollectionSnapshot(raw, adapter, reader)
    expect(result.payloadChanged).toBe(false)
    expect(result.currentSignature).toBe(collectionSignature(adapter, reader))
    expect(result.rows.every(row => row.status === 'unchanged')).toBe(true)
    expect([...values]).toEqual(before)
    expect('setItem' in reader).toBe(false)
  })

  it('reads the legacy fallback with no writer and does not materialize collection data', () => {
    const legacy = JSON.stringify(initialRiskLedger)
    const values = new Map([[legacyKey, legacy]])
    const reader: StorageReader = { getItem: name => values.get(name) ?? null }
    const raw = createCollectionSnapshot(adapter, reader, createdAt)
    expect(compareCollectionSnapshot(raw, adapter, reader).payloadChanged).toBe(false)
    expect([...values]).toEqual([[legacyKey, legacy]])
  })

  it('seeds an absent collection only in memory through a getItem-only reader', () => {
    const values = new Map<string, string>()
    const reader: StorageReader = { getItem: name => values.get(name) ?? null }
    const raw = createCollectionSnapshot(adapter, reader, createdAt)
    expect(JSON.parse(raw)).toMatchObject({ payload: seed })
    expect(compareCollectionSnapshot(raw, adapter, reader).payloadChanged).toBe(false)
    expect(values.size).toBe(0)
  })

  it.each([key, legacyKey])('reports a read failure for %s without disclosing storage details', blockedKey => {
    const reader: StorageReader = { getItem: name => {
      if (name === blockedKey) throw new Error('PRIVATE storage provider failure')
      return null
    } }
    for (const action of [
      () => createCollectionSnapshot(adapter, reader, createdAt),
      () => compareCollectionSnapshot(envelope(seed), adapter, reader),
      () => collectionSignature(adapter, reader),
    ]) {
      expect(action).toThrow(StoredDataError)
      expect(action).toThrow('Saved data has not been reset')
      expect(action).not.toThrow('PRIVATE')
    }
  })
})
