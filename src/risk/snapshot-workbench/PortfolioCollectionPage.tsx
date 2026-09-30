import { recordDetailPath, recordDecisionPath } from './recordLinks'
import { Link } from 'react-router-dom'
import { saveCurrentCollection } from '../../workspace/recordStorage'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { riskCheckers } from './checkerWorkload'
import { archivePortfolio, bulkRefreshPortfolios, claimPortfolioReview, createPortfolio,
  portfolioReviewInbox, portfolioRows, portfolioSummary, readPortfolioCollection,
  refreshPortfolioQuotes, savePortfolioCollection, setQuoteBookValidity } from './portfolioCollection'

export function PortfolioCollectionPage() {
  const [collection, setCollection] = useState(() => readPortfolioCollection(window.localStorage))
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('active')
  const [checkerId, setCheckerId] = useState('checker-amina')
  const [checked, setChecked] = useState<string[]>([])
  const [newId, setNewId] = useState('')
  const [notice, setNotice] = useState('')
  const selectedId = params.get('portfolio') ?? 'PF-INCOME'
  const selected = collection.portfolios.find(item => item.id === selectedId)
  const rows = portfolioRows(collection, query, filter)
  const inbox = portfolioReviewInbox(collection)
  const summary = portfolioSummary(collection)
  function choose(id: string) { setParams(current => { const next = new URLSearchParams(current); next.set('portfolio', id); return next }) }
  function persist(next: typeof collection, message: string) { try { setCollection(saveCurrentCollection(window.localStorage, collection, next, readPortfolioCollection, savePortfolioCollection)); setNotice(message); return true } catch (error) { setNotice(error instanceof Error ? error.message : 'Save failed. Your input is preserved.'); return false } }
  function run(action: () => typeof collection, success: string) {
    try { return persist(action(), success) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Portfolio operation failed.'); return false }
  }
  return <main className="suite-page">
    <header className="suite-title"><div><small>RISK / INDEPENDENT REVIEW</small><h1>Portfolio review workspace</h1>
      <p>Persisted portfolio revisions, linked quote books and named checker work.</p></div></header>
    <section className="metrics" aria-label="Portfolio summary">
      <article><small>Active portfolios</small><strong>{summary.active}</strong></article>
      <article><small>Approved</small><strong>{summary.approved}</strong></article>
      <article><small>Unclaimed reviews</small><strong>{summary.unclaimed}</strong></article>
      <article><small>Stale reviews</small><strong>{summary.stale}</strong></article>
    </section>
    <section className="suite-card" aria-label="Checker queue"><h2>Independent review queue</h2>
      {inbox.length ? <ul>{inbox.map(item => <li key={item.portfolioId + item.reviewId}>
        <button onClick={() => { choose(item.portfolioId) }}>{item.portfolioId}</button> · {item.reviewId} ·
        {item.assignee} · {item.findingCount} findings · {item.actionable ? 'current' : 'blocked'}
      </li>)}</ul> : <p>No open checker reviews.</p>}
      <label>Qualified checker <select value={checkerId} onChange={event => { setCheckerId(event.target.value) }}>
        {riskCheckers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
    </section>
    <section className="suite-card" aria-label="Portfolio collection"><h2>Portfolios</h2>
      <div className="filters"><label>Search portfolios <input value={query} onChange={event => { setQuery(event.target.value) }} /></label>
        <label>Show <select value={filter} onChange={event => { setFilter(event.target.value) }}>
          <option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option>
        </select></label></div>
      {rows.length ? <ul>{rows.map(record => <li key={record.id}>
        <label><input type="checkbox" checked={checked.includes(record.id)} onChange={event => {
          setChecked(current => event.target.checked ? [...current, record.id] : current.filter(id => id !== record.id))
        }} /> Select {record.id}</label>
        <button aria-current={selectedId === record.id ? 'true' : undefined} onClick={() => { choose(record.id) }}>
          {record.id} · {record.mandateId} · {record.ledger.snapshot.approvedBy ? 'approved' : 'pending'}
        </button><small> r{record.ledger.revision} · {record.quoteBookId}{record.archived ? ' · archived' : ''}</small>
      </li>)}</ul> : <p>No portfolios match this view.</p>}
      <button disabled={!checked.length} onClick={() => {
        const result = bulkRefreshPortfolios(collection, checked, 'portfolio manager')
        persist(result.collection, `${String(result.updated.length)} refreshed; ${String(result.skipped.length)} current; ${String(result.blocked.length)} blocked.`)
      }}>Refresh selected quotes</button>
      <form onSubmit={event => { event.preventDefault(); if (run(() => createPortfolio(collection, newId, 'global', 'Q-ORION'), 'Portfolio created.')) setNewId('') }}>
        <label>New portfolio ID <input value={newId} onChange={event => { setNewId(event.target.value) }} pattern="PF-[A-Z0-9-]+" required /></label>
        <button type="submit">Create global portfolio</button>
      </form>
    </section>
    <section className="suite-card" aria-label="Selected portfolio"><h2>{selected?.id ?? 'Select a portfolio'}</h2>
      {selected && <><p>Mandate {selected.mandateId} · Quote book {selected.quoteBookId} · Risk revision {selected.ledger.revision}</p>
        <p>Maker {selected.ledger.maker} · Approval {selected.ledger.snapshot.approvedBy ?? 'pending'} ·
          Review {selected.ledger.riskReviews?.find(item => item.status === 'open')?.assignee ?? 'none'}</p>
        <button onClick={() => { run(() => claimPortfolioReview(collection, selected.id, checkerId, selected.ledger.revision),
          'Risk review claimed by named checker.') }}>Claim selected review</button>
        <button onClick={() => { run(() => refreshPortfolioQuotes(collection, selected.id, 'portfolio manager'),
          'Quotes refreshed for selected portfolio.') }}>Refresh selected portfolio</button>
        <button onClick={() => { run(() => archivePortfolio(collection, selected.id), 'Portfolio archived.') }}>Archive portfolio</button>
        <button onClick={() => {
          const source = collection.quoteBooks.find(item => item.id === selected.quoteBookId)
          if (!source) return
          try { const result = setQuoteBookValidity(collection, source.id, !source.valid, 'market data controller', source.revision)
            persist(result.collection, `${String(result.updated.length)} related portfolios updated; ${String(result.blocked.length)} blocked.`)
          } catch (error) { setNotice(error instanceof Error ? error.message : 'Quote-book update failed.') }
        }}>Toggle linked quote book</button>
        <p>Quote book: {collection.quoteBooks.find(item => item.id === selected.quoteBookId)?.valid ? 'valid' : 'invalid'}</p>
        <details><summary>Risk history</summary><ol>{selected.ledger.history.map((item, index) =>
          <li key={index}>{item.action} · r{item.revision} · {item.actor ?? 'system'}</li>)}</ol></details>
      </>}
    </section>
    <section className="suite-card" aria-label="Portfolio audit"><h2>Collection audit</h2>
      <ol>{collection.events.toReversed().slice(0, 8).map(item => <li key={item.sequence}>
        {item.action} · {item.targetId} · related {item.relatedIds.join(', ') || 'none'} · {item.actor}
      </li>)}</ol></section>
    <nav aria-label="Selected record workflows">{selected && !selected.archived && <><Link to={recordDetailPath(selected)}>Open record details</Link>{' · '}<Link to={recordDecisionPath(selected)}>Open decision workflow</Link></>} <button onClick={() => { try { setCollection(readPortfolioCollection(window.localStorage)); setNotice('Workspace refreshed; selection preserved.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Refresh failed.') } }}>Refresh workspace</button></nav>
    <p role="status">{notice}</p>
  </main>
}
