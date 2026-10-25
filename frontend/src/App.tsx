import { useEffect, useState } from 'react'
import { AccuracyPage } from './AccuracyPage'
import { ForecastPage } from './ForecastPage'
import { getMeta, useApi } from './api'
import { PageSkeleton, dateTime, type Sort } from './ui'

type Page = 'forecast' | 'accuracy'

type Route = { page: Page; day?: string; time?: string; sort?: Sort }

const pages: { id: Page; label: string }[] = [
  { id: 'forecast', label: 'Latest Forecast' },
  { id: 'accuracy', label: 'Forecast Accuracy' },
]

function readRoute(): Route {
  const params = new URLSearchParams(window.location.search)
  const column = params.get('sort')
  return {
    page: window.location.pathname.startsWith('/accuracy') ? 'accuracy' : 'forecast',
    day: params.get('day') ?? undefined,
    time: params.get('time') ?? undefined,
    sort: column ? { column, order: params.get('order') === 'desc' ? 'desc' : 'asc' } : undefined,
  }
}

function routeUrl({ page, day, time, sort }: Route) {
  const params = new URLSearchParams()
  if (page === 'forecast' && day) params.set('day', day)
  if (time) params.set('time', time)
  if (sort) {
    params.set('sort', sort.column)
    params.set('order', sort.order)
  }
  const query = params.toString().replace(/%3A/g, ':')
  return `/${page}${query ? `?${query}` : ''}`
}

function useRoute() {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    const sync = () => setRoute(readRoute())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const navigate = (changes: Partial<Route>, push = false) => {
    const next = { ...route, ...changes }
    window.history[push ? 'pushState' : 'replaceState'](null, '', routeUrl(next))
    setRoute(next)
    if (push) window.scrollTo({ top: 0 })
  }

  return [route, navigate] as const
}

export default function App() {
  const meta = useApi('meta', getMeta)
  const [route, navigate] = useRoute()
  const { page } = route

  const openPage = (next: Page) => navigate({ page: next, sort: undefined }, true)

  const tabs = (
    <div className="tabs" role="tablist">
      {pages.map(({ id, label }) => (
        <button key={id} role="tab" aria-selected={page === id} className={page === id ? 'active' : ''} onClick={() => openPage(id)}>
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <nav className="topbar">
        <div className="brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21.86 12.5C21.1 11.63 20.15 11.13 19 11C19 9.05 18.32 7.4 16.96 6.04C15.6 4.68 13.95 4 12 4C10.42 4 9 4.47 7.75 5.43S5.67 7.62 5.25 9.15C4 9.43 2.96 10.08 2.17 11.1S1 13.28 1 14.58C1 16.09 1.54 17.38 2.61 18.43C3.69 19.5 5 20 6.5 20H18.5C19.75 20 20.81 19.56 21.69 18.69C22.56 17.81 23 16.75 23 15.5C23 14.35 22.62 13.35 21.86 12.5M16.57 18L14 15.43C13.43 15.79 12.74 16 12 16C9.79 16 8 14.21 8 12S9.79 8 12 8 16 9.79 16 12C16 12.74 15.79 13.43 15.43 14L18 16.57L16.57 18M14 12C14 13.11 13.11 14 12 14S10 13.11 10 12 10.9 10 12 10 14 10.9 14 12Z" />
          </svg>
          Wind Forecast Check
        </div>
      </nav>

      <main>
        <section className="intro">
          <h1>
            How much wind can the desk <em>count on</em> tomorrow?
          </h1>
          <p>
            The latest national wind forecast available when the day-ahead purchase is made, compared with what actually
            turned up, and how wrong that forecast tends to be.
          </p>
        </section>

        {meta.error && <p className="error">Could not reach the API: {meta.error}</p>}
        {!meta.data && !meta.error && (
          <div className="frame">
            <div className="frame-body">
              <PageSkeleton />
            </div>
          </div>
        )}

        {meta.data &&
          (page === 'forecast' ? (
            <ForecastPage
              tabs={tabs}
              meta={meta.data}
              deliveryDay={route.day ?? meta.data.deliveryFrom}
              decisionTime={route.time ?? meta.data.defaultDecisionTime}
              onDeliveryDayChange={(day) => navigate({ day })}
              onDecisionTimeChange={(time) => navigate({ time })}
              sort={route.sort}
              onSortChange={(sort) => navigate({ sort })}
            />
          ) : (
            <AccuracyPage
              tabs={tabs}
              decisionTime={route.time ?? meta.data.defaultDecisionTime}
              onDecisionTimeChange={(time) => navigate({ time })}
              sort={route.sort}
              onSortChange={(sort) => navigate({ sort })}
              onOpenDay={(day) => navigate({ page: 'forecast', day, sort: undefined }, true)}
            />
          ))}
      </main>

      <footer>
        Forecasts are compared with actuals hour by hour. Error is forecast minus actual. Times are UK local. Data from{' '}
        <a href="https://bmrs.elexon.co.uk" target="_blank" rel="noreferrer">
          Elexon BMRS
        </a>
        {meta.data && <>, downloaded {dateTime(meta.data.downloadedAt)}</>}.
      </footer>
    </>
  )
}
