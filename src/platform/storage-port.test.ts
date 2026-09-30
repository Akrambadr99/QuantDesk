import { describe, expect, expectTypeOf, it } from 'vitest'
import type { StoragePort as LegacyStoragePort } from '../workspace/repository'
import type { StoragePort, StorageReader, StorageWriter } from './storage-port'

describe('platform storage capabilities', () => {
  it('keeps the existing repository port source-compatible', () => {
    expectTypeOf<LegacyStoragePort>().toEqualTypeOf<StoragePort>()
    expectTypeOf<keyof StorageReader>().toEqualTypeOf<'getItem'>()
    expectTypeOf<keyof StorageWriter>().toEqualTypeOf<'setItem'>()
    expectTypeOf<keyof StoragePort>().toEqualTypeOf<'getItem' | 'setItem'>()
  })

  it('lets existing read-write implementations provide either capability', () => {
    const values = new Map<string, string>()
    const port: StoragePort = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
    }
    const legacy: LegacyStoragePort = port
    const reader: StorageReader = legacy
    const writer: StorageWriter = port
    expect(reader.getItem('record')).toBeNull()
    writer.setItem('record', 'unchanged format')
    expect(reader.getItem('record')).toBe('unchanged format')
  })
})
