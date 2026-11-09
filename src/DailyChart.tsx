import { useState } from 'react'
import { Decimal } from 'decimal.js'
import { dayKey, daysBefore } from './currency'

export const periods = [{ label: '7 jours', days: 7 }, { label: '1 mois', days: 30 }, { label: '3 mois', days: 90 }, { label: 'Tout', days: Infinity }]
const dateLabel = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const formatDay = (date: string) => dateLabel.format(new Date(date + 'T00:00:00Z'))
const dayNumber = (date: string) => Date.parse(date + 'T00:00:00Z') / 86400000

export interface ChartPoint {
  date: string
  value: Decimal | null
  detail?: string
}

export function inPeriod<T extends { date: string }>(points: T[], days: number) {
  if (!Number.isFinite(days)) return points
  const cutoff = daysBefore(dayKey(Date.now()), days - 1)
  return points.filter(point => point.date >= cutoff)
}

export function PeriodButtons({ range, choose }: { range: number; choose: (days: number) => void }) {
  return <div className="segments" role="group" aria-label="Période">
    {periods.map(period => <button type="button" key={period.label} className="secondary segment-button"
      aria-pressed={range === period.days} onClick={() => choose(period.days)}>{period.label}</button>)}
  </div>
}

export default function DailyChart({ points, label, format, empty }: {
  points: ChartPoint[]
  label: string
  format: (value: Decimal) => string
  empty: string
}) {
  const [activeDay, setActiveDay] = useState<string>()
  const values = points.flatMap(point => point.value === null ? [] : [point.value])
  const first = points[0]
  const last = points.at(-1)
  const active = points.find(point => point.date === activeDay && point.value !== null)
    ?? [...points].reverse().find(point => point.value !== null)
  if (!values.length || !active || !first || !last) return <p className="history-empty">{empty}</p>
  const min = values.reduce((total, value) => Decimal.min(total, value), values[0])
  const max = values.reduce((total, value) => Decimal.max(total, value), values[0])
  const spread = max.minus(min)
  const start = dayNumber(first.date)
  const duration = dayNumber(last.date) - start
  const coords = points.map(point => point.value === null ? null : {
    point, x: duration === 0 ? 350 : 24 + 652 * (dayNumber(point.date) - start) / duration,
    y: spread.eq(0) ? 85 : 150 - 128 * point.value.minus(min).div(spread).toNumber(),
  })
  const path = coords.map((item, index) => {
    if (!item) return ''
    const previous = coords[index - 1]
    const contiguous = previous && dayNumber(item.point.date) - dayNumber(previous.point.date) <= 1
    return (contiguous ? 'L' : 'M') + item.x.toFixed(2) + ' ' + item.y.toFixed(2)
  }).join(' ')

  return <>
    <p className="history-readout"><strong>{format(active.value!)}</strong><span>{formatDay(active.date)}{active.detail ? ' · ' + active.detail : ''}</span></p>
    <svg className="history-chart" viewBox="0 0 700 175" role="group" aria-label={label}>
      {[22, 85, 150].map(y => <line key={y} x1="24" x2="676" y1={y} y2={y} />)}
      <path d={path} />
      {coords.map(item => item && <circle key={item.point.date} cx={item.x} cy={item.y} r={active.date === item.point.date ? 5 : 3}
        tabIndex={0} onFocus={() => setActiveDay(item.point.date)} onPointerEnter={() => setActiveDay(item.point.date)}
        onClick={() => setActiveDay(item.point.date)} aria-label={formatDay(item.point.date) + ' · ' + format(item.point.value!)}>
        <title>{formatDay(item.point.date) + ' · ' + format(item.point.value!)}</title></circle>)}
    </svg>
    <div className="history-axis"><span>{formatDay(first.date)}</span><span>{first !== last && formatDay(last.date)}</span></div>
    {values.length === 1 && <p className="hint">La courbe se dessinera avec les prochains jours valorisés.</p>}
  </>
}
