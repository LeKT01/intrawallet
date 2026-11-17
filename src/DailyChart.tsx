import { useId, useState, type PointerEvent } from 'react'
import { Decimal } from 'decimal.js'
import { dayKey, daysBefore } from './currency'
import { missingWeekendIntervals } from './marketCalendar'
import { useSlidingIndicator } from './motion'

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

export function PeriodButtons({ range, choose, minimumDays = 1 }: { range: number; choose: (days: number) => void; minimumDays?: number }) {
  const choices = periods.filter(period => period.days >= minimumDays)
  const indicator = useSlidingIndicator<HTMLDivElement>(String(range))
  return <><div className="segments period-segments motion-segments sliding-nav" ref={indicator} role="group" aria-label="Période">
    {choices.map(period => <button type="button" key={period.label} className="secondary segment-button"
      aria-pressed={range === period.days} onClick={() => choose(period.days)}>{period.label}</button>)}
  </div><label className="period-select"><span>Période</span>
    <select value={String(range)} onChange={event => choose(Number(event.target.value))}>
      {choices.map(period => <option key={period.days} value={String(period.days)}>{period.label}</option>)}
    </select>
  </label></>
}

export default function DailyChart({ points, label, format, empty, showClosedMarkets = false }: {
  points: ChartPoint[]
  label: string
  format: (value: Decimal) => string
  empty: string
  showClosedMarkets?: boolean
}) {
  const fillId = useId()
  const [selectedTime, setSelectedTime] = useState<number>()
  const values = points.flatMap(point => point.value === null ? [] : [point.value])
  const first = points[0]
  const last = points.at(-1)
  const active = points.find(point => timeOf(point) === selectedTime && point.value !== null)
    ?? [...points].reverse().find(point => point.value !== null)
  if (!values.length || !active || !first || !last) return <p className="history-empty">{empty}</p>
  if (values.length === 1) return <div className="history-empty single-reading">
    <strong>{format(active.value!)}</strong>
    <span>{labelOf(active)}{active.detail ? ' · ' + active.detail : ''}</span>
    <p>L’historique se construit. Un seul relevé est disponible sur cette période.</p>
  </div>
  const min = values.reduce((total, value) => Decimal.min(total, value), values[0])
  const max = values.reduce((total, value) => Decimal.max(total, value), values[0])
  const spread = max.minus(min)
  const start = timeOf(first)
  const duration = timeOf(last) - start
  const coords = points.map(point => point.value === null ? null : {
    point, x: duration === 0 ? 350 : 24 + 652 * (timeOf(point) - start) / duration,
    y: spread.eq(0) ? 85 : 150 - 128 * point.value.minus(min).div(spread).toNumber(),
  })
  const weekendLines = showClosedMarkets && duration > 0 ? missingWeekendIntervals(points) : []
  const yByDate = new Map(coords.flatMap(item => item ? [[item.point.date, item.y] as const] : []))
  const xAt = (at: number) => 24 + 652 * (at - start) / duration
  const activeCoord = coords.find(item => item?.point === active)
  const segments: NonNullable<typeof coords[number]>[][] = []
  coords.forEach((item, index) => {
    if (!item) return
    const previous = coords[index - 1]
    const contiguous = previous && timeOf(item.point) - timeOf(previous.point) <= (item.point.at === undefined ? 86400000 : 3600000)
    if (!contiguous) segments.push([])
    segments.at(-1)!.push(item)
  })
  const paths = segments.map(segment => {
    const start = segment[0]
    return segment.slice(1).reduce((path, point, index) => {
      const previous = segment[index]
      const middle = ((previous.x + point.x) / 2).toFixed(2)
      return path + ' C' + middle + ' ' + previous.y.toFixed(2) + ' ' + middle + ' ' + point.y.toFixed(2)
        + ' ' + point.x.toFixed(2) + ' ' + point.y.toFixed(2)
    }, 'M' + start.x.toFixed(2) + ' ' + start.y.toFixed(2))
  })

  function selectNearest(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width) return
    const pointer = (event.clientX - bounds.left) * 700 / bounds.width
    const nearest = coords.reduce<typeof coords[number]>((best, item) =>
      item && (!best || Math.abs(pointer - item.x) < Math.abs(pointer - best.x)) ? item : best, null)
    if (nearest) setSelectedTime(timeOf(nearest.point))
  }

  return <>
    <div className="chart-plot chart-enter">
    <p className="history-readout"><strong>{format(active.value!)}</strong><span className="chart-readout-context"><span>{labelOf(active)}</span>{active.detail && <small>{active.detail}</small>}</span></p>
    <div className="chart-scale" aria-hidden="true">
      <span>{format(max)}</span><span>{format(min.plus(spread.div(2)))}</span><span>{format(min)}</span>
    </div>
    <svg className={values.length <= 3 ? 'history-chart compact-chart' : 'history-chart'} viewBox="0 0 700 175" preserveAspectRatio="none" role="group" aria-label={label}
      onPointerDown={selectNearest} onPointerMove={selectNearest}>
      <defs><linearGradient id={fillId} x2="0" y2="100%"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".22" />
        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      {[22, 85, 150].map(y => <line key={y} x1="24" x2="676" y1={y} y2={y} />)}
      {segments.map((segment, index) => {
        if (segment.length < 2) return null
        const area = paths[index] + ' L' + segment.at(-1)!.x + ' 150 L' + segment[0].x + ' 150 Z'
        return <path className="chart-area" key={segment[0].x} d={area} style={{ fill: 'url(#' + fillId + ')' }} />
      })}
      <path d={paths.join(' ')} className="chart-glow" aria-hidden="true" />
      <path d={paths.join(' ')} className="chart-line" />
      {weekendLines.map(line => {
        const y = yByDate.get(line.reference)!
        const endX = xAt(line.end)
        const resumed = yByDate.get(new Date(line.end).toISOString().slice(0, 10))
        const path = `M${xAt(line.start)} ${y} H${endX}` + (resumed === undefined ? '' : ` V${resumed}`)
        return <path key={line.start} className="chart-crosshair" d={path} fill="none">
          <title>Marchés actions et ETF fermés · dernier relevé du {formatDay(line.reference)}</title>
        </path>
      })}
      {activeCoord && <line className="chart-crosshair" x1={activeCoord.x}
        x2={activeCoord.x} y1="22" y2="150" />}
      {coords.map(item => item && <circle key={timeOf(item.point)} cx={item.x} cy={item.y} r={active === item.point ? 5 : 3} className={active === item.point ? 'active-point' : 'chart-point'}
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
    </svg></div>
    <div className="history-axis"><span>{labelOf(first)}</span><span>{first !== last && labelOf(last)}</span></div>
    {weekendLines.length > 0 && <p className="hint">Marchés actions et ETF fermés le week-end. Le palier en pointillés indique le dernier relevé connu jusqu’à la reprise.</p>}
  </>
}
