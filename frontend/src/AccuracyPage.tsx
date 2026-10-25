import type { ReactNode } from 'react'
import { getAccuracy, useApi, type Accuracy } from './api'
import {
  Bar,
  Chart,
  Frame,
  INK,
  Line,
  SOFT_GREEN,
  Signal,
  SummaryTiles,
  WatchList,
  dateTime,
  dayName,
  errorClass,
  mw,
  percent,
  signedMw,
  sortable,
  type Sort,
} from './ui'

type Sorting = {
  sort?: Sort
  onSortChange: (sort: Sort) => void
}

type Props = Sorting & {
  tabs: ReactNode
  decisionTime: string
  onDecisionTimeChange: (value: string) => void
  onOpenDay: (deliveryDay: string) => void
}

export function AccuracyPage({ tabs, decisionTime, onDecisionTimeChange, onOpenDay, sort, onSortChange }: Props) {
  const { data, error, loading } = useApi(decisionTime, () => getAccuracy(decisionTime))

  const controls = (
    <label>
      <span>
        Decision time <small>day before</small>
      </span>
      <input type="time" value={decisionTime} onChange={(e) => e.target.value && onDecisionTimeChange(e.target.value)} />
    </label>
  )

  return (
    <Frame tabs={tabs} controls={controls} busy={loading}>
      {error && <p className="error">{error}</p>}
      {data ? (
        <AccuracyDetail accuracy={data} onOpenDay={onOpenDay} sort={sort} onSortChange={onSortChange} />
      ) : (
        !error && <p className="muted">Loading…</p>
      )}
    </Frame>
  )
}

type DetailProps = Sorting & { accuracy: Accuracy; onOpenDay: (day: string) => void }

function AccuracyDetail({ accuracy, onOpenDay, sort, onSortChange }: DetailProps) {
  const { summary, byDay, byHour, decisionTime } = accuracy
  const byLeadTime = accuracy.byLeadTime.map((bucket) => ({ ...bucket, label: `${bucket.fromHours}–${bucket.toHours}h` }))
  const shortest = byLeadTime[0]
  const longest = byLeadTime[byLeadTime.length - 1]
  const daysTooHigh = byDay.filter((day) => (day.biasMw ?? 0) > 0).length
  const hardestHour = byHour.reduce((a, b) => ((b.maeMw ?? 0) > (a.maeMw ?? 0) ? b : a))
  const worstDay = byDay.reduce((a, b) => ((b.maeMw ?? 0) > (a.maeMw ?? 0) ? b : a))
  const tooHigh = (summary.biasMw ?? 0) > 0
  const days = sortable(
    byDay,
    {
      'delivery-day': (day) => day.deliveryDay,
      published: (day) => day.publishedAt,
      'average-error': (day) => day.maeMw,
      'error-percent': (day) => day.errorPct,
      bias: (day) => day.biasMw,
      'worst-10-percent': (day) => day.p90Mw,
      'forecast-energy': (day) => day.forecastGwh,
      'actual-energy': (day) => day.actualGwh,
    },
    sort,
    onSortChange,
  )

  return (
    <>
      <SummaryTiles summary={summary} />

      <div className="columns">
        <section className="panel">
          <h2>Error by how far ahead the forecast was made</h2>
          <p className="muted">All January forecasts, whatever the decision time.</p>
          <Chart data={byLeadTime} xKey="label" yUnit="MW">
            <Bar dataKey="maeMw" name="Average error" fill={SOFT_GREEN} />
            <Line dataKey="biasMw" name="Bias" stroke={INK} dot={{ r: 3, fill: INK }} />
          </Chart>
        </section>

        <aside className="side">
          <Signal title={tooHigh ? 'Treat the forecast as optimistic' : 'Treat the forecast as conservative'}>
            At {decisionTime} the day before, the forecast was off by {mw(summary.maeMw)} in a typical hour (
            {percent(summary.errorPct)} of actual wind) and {mw(Math.abs(summary.biasMw ?? 0))} too{' '}
            {tooHigh ? 'high' : 'low'} on average. Plan cover for that gap before relying on it.
          </Signal>
          <WatchList
            items={[
              <>
                Too high on {daysTooHigh} of {byDay.length} delivery days
              </>,
              <>
                Error grows from {mw(shortest.maeMw)} at 0–6h ahead to {mw(longest.maeMw)} at 42–48h
              </>,
              <>
                Hardest hour to forecast: {hardestHour.hour} ({mw(hardestHour.maeMw)})
              </>,
              <>
                Worst day: {dayName(worstDay.deliveryDay)} ({mw(worstDay.maeMw)})
              </>,
            ]}
          />
        </aside>
      </div>

      <section className="panel">
        <h2>Error by hour of the delivery day</h2>
        <p className="muted">Using the forecast available at {decisionTime} the day before.</p>
        <Chart data={byHour} xKey="hour" yUnit="MW" xInterval={1}>
          <Bar dataKey="maeMw" name="Average error" fill={SOFT_GREEN} />
          <Line dataKey="biasMw" name="Bias" stroke={INK} />
        </Chart>
      </section>

      <section className="panel">
        <h2>Each delivery day</h2>
        <p className="muted">Select a day to open it hour by hour. Select a column heading to sort.</p>
        <div className="table">
          <table>
            <thead>
              <tr>
                {days.header('delivery-day', 'Delivery day')}
                {days.header('published', 'Forecast published')}
                {days.header('average-error', 'Average error')}
                {days.header('error-percent', 'Error %')}
                {days.header('bias', 'Bias')}
                {days.header('worst-10-percent', 'Worst 10% above')}
                {days.header('forecast-energy', 'Forecast energy')}
                {days.header('actual-energy', 'Actual energy')}
              </tr>
            </thead>
            <tbody>
              {days.rows.map((day) => (
                <tr key={day.deliveryDay} className="clickable" onClick={() => onOpenDay(day.deliveryDay)}>
                  <td>{dayName(day.deliveryDay)}</td>
                  <td>{dateTime(day.publishedAt)}</td>
                  <td>{mw(day.maeMw)}</td>
                  <td>{percent(day.errorPct)}</td>
                  <td className={errorClass(day.biasMw)}>{signedMw(day.biasMw)}</td>
                  <td>{mw(day.p90Mw)}</td>
                  <td>{day.forecastGwh} GWh</td>
                  <td>{day.actualGwh} GWh</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
