import { useState } from 'react'
import { Decimal } from 'decimal.js'
import { dayKey, daysBefore } from './currency'

export const periods = [{ label: '24 h', days: 1 }, { label: '7 j', days: 7 }, { label: '1 mois', days: 30 },
  { label: '3 mois', days: 90 }, { label: '6 mois', days: 183 }, { label: '1 an', days: 365 }, { label: 'Depuis le début', days: Infinity }]
const dateLabel = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const formatDay = (date: string) => dateLabel.format(new Date(date + 'T00:00:00Z'))
const intradayLabel = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })
const timeOf = (point: ChartPoint) => point.at ?? Date.parse(point.date + 'T00:00:00Z')
const labelOf = (point: ChartPoint) => point.at === undefined ? formatDay(point.date) : intradayLabel.format(point.at)

export interface ChartPoint {
  date: string
  at?: number
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
  const [selectedTime, setSelectedTime] = useState<number>()
  const values = points.flatMap(point => point.value === null ? [] : [point.value])
  const first = points[0]
  const last = points.at(-1)
  const active = points.find(point => timeOf(point) === selectedTime && point.value !== null)
    ?? [...points].reverse().find(point => point.value !== null)
  if (!values.length || !active || !first || !last) return <p className="history-empty">{empty}</p>
  const min = values.reduce((total, value) => Decimal.min(total, value), values[0])
  const max = values.reduce((total, value) => Decimal.max(total, value), values[0])
  const spread = max.minus(min)
  const start = timeOf(first)
  const duration = timeOf(last) - start
  const coords = points.map(point => point.value === null ? null : {
    point, x: duration === 0 ? 350 : 24 + 652 * (timeOf(point) - start) / duration,
    y: spread.eq(0) ? 85 : 150 - 128 * point.value.minus(min).div(spread).toNumber(),
  })
  const path = coords.map((item, index) => {
    if (!item) return ''
    const previous = coords[index - 1]
    const contiguous = previous && timeOf(item.point) - timeOf(previous.point) <= (item.point.at === undefined ? 86400000 : 3600000)
    return (contiguous ? 'L' : 'M') + item.x.toFixed(2) + ' ' + item.y.toFixed(2)
  }).join(' ')

  return <>
    <p className="history-readout"><strong>{format(active.value!)}</strong><span>{labelOf(active)}{active.detail ? ' · ' + active.detail : ''}</span></p>
    <svg className="history-chart" viewBox="0 0 700 175" role="group" aria-label={label}>
      {[22, 85, 150].map(y => <line key={y} x1="24" x2="676" y1={y} y2={y} />)}
      <path d={path} />
      {coords.map(item => item && <circle key={timeOf(item.point)} cx={item.x} cy={item.y} r={active === item.point ? 5 : 3}
        tabIndex={active === item.point ? 0 : -1} onFocus={() => setSelectedTime(timeOf(item.point))}
        onPointerEnter={() => setSelectedTime(timeOf(item.point))} onClick={() => setSelectedTime(timeOf(item.point))}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          const circles = [...event.currentTarget.ownerSVGElement!.querySelectorAll('circle')]
          const next = circles[circles.indexOf(event.currentTarget) + (event.key === 'ArrowLeft' ? -1 : 1)]
          next?.focus()
        }} aria-label={labelOf(item.point) + ' · ' + format(item.point.value!)}>
        <title>{labelOf(item.point) + ' · ' + format(item.point.value!)}</title></circle>)}
    </svg>
    <div className="history-axis"><span>{labelOf(first)}</span><span>{first !== last && labelOf(last)}</span></div>
    {values.length === 1 && <p className="hint">La courbe se dessinera à partir de deux relevés valorisés.</p>}
  </>
}
