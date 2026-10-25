import type { ComponentProps, ReactNode } from 'react'
import {
  Bar as RechartsBar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line as RechartsLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Summary } from './api'

export const GREEN = '#148937'
export const SOFT_GREEN = '#b8dcc2'
export const INK = '#2b2a2a'

const number = (value: number) => value.toLocaleString('en-GB')

export const mw = (value: number | null) => (value == null ? '–' : `${number(value)} MW`)
export const signedMw = (value: number | null) => (value == null ? '–' : `${value > 0 ? '+' : ''}${number(value)} MW`)
export const gwh = (value: number | null) => (value == null ? '–' : `${number(value)} GWh`)
export const percent = (value: number | null) => (value == null ? '–' : `${value}%`)
export const errorClass = (value: number | null) => (value == null ? '' : value > 0 ? 'high' : 'low')

export function dateTime(iso: string | null) {
  if (!iso) return '–'
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function dayName(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function duration(minutes: number | null) {
  if (minutes == null) return '–'
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

type SortValue = number | string | null

function compare(a: SortValue, b: SortValue) {
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1
  return a < b ? -1 : a > b ? 1 : 0
}

export type Sort = { column: string; order: 'asc' | 'desc' }

export function sortable<T>(
  rows: T[],
  keys: Record<string, (row: T) => SortValue>,
  sort: Sort | undefined,
  onSortChange: (sort: Sort) => void,
) {
  const desc = sort?.order === 'desc'
  const key = sort?.column
  const by = key ? keys[key] : undefined

  const sorted = by
    ? [...rows].sort((a, b) => {
        const x = by(a)
        const y = by(b)
        if (x == null || y == null) return compare(x, y)
        return compare(x, y) * (desc ? -1 : 1)
      })
    : rows

  const toggle = (column: string) => {
    onSortChange({ column, order: column === key && !desc ? 'desc' : 'asc' })
  }

  const header = (column: string, label: ReactNode) => {
    const active = column === key
    return (
      <th aria-sort={active ? (desc ? 'descending' : 'ascending') : undefined}>
        <button type="button" className={active ? 'sort active' : 'sort'} onClick={() => toggle(column)}>
          {label}
          <span aria-hidden="true">{active && desc ? '↓' : '↑'}</span>
        </button>
      </th>
    )
  }

  return { rows: sorted, header }
}

type FrameProps = { tabs: ReactNode; controls: ReactNode; busy: boolean; children: ReactNode }

export function Frame({ tabs, controls, busy, children }: FrameProps) {
  return (
    <div className="frame">
      <div className="frame-bar">
        {tabs}
        <div className="controls">{controls}</div>
      </div>
      <div className={busy ? 'frame-body busy' : 'frame-body'}>{children}</div>
    </div>
  )
}

export function SummaryTiles({ summary }: { summary: Summary }) {
  const bias = summary.biasMw ?? 0
  const tiles = [
    ['Average error', mw(summary.maeMw), `${percent(summary.errorPct)} of actual wind`],
    ['Bias', signedMw(summary.biasMw), bias > 0 ? 'Forecast too high' : bias < 0 ? 'Forecast too low' : 'No bias'],
    ['Worst 10% of hours', `> ${mw(summary.p90Mw)}`, 'Off by more than this'],
    ['RMSE', mw(summary.rmseMw), 'Penalises large misses'],
    ['Forecast energy', gwh(summary.forecastGwh), `Actual ${gwh(summary.actualGwh)}`],
  ]

  return (
    <div className="tiles">
      {tiles.map(([label, value, note]) => (
        <div key={label}>
          <span className="label">{label}</span>
          <strong>{value}</strong>
          <small>{note}</small>
        </div>
      ))}
    </div>
  )
}

export function Signal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="signal">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}

export function WatchList({ items }: { items: ReactNode[] }) {
  return (
    <div className="watch">
      <h3>Worth knowing</h3>
      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

type ChartProps = {
  data: object[]
  xKey: string
  children: ReactNode
  yUnit?: 'GW' | 'MW'
  xInterval?: number
}

export function Chart({ data, xKey, children, yUnit = 'GW', xInterval }: ChartProps) {
  const formatY = (value: number) => (yUnit === 'GW' ? `${value / 1000} GW` : number(value))
  const tick = { fontSize: 11, fill: '#5a5856', fontFamily: 'JetBrains Mono, monospace' }

  return (
    <div className="chart">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(43,42,42,0.08)" vertical={false} />
          <XAxis dataKey={xKey} interval={xInterval} tick={tick} tickLine={false} axisLine={{ stroke: 'rgba(43,42,42,0.2)' }} />
          <YAxis tickFormatter={formatY} tick={tick} width={60} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(value, name) => [name === 'Bias' ? signedMw(Number(value)) : mw(Number(value)), name]}
            contentStyle={{ borderRadius: 0, border: '1px solid rgba(43,42,42,0.12)', fontSize: 12 }}
          />
          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: INK }} />
          {children}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export const Line = (props: ComponentProps<typeof RechartsLine>) => (
  <RechartsLine isAnimationActive={false} dot={false} strokeWidth={2} {...props} />
)

export const Bar = (props: ComponentProps<typeof RechartsBar>) => <RechartsBar isAnimationActive={false} {...props} />
