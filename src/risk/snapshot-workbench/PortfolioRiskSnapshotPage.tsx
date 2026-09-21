import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { approveSnapshot, baselineSnapshot, issuerWeights, riskFindings, snapshotValue } from './riskSnapshot'
export function PortfolioRiskSnapshotPage() {
  const { portfolioId, asOf } = useParams()
  const [snapshot, setSnapshot] = useState(baselineSnapshot)
  const [actor, setActor] = useState('')
  const [independent, setIndependent] = useState(false)
  const [notice, setNotice] = useState('')
  const findings = riskFindings(snapshot)
  function refreshQuotes() {
    setSnapshot(current => ({ ...current, positions: current.positions.map(position =>
      position.quotedAt < current.asOf ? { ...position, quotedAt: current.asOf } : position) }))
    setNotice('Price evidence refreshed in the working revision; original snapshot remains unchanged.')
  }
  function approve() {
    try {
      setSnapshot(current => approveSnapshot(current, actor, independent))
      setNotice('Independent approval recorded.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Approval failed.') }
  }
  return <div className="suite-page">
    <header className="suite-title"><div><small>RISK / EFFECTIVE SNAPSHOT</small>
      <h1>Portfolio risk snapshot workbench</h1>
      <p>Portfolio {portfolioId ?? 'PF-GLOBAL'} · Snapshot {asOf ?? snapshot.asOf} · Stress {snapshot.stressPercent}%</p>
    </div></header>
    <section className="suite-card" aria-label="Position valuation">
      <h2>Exposure</h2><p>Total market value: {snapshotValue(snapshot).toLocaleString()}</p>
      <table><thead><tr><th>Issuer</th><th>Mandate weight</th><th>Actual weight</th></tr></thead>
        <tbody>{issuerWeights(snapshot).map(item => <tr key={item.issuer}><th scope="row">{item.issuer}</th>
          <td>{Math.round(snapshot.mandate.maxIssuerWeight * 100)}%</td>
          <td>{(item.weight * 100).toFixed(1)}%</td></tr>)}</tbody></table>
    </section>
    <section className="suite-card" aria-label="Risk review">
      <h2>Mandate findings</h2>
      <p>Limit breach requires independent approval.</p>
      <ul>{findings.map(item => <li key={item.code + item.detail}><strong>{item.code}</strong> · {item.detail}</li>)}</ul>
      {findings.length === 0 && <p>No mandate findings.</p>}
      <button onClick={refreshQuotes} disabled={!findings.some(item => item.code === 'STALE_PRICE')}>Refresh stale quote evidence</button>
      <label>Independent approver <input value={actor} onChange={event => { setActor(event.target.value); }} /></label>
      <label><input type="checkbox" checked={independent} onChange={event => { setIndependent(event.target.checked); }} /> Independent from portfolio manager</label>
      <button disabled={Boolean(snapshot.approvedBy)} onClick={approve}>Approve snapshot</button>
      <p>{snapshot.approvedBy ? `Approved by ${snapshot.approvedBy}` : 'Approval pending'}</p>
      <p role="status">{notice}</p>
    </section>
  </div>
}
