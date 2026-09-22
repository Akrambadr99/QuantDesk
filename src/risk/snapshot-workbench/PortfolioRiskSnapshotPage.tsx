import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { issuerWeights, riskFindings, snapshotValue } from './riskSnapshot'
import { approveRisk, readRiskLedger, refreshRiskQuotes, revokeRiskApproval, riskApprovalPolicy, saveRiskLedger } from './riskLedger'
export function PortfolioRiskSnapshotPage() {
  const { portfolioId, asOf } = useParams()
  const [ledger, setLedger] = useState(() => readRiskLedger(window.localStorage))
  const snapshot = ledger.snapshot
  const [actor, setActor] = useState('')
  const [independent, setIndependent] = useState(false)
  const [notice, setNotice] = useState('')
  const findings = riskFindings(snapshot)
  const approvalPolicy = riskApprovalPolicy(ledger, actor, independent)
  function refreshQuotes() {
    setLedger(saveRiskLedger(window.localStorage, refreshRiskQuotes(ledger)))
    setNotice('Price evidence refreshed in the working revision; original snapshot remains unchanged.')
  }
  function approve() {
    try {
      setLedger(saveRiskLedger(window.localStorage, approveRisk(ledger, actor, independent)))
      setNotice('Independent approval recorded.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Approval failed.') }
  }
  function revoke() {
    try { setLedger(saveRiskLedger(window.localStorage, revokeRiskApproval(ledger))); setNotice('Risk approval revoked.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Revocation failed.') }
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
      <p>Snapshot maker: {ledger.maker} · Approval queue: {approvalPolicy.queue}</p>
      <label>Independent approver <input value={actor} onChange={event => { setActor(event.target.value); }} /></label>
      <label><input type="checkbox" checked={independent} onChange={event => { setIndependent(event.target.checked); }} /> Independent from portfolio manager</label>
      <button disabled={!approvalPolicy.allowed} onClick={approve}>Approve snapshot</button>
      {actor && independent && approvalPolicy.blockers.map(item => <p key={item}>{item}</p>)}
      {snapshot.approvedBy && <button onClick={revoke}>Revoke risk approval</button>}
      <p>{snapshot.approvedBy ? `Approved by ${snapshot.approvedBy}` : 'Approval pending'}</p>
      <p>Risk revision {ledger.revision} · Corporate action {ledger.transformationApplied ? 'applied' : 'pending'}</p>
      <p role="status">{notice}</p>
    </section>
  </div>
}
