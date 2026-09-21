export interface Position { id: string; issuer: string; quantity: number; price: number; quotedAt: string }
export interface Mandate { maxIssuerWeight: number; maxLossPercent: number; maxQuoteAgeDays: number }
export interface RiskSnapshot { id: string; asOf: string; positions: readonly Position[]; mandate: Mandate; stressPercent: number; approvedBy?: string }
export const baselineSnapshot: RiskSnapshot = {
  id: 'PF-GLOBAL/2026-09-14', asOf: '2026-09-14', stressPercent: -8.4,
  mandate: { maxIssuerWeight: 0.5, maxLossPercent: 7, maxQuoteAgeDays: 2 },
  positions: [
    { id: 'POS-1', issuer: 'Orion', quantity: 100, price: 120, quotedAt: '2026-09-14' },
    { id: 'POS-2', issuer: 'Mariner', quantity: 40, price: 80, quotedAt: '2026-09-10' },
    { id: 'POS-3', issuer: 'Mariner', quantity: 30, price: 90, quotedAt: '2026-09-14' },
  ],
}
export interface RiskFinding { code: 'CONCENTRATION' | 'STRESS' | 'STALE_PRICE'; detail: string }
export function snapshotValue(snapshot: RiskSnapshot): number {
  return snapshot.positions.reduce((sum, position) => sum + position.quantity * position.price, 0)
}
export function issuerWeights(snapshot: RiskSnapshot): { issuer: string; weight: number }[] {
  const total = snapshotValue(snapshot)
  const issuers = [...new Set(snapshot.positions.map(position => position.issuer))]
  return issuers.map(issuer => ({
    issuer, weight: total ? snapshot.positions.filter(position => position.issuer === issuer)
      .reduce((sum, position) => sum + position.quantity * position.price, 0) / total : 0,
  }))
}
export function riskFindings(snapshot: RiskSnapshot): RiskFinding[] {
  const findings: RiskFinding[] = []
  for (const item of issuerWeights(snapshot)) {
    if (item.weight > snapshot.mandate.maxIssuerWeight) findings.push({ code: 'CONCENTRATION', detail: `${item.issuer} exceeds the mandate weight.` })
  }
  if (-snapshot.stressPercent > snapshot.mandate.maxLossPercent) findings.push({ code: 'STRESS', detail: 'Stress loss exceeds mandate limit.' })
  const asOf = Date.parse(snapshot.asOf + 'T00:00:00Z')
  for (const position of snapshot.positions) {
    if ((asOf - Date.parse(position.quotedAt + 'T00:00:00Z')) / 86400000 > snapshot.mandate.maxQuoteAgeDays) {
      findings.push({ code: 'STALE_PRICE', detail: `${position.id} price is stale.` })
    }
  }
  return findings
}
export function approveSnapshot(snapshot: RiskSnapshot, actor: string, independent: boolean): RiskSnapshot {
  if (!independent) throw new Error('Independent risk approval is required.')
  if (!actor.trim()) throw new Error('Approver identity is required.')
  if (riskFindings(snapshot).some(item => item.code === 'STALE_PRICE')) throw new Error('Stale prices must be refreshed before approval.')
  return { ...snapshot, approvedBy: actor }
}
