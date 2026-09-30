import type { StoragePort } from '../../platform/storage-port'
import { bindRecord } from '../../workspace/recordStorage'
import { readPortfolioCollection, savePortfolioCollection } from './portfolioCollection'
import { readRiskLedger } from './riskLedger'

export function openSelectedRecord(storage: StoragePort, id = 'PF-GLOBAL') {
  return bindRecord(storage, id, {
    key: 'quantdesk:pf-global:risk-approval:v1',
    collectionKey: 'quantdesk:portfolio-collection:v1',
    read: readPortfolioCollection, save: savePortfolioCollection,
    find: (collection, target) => collection.portfolios.find(item => item.id === target),
    value: record => record.ledger, archived: record => record.archived,
    replace: (collection, target, raw) => {
      const value = readRiskLedger({ getItem: () => raw })
      return { ...collection, portfolios: collection.portfolios.map(item => item.id === target ? { ...item, ledger: value } : item),
        events: [...collection.events, { sequence: collection.events.length + 1, action: 'detail-updated', targetId: target, relatedIds: [], actor: 'detail workflow', sourceRevision: value.revision }] }
    },
  })
}
