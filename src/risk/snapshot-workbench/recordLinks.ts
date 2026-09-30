import type { PortfolioCollection } from './portfolioCollection'

type Record = PortfolioCollection['portfolios'][number]
function selected(path: string, id: string) { return path + (path.includes('?') ? '&' : '?') + 'record=' + encodeURIComponent(id) }
export function recordDetailPath(record: Record) { return selected('/portfolios/' + record.id + '/snapshots/2026-09-14', record.id) }
export function recordDecisionPath(record: Record) { return selected('/portfolios/' + record.id + '/actions/CA-202?ratio=1', record.id) }
