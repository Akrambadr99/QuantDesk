import type { StorageReader } from '../../platform/storage-port'
import { readPortfolioCollection } from './portfolioCollection'

export function activeRecordWork(storage: StorageReader) {
  return readPortfolioCollection(storage).portfolios.filter(item => !item.archived).map(item => ({ portfolioId: item.id, mandateId: item.mandateId, ledger: item.ledger }))
}
export function selectedRecordWork(storage: StorageReader, id: string) {
  const record = activeRecordWork(storage).find(item => item.portfolioId === id)
  if (!record) throw new Error('Active record not found.')
  return record
}
