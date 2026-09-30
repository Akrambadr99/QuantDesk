import type { ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { RecordScope } from '../../workspace/RecordScope'
import { openSelectedRecord } from './selectedRecord'

export function SelectedRecordRoute({ children }: { children: ReactNode }) {
  const [params] = useSearchParams()
  const route = useParams()
  const id = params.get('record') ?? route['portfolioId'] ?? 'PF-GLOBAL'
  return <RecordScope id={id} back={'/risk/portfolio-workspace?portfolio=' + encodeURIComponent(id)}
    open={target => openSelectedRecord(window.localStorage, target)}>{children}</RecordScope>
}
