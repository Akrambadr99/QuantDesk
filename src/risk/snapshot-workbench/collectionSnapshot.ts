import type { SnapshotAdapter } from '../../workspace/collectionSnapshot'
import { portfolioCollectionRule } from './collectionValidation'
import { readPortfolioCollection } from './portfolioCollection'
import type { PortfolioCollection } from './portfolioCollection'

export const collectionSnapshotAdapter: SnapshotAdapter<PortfolioCollection> = {
  product: 'QuantDesk', scope: 'portfolio-collection', label: 'Portfolios and quote books',
  read: readPortfolioCollection, validate: portfolioCollectionRule,
  groups: collection => [
    { key: 'portfolios', label: 'Portfolios', records: collection.portfolios.map(record => ({
      id: record.id, label: `${record.id} · ${record.mandateId} mandate${record.archived ? ' · Archived' : ''}`, value: record,
    })) },
    { key: 'quoteBooks', label: 'Quote books', records: collection.quoteBooks.map(source => ({
      id: source.id, label: `${source.id} · ${source.issuer}`, value: source,
    })) },
  ],
}
