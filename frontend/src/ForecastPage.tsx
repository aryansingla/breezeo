import type { ReactNode } from 'react'
import { getDayAhead, useApi, type DayAhead, type Hour, type Meta } from './api'
import {
  Chart,
  Frame,
  GREEN,
  INK,
  Line,
  Signal,
  SummaryTiles,
  WatchList,
  dateTime,
  dayName,
  duration,
  errorClass,
  gwh,
  mw,
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
  meta: Meta
  deliveryDay: string
  decisionTime: string
  onDeliveryDayChange: (value: string) => void
  onDecisionTimeChange: (value: string) => void
}

export function ForecastPage({
  tabs,
  meta,
  deliveryDay,
  decisionTime,
  onDeliveryDayChange,
  onDecisionTimeChange,
  sort,
  onSortChange,
}: Props) {
  const { data, error, loading } = useApi(`${deliveryDay} ${decisionTime}`, () => getDayAhead(deliveryDay, decisionTime))

  const controls = (
    <>
      <label>
        Delivery day
        <input
          type="date"
          min={meta.deliveryFrom}
          max={meta.deliveryTo}
          value={deliveryDay}
          onChange={(e) => e.target.value && onDeliveryDayChange(e.target.value)}
        />
      </label>
      <label>
        <span>
          Decision time <small>day before</small>
        </span>
        <input type="time" value={decisionTime} onChange={(e) => e.target.value && onDecisionTimeChange(e.target.value)} />
      </label>
    </>
  )

  return (
    <Frame tabs={tabs} controls={controls} busy={loading}>
      {error && <p className="error">{error}</p>}
      {data && <DayDetail day={data} sort={sort} onSortChange={onSortChange} />}
    </Frame>
  )
}

function DayDetail({ day, sort, onSortChange }: Sorting & { day: DayAhead }) {
  const { summary } = day

  if (!day.publishedAt) {
    return <p className="muted">No forecast had been published before this decision time.</p>
  }

  const paired = day.hours.filter((hour) => hour.errorMw != null)
  const worst = paired.reduce((a, b) => (Math.abs(b.errorMw!) > Math.abs(a.errorMw!) ? b : a), paired[0])
  const energyGap = (summary.forecastGwh ?? 0) - (summary.actualGwh ?? 0)
  const tooHigh = (summary.biasMw ?? 0) > 0

  return (
    <>
      <SummaryTiles summary={summary} />

      <div className="columns">
        <section className="panel">
          <h2>National wind, {dayName(day.deliveryDay)}</h2>
          <Chart data={day.hours} xKey="hour" xInterval={2}>
            <Line dataKey="forecastMw" name="Forecast" stroke={GREEN} />
            <Line dataKey="actualMw" name="Actual" stroke={INK} strokeWidth={1.5} />
          </Chart>
        </section>

        <aside className="side">
          <Signal title={tooHigh ? 'Forecast overstated wind' : 'Forecast understated wind'}>
            The forecast available at decision time was {mw(Math.abs(summary.biasMw ?? 0))} too {tooHigh ? 'high' : 'low'}{' '}
            on average. Buying against it would have left the desk about {gwh(Math.abs(Math.round(energyGap * 10) / 10))}{' '}
            {energyGap > 0 ? 'short' : 'long'} on the day.
          </Signal>
          <WatchList
            items={[
              <>
                Forecast published {dateTime(day.publishedAt)}, {duration(day.minutesBeforeDecision)} before the decision
              </>,
              <>
                Biggest miss at {worst.hour}: {signedMw(worst.errorMw)}
              </>,
              <>
                Forecast {gwh(summary.forecastGwh)} against actual {gwh(summary.actualGwh)}
              </>,
            ]}
          />
        </aside>
      </div>

      <section className="panel">
        <h2>Forecast, actual and error (MW)</h2>
        <HourTable hours={day.hours} sort={sort} onSortChange={onSortChange} />
      </section>
    </>
  )
}

const errorShare = (hour: Hour) => (hour.errorMw == null || !hour.actualMw ? null : (hour.errorMw / hour.actualMw) * 100)

function HourTable({ hours, sort, onSortChange }: Sorting & { hours: Hour[] }) {
  const table = sortable(
    hours,
    {
      hour: (row) => row.time,
      forecast: (row) => row.forecastMw,
      actual: (row) => row.actualMw,
      error: (row) => row.errorMw,
      'error-percent': errorShare,
    },
    sort,
    onSortChange,
  )

  return (
    <div className="table">
      <table>
        <thead>
          <tr>
            {table.header('hour', 'Hour')}
            {table.header('forecast', 'Forecast')}
            {table.header('actual', 'Actual')}
            {table.header('error', 'Error')}
            {table.header('error-percent', 'Error %')}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => {
            const error = row.errorMw
            const pct = errorShare(row)
            return (
              <tr key={row.time}>
                <td>{row.hour}</td>
                <td>{row.forecastMw?.toLocaleString('en-GB') ?? '–'}</td>
                <td>{row.actualMw?.toLocaleString('en-GB') ?? '–'}</td>
                <td className={errorClass(error)}>{signedMw(error).replace(' MW', '')}</td>
                <td className={errorClass(error)}>{pct == null ? '–' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
