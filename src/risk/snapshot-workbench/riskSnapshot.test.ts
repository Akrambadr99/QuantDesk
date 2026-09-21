import { describe, expect, it } from 'vitest'
import { approveSnapshot, baselineSnapshot, issuerWeights, riskFindings, snapshotValue } from './riskSnapshot'
describe('portfolio risk snapshot', () => {
  it('values positions and aggregates issuer concentration', () => {
    expect(snapshotValue(baselineSnapshot)).toBe(17900)
    expect(issuerWeights(baselineSnapshot)[0]!.weight).toBeCloseTo(12000 / 17900)
  })
  it('separates concentration, stress, and stale-price findings', () => {
    expect(riskFindings(baselineSnapshot).map(item => item.code)).toEqual(['CONCENTRATION', 'STRESS', 'STALE_PRICE'])
  })
  it('requires independent approval and fresh quotes', () => {
    expect(() => approveSnapshot(baselineSnapshot, 'R. Shah', false)).toThrow(/Independent/)
    expect(() => approveSnapshot(baselineSnapshot, 'R. Shah', true)).toThrow(/Stale/)
    const refreshed = { ...baselineSnapshot, positions: baselineSnapshot.positions.map(item => ({ ...item, quotedAt: baselineSnapshot.asOf })) }
    expect(approveSnapshot(refreshed, 'R. Shah', true).approvedBy).toBe('R. Shah')
  })
})
