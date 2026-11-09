import { useState } from 'react'
import { Decimal } from 'decimal.js'
import type { HistoryPoint } from './ledger'
import { money, signedMoney } from './portfolio'

const dateLabel = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', timeZone: 'Europe/Zurich' })
const dayMs = 86400000
const periods = [{ label: '1 mois', days: 30 }, { label: '3 mois', days: 90 }, { label: 'Tout', days: Infinity }]
const dayNumber = (date: string) => Date.parse(date + 'T00:00:00Z') / dayMs

export default function HistoryChart({ history }: { history: HistoryPoint[] }) {
  const [range, setRange] = useState(periods[2].days)
  const [metric, setMetric] = useState<'value' | 'result'>('value')
  const recent = history.at(-1)
  const firstDay = recent ? dayNumber(recent.date) - range + 1 : -Infinity
  const points = history.filter(point => dayNumber(point.date) >= firstDay)
  const values = points.flatMap(point => point[metric] === null ? [] : [point[metric]])
  const first = points[0]
  const last = points.at(-1)
  const min = values.reduce((current, value) => Decimal.min(current, value), values[0] ?? new Decimal(0))
  const max = values.reduce((current, value) => Decimal.max(current, value), values[0] ?? new Decimal(0))
  const spread = max.minus(min)
  const start = first ? dayNumber(first.date) : 0
  const duration = last ? dayNumber(last.date) - start : 0
  const coords = points.map(point => {
    const value = point[metric]
    if (value === null) return null
    return {
      point, value, x: duration === 0 ? 350 : 24 + 652 * (dayNumber(point.date) - start) / duration,
      y: spread.eq(0) ? 85 : 150 - 128 * value.minus(min).div(spread).toNumber(),
    }
  })
  let path = ''
  coords.forEach((item, index) => {
    if (!item) return
    const previous = coords[index - 1]
    const contiguous = previous && dayNumber(item.point.date) - dayNumber(previous.point.date) <= 1
    path += (contiguous ? 'L' : 'M') + item.x.toFixed(2) + ' ' + item.y.toFixed(2) + ' '
  })
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const active = points.find(point => point.date === activeDay && point[metric] !== null)
    ?? [...points].reverse().find(point => point[metric] !== null)
  const result = recent?.result ?? null
  const flow = recent?.netFlows ?? null

  return <section className="panel history-panel" aria-labelledby="history-title">
    <div className="section-heading">
      <div><h2 id="history-title">Évolution du portefeuille</h2><p className="hint">Une mesure les jours avec une opération ou une valorisation.</p></div>
      <div className="segments" role="group" aria-label="Période">
        {periods.map(period => <button type="button" key={period.label} className="secondary segment-button"
          aria-pressed={range === period.days} onClick={() => { setRange(period.days); setActiveDay(null) }}>{period.label}</button>)}
      </div>
    </div>
    <div className="segments history-toggle" role="group" aria-label="Indicateur">
      <button type="button" className="secondary segment-button" aria-pressed={metric === 'value'} onClick={() => setMetric('value')}>Valeur</button>
      <button type="button" className="secondary segment-button" aria-pressed={metric === 'result'} onClick={() => setMetric('result')}>Performance</button>
    </div>
    {values.length > 0 && active && first && last ? <>
      <p className="history-readout"><strong>{metric === 'value' ? money(active.value!) : signedMoney(active.result!)}</strong><span>{dateLabel.format(active.at)}</span></p>
      <svg className="history-chart" viewBox="0 0 700 175" role="group" aria-label={metric === 'value' ? 'Courbe de valeur en CHF' : 'Courbe de performance en CHF'}>
        {[22, 85, 150].map(y => <line key={y} x1="24" x2="676" y1={y} y2={y} />)}
        <path d={path} />
        {coords.map(item => item && <circle key={item.point.date} cx={item.x} cy={item.y}
          r={active.date === item.point.date ? 5 : 3} tabIndex={0} onFocus={() => setActiveDay(item.point.date)}
          onPointerEnter={() => setActiveDay(item.point.date)} onClick={() => setActiveDay(item.point.date)}
          aria-label={dateLabel.format(item.point.at) + ' · ' + money(item.value)}><title>{dateLabel.format(item.point.at) + ' · ' + money(item.value)}</title></circle>)}
      </svg>
      <div className="history-axis"><span>{dateLabel.format(first.at)}</span><span>{first !== last && dateLabel.format(last.at)}</span></div>
    </> : <p className="history-empty">{metric === 'value' ? 'La courbe apparaîtra quand toutes les positions auront une valeur.'
      : 'Il faut une valorisation complète et des montants investis connus pour calculer la performance.'}</p>}
    <div className="history-stats">
      <span>Flux nets suivis <strong>{flow === null ? '—' : signedMoney(flow)}</strong></span>
      <span>Résultat depuis le début du suivi <strong>{result === null ? '—' : signedMoney(result)}</strong></span>
    </div>
    {points.some(point => point[metric] === null) && values.length > 0 && <p className="hint">Les jours aux données incomplètes sont laissés vides.</p>}
    {values.length === 1 && <p className="hint">La courbe se dessinera avec les prochains jours valorisés.</p>}
  </section>
}
