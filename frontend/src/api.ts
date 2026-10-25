import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? ''

export type Summary = {
  hours: number
  maeMw: number | null
  rmseMw: number | null
  biasMw: number | null
  p90Mw: number | null
  errorPct: number | null
  forecastGwh: number | null
  actualGwh: number | null
}

export type Meta = {
  deliveryFrom: string
  deliveryTo: string
  defaultDecisionTime: string
  downloadedAt: string
}

export type Hour = {
  time: string
  hour: string
  forecastMw: number | null
  actualMw: number | null
  errorMw: number | null
}

export type DayAhead = {
  deliveryDay: string
  decidedAt: string
  publishedAt: string | null
  minutesBeforeDecision: number | null
  hours: Hour[]
  summary: Summary
}

export type Accuracy = {
  decisionTime: string
  summary: Summary
  byHour: (Summary & { hour: string })[]
  byDay: (Summary & { deliveryDay: string; publishedAt: string | null })[]
  byLeadTime: (Summary & { fromHours: number; toHours: number })[]
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}?${new URLSearchParams(params)}`)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed (${response.status})`)
  }
  return response.json()
}

export const getMeta = () => get<Meta>('/api/meta')

export const getDayAhead = (deliveryDay: string, decisionTime: string) =>
  get<DayAhead>('/api/day-ahead', { delivery_day: deliveryDay, decision_time: decisionTime })

export const getAccuracy = (decisionTime: string) => get<Accuracy>('/api/accuracy', { decision_time: decisionTime })

export function useApi<T>(key: string, request: () => Promise<T>) {
  const [state, setState] = useState<{ key?: string; data?: T; error?: string }>({})

  useEffect(() => {
    let active = true
    request().then(
      (data) => active && setState({ key, data }),
      (error: Error) => active && setState((previous) => ({ ...previous, key, error: error.message })),
    )
    return () => {
      active = false
    }
  }, [key])

  return { data: state.data, error: state.error, loading: state.key !== key }
}
