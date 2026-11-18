import { useEffect, useId, useState } from 'react'
import { Decimal } from 'decimal.js'
import type { CurrencyDisplay } from './currency'
import type { Mark } from './ledger'
import { dayKey, daysBefore } from './currency'
import { closingSessionForClosedDay } from './marketCalendar'
import { unitPrice } from './portfolio'
import { demoMode } from './demo'
import { catalogEntry } from './catalog'
import { fetchIntradayPrices, type QuoteAsset } from './quotes'
import DailyChart, { formatDay, hourlyChartPoints, inPeriod, PeriodButtons, type ChartPoint } from './DailyChart'

const percent = new Intl.NumberFormat('fr-CH', { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' })

export default function AssetHistory({ marks, display, name, official, asset, cryptoKey }: {
  marks: Mark[]; display: CurrencyDisplay; name: string; official: boolean; asset: QuoteAsset; cryptoKey: string
}) {
  const id = useId()
  const [range, setRange] = useState(30)
  const { category, reference, listing, market } = asset
  const [intraday, setIntraday] = useState<Mark[]>([])
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (range !== 1 || demoMode || !catalogEntry(category, reference)?.coinId) return
    let active = true
    setStatus('Chargement de l’historique intrajournalier…')
    void fetchIntradayPrices({ category, reference, listing, market, name }, cryptoKey).then(result => {
      if (!active) return
      setIntraday(result)
      setStatus(result.length ? '' : 'Aucun historique intrajournalier reçu.')
    }).catch(() => { if (active) setStatus('Historique intrajournalier indisponible. Les relevés locaux restent affichés.') })
    return () => { active = false }
  }, [range, category, reference, listing, market, name, cryptoKey])
  const dates = new Map<string, Mark>()
  for (const mark of marks) {
    const day = dayKey(mark.sourceAt)
    const previous = dates.get(day)
    if (!previous || mark.sourceAt > previous.sourceAt || (mark.sourceAt === previous.sourceAt && mark.at > previous.at)) dates.set(day, mark)
  }
  const now = Date.now()
  const today = dayKey(now)
  const venue = market?.code.split('.').at(-1) ?? (listing || catalogEntry(category, reference)?.listing)?.split(':')[0] ?? ''
  const lastSession = category !== 'crypto' && official && !demoMode ? closingSessionForClosedDay(venue, today) : null
  const lastClose = lastSession ? dates.get(lastSession) : undefined
  const recent = new Map([...intraday, ...marks].filter(mark => mark.sourceAt >= now - 86400000 && mark.sourceAt <= now)
    .sort((a, b) => a.sourceAt - b.sourceAt || a.at - b.at).map(mark => [mark.sourceAt, mark]))
  const series = [...dates].sort(([a], [b]) => a.localeCompare(b)).flatMap(([date, mark], index, entries) => {
    const point = { date, value: mark.price === null ? null : display.convert(mark.price, date), detail: mark.source }
    const points = [point]
    if (category === 'crypto' || !official || demoMode || mark.timing !== 'close') return points
    const next = entries[index + 1]?.[0]
    for (let closed = daysBefore(date, -1); closed <= today && (!next || closed < next)
      && closingSessionForClosedDay(venue, closed) === date; closed = daysBefore(closed, -1)) {
      points.push({ date: closed, value: point.value, detail: 'Marché fermé · clôture du ' + formatDay(date) })
    }
    return points
  })
  let points: ChartPoint[]
  if (range === 1) {
    const readings = [...recent].map(([at, mark]) => ({
      at, date: dayKey(at), value: mark.price === null ? null : display.convert(mark.price, dayKey(at)), detail: mark.source,
    }))
    if (!readings.length && lastClose?.timing === 'close' && lastClose.price !== null) {
      readings.push({ at: lastClose.sourceAt, date: lastSession!, value: display.convert(lastClose.price, lastSession!), detail: lastClose.source })
    }
    points = hourlyChartPoints(readings, now, date => category !== 'crypto' && official && !demoMode
      && closingSessionForClosedDay(venue, date) ? 'Marché fermé · dernière clôture disponible' : undefined)
  } else {
    points = inPeriod(series, range)
  }
  const first = points.find(point => point.value !== null)?.value
  const last = [...points].reverse().find(point => point.value !== null)?.value
  const change = (range !== 1 || points.some(point => point.value !== null && !point.carried)) && first?.gt(0) && last !== undefined && last !== null && points.filter(point => point.value !== null).length > 1
    ? last.div(first).minus(1) : null
  let previous: Decimal | null = null
  const rows = points.map(point => {
    const dailyChange = point.value !== null && previous?.gt(0) ? point.value.div(previous).minus(1) : null
    if (point.value !== null) previous = point.value
    return { ...point, dailyChange }
  })
  const latest = rows.at(-1)
  const yesterday = rows.at(-2)
  const todayChange = latest?.date === today && yesterday?.date === daysBefore(today, 1) && yesterday.value !== null
    ? latest.dailyChange : null
  return <section className="asset-history" aria-labelledby={id}>
    <div className="section-heading"><div><h3 id={id}>Cours de {name}</h3>
      <p className="hint">{range === 1 ? lastSession ? 'Marché fermé. La dernière clôture disponible est conservée.' : 'Un point par heure écoulée. Un point creux reprend le dernier cours disponible.' : demoMode ? 'Cours fictifs par jour.' : official ? 'Prix de marché par jour. Le dernier point peut être la cotation du jour.' : 'Cours et prix d’opération enregistrés dans l’app.'}</p></div>
      <PeriodButtons range={range} choose={setRange} />
    </div>
    <DailyChart points={points} label={'Courbe du cours de ' + name + ' en ' + display.currency}
      format={value => unitPrice(value, display.currency)} empty={series.length && points.every(point => point.value === null) ? 'Aucun cours sur cette période.'
        : 'Les points apparaîtront avec les cours disponibles et un taux de change pour la devise choisie.'} />
    {range === 1 && status && <p className="hint" role="status">{status}</p>}
    {range !== 1 && todayChange !== null && <p className="hint">Variation depuis hier <strong>{percent.format(todayChange.toNumber())}</strong></p>}
    {change !== null && <p className="hint">Variation sur les cours disponibles <strong>{percent.format(change.toNumber())}</strong></p>}
    {range !== 1 && rows.length > 0 && <details className="daily-table"><summary>Voir les cours et variations par jour</summary>
      <div className="daily-table-scroll"><table><thead><tr><th>Date</th><th>Cours</th><th>Variation</th></tr></thead>
        <tbody>{[...rows].reverse().map(point => <tr key={point.date}><td>{formatDay(point.date)}</td>
          <td>{point.value === null ? '—' : unitPrice(point.value, display.currency)}</td>
          <td>{point.dailyChange === null ? '—' : percent.format(point.dailyChange.toNumber())}</td></tr>)}</tbody>
      </table></div><p className="hint">Variation par rapport au point disponible précédent.</p>
    </details>}
  </section>
}
