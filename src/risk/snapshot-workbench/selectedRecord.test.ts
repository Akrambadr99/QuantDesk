import { describe, expect, it } from 'vitest'
import type { StoragePort } from '../../workspace/repository'
import { saveCurrentCollection } from '../../workspace/recordStorage'
import { openSelectedRecord } from './selectedRecord'
import { readPortfolioCollection, savePortfolioCollection } from './portfolioCollection'
import { readRiskLedger, saveRiskLedger, refreshRiskQuotes } from './riskLedger'

class MemoryStorage implements StoragePort {
  data = new Map<string, string>()
  fail = false
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, raw: string) { if (this.fail) throw new Error('Storage full'); this.data.set(key, raw) }
}
const edit: (state: ReturnType<typeof readRiskLedger>) => ReturnType<typeof readRiskLedger> = state => refreshRiskQuotes(state)
const key = 'quantdesk:pf-global:risk-approval:v1'
describe('selected portfolio persistence', () => {
  it('preserves the primary migration source when a secondary record opens first', () => {
    const storage = new MemoryStorage()
    const before = readPortfolioCollection(storage)
    const peer = before.portfolios[1]
    if (!peer) throw new Error('Secondary fixture missing')
    const bound = openSelectedRecord(storage, peer.id)
    expect(readPortfolioCollection(bound)).toEqual(before)
    expect(storage.data.size).toBe(0)
  })
  it('imports legacy history once and retains its original backup', () => {
    const storage = new MemoryStorage()
    const legacy = edit(readRiskLedger(storage))
    saveRiskLedger(storage, legacy)
    const backup = storage.getItem(key)
    const bound = openSelectedRecord(storage)
    expect(readRiskLedger(bound)).toEqual(legacy)
    saveRiskLedger(bound, legacy)
    expect(readPortfolioCollection(storage).portfolios[0]?.ledger).toEqual(legacy)
    expect(storage.getItem(key)).toBe(backup)
    saveRiskLedger(storage, readRiskLedger(new MemoryStorage()))
    expect(readRiskLedger(openSelectedRecord(storage))).toEqual(legacy)
  })
  it('persists a domain action and preserves every unrelated record', () => {
    const storage = new MemoryStorage(), before = readPortfolioCollection(storage)
    const bound = openSelectedRecord(storage), changed = edit(readRiskLedger(bound))
    saveRiskLedger(bound, changed)
    const after = readPortfolioCollection(storage)
    expect(after.portfolios[0]?.ledger).toEqual(changed)
    expect(after.portfolios.slice(1)).toEqual(before.portfolios.slice(1))
    expect(readRiskLedger(openSelectedRecord(storage))).toEqual(changed)
    expect(after.events.at(-1)).toMatchObject({ action: 'detail-updated', targetId: 'PF-GLOBAL' })
  })
  it('rejects stale edits without replacing the newer domain state', () => {
    const storage = new MemoryStorage()
    const first = openSelectedRecord(storage), stale = openSelectedRecord(storage)
    const changed = edit(readRiskLedger(first))
    saveRiskLedger(first, changed)
    expect(() => saveRiskLedger(stale, edit(readRiskLedger(stale)))).toThrow('changed in another view')
    expect(readRiskLedger(openSelectedRecord(storage))).toEqual(changed)
  })
  it('merges with an unrelated record archive without losing that edit', () => {
    const storage = new MemoryStorage(), bound = openSelectedRecord(storage)
    const before = readPortfolioCollection(storage), peer = before.portfolios[1]
    if (!peer) throw new Error('Peer fixture missing')
    const newer = { ...before, portfolios: before.portfolios.map(item => item.id === peer.id ? { ...item, archived: true } : item) }
    savePortfolioCollection(storage, newer)
    saveRiskLedger(bound, edit(readRiskLedger(bound)))
    expect(readPortfolioCollection(storage).portfolios[1]).toEqual(newer.portfolios[1])
  })
  it('rejects missing and archived targets without writing', () => {
    const storage = new MemoryStorage()
    expect(() => openSelectedRecord(storage, 'missing')).toThrow('not found')
    expect(storage.data.size).toBe(0)
    const before = readPortfolioCollection(storage)
    savePortfolioCollection(storage, { ...before, portfolios: before.portfolios.map(item => ({ ...item, archived: true })) })
    const snapshot = [...storage.data]
    expect(() => openSelectedRecord(storage)).toThrow('archived')
    expect([...storage.data]).toEqual(snapshot)
  })
  it('rejects a record archived after the editor opened', () => {
    const storage = new MemoryStorage(), bound = openSelectedRecord(storage)
    const before = readPortfolioCollection(storage)
    savePortfolioCollection(storage, { ...before, portfolios: before.portfolios.map(item => ({ ...item, archived: true })) })
    expect(() => saveRiskLedger(bound, edit(readRiskLedger(bound)))).toThrow('changed in another view')
  })
  it('preserves retryability after a recoverable storage failure', () => {
    const storage = new MemoryStorage(), bound = openSelectedRecord(storage)
    const changed = edit(readRiskLedger(bound))
    storage.fail = true
    expect(() => saveRiskLedger(bound, changed)).toThrow('Browser storage rejected the save.')
    storage.fail = false
    saveRiskLedger(bound, changed)
    expect(readRiskLedger(openSelectedRecord(storage))).toEqual(changed)
  })
  it('protects a detail edit against a stale whole-workspace save', () => {
    const storage = new MemoryStorage(), stale = readPortfolioCollection(storage)
    const bound = openSelectedRecord(storage)
    saveRiskLedger(bound, edit(readRiskLedger(bound)))
    expect(() => saveCurrentCollection(storage, stale, stale, readPortfolioCollection, savePortfolioCollection)).toThrow('Workspace changed')
    expect(readPortfolioCollection(storage).portfolios[0]?.ledger).not.toEqual(stale.portfolios[0]?.ledger)
  })
})
