import { useEffect, useId, useState } from 'react'
import { Decimal } from 'decimal.js'
import type { CurrencyDisplay } from './currency'
import type { Mark } from './ledger'
import { dayKey, daysBefore } from './currency'
import { unitPrice } from './portfolio'
import { demoMode } from './demo'
import { catalogEntry } from './catalog'
import { fetchIntradayPrices, type QuoteAsset } from './quotes'
import DailyChart, { formatDay, inPeriod, PeriodButtons } from './DailyChart'

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
  const series = [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, mark]) => ({
    date, value: mark.price === null ? null : display.convert(mark.price, date), detail: mark.source,
  }))
  const recent = new Map([...intraday, ...marks].filter(mark => mark.sourceAt >= Date.now() - 86400000)
    .sort((a, b) => a.sourceAt - b.sourceAt || a.at - b.at).map(mark => [mark.sourceAt, mark]))
  const points = range === 1 ? [...recent].map(([at, mark]) => ({
    at, date: dayKey(at), value: mark.price === null ? null : display.convert(mark.price, dayKey(at)), detail: mark.source,
  })) : inPeriod(series, range)
  const first = points.find(point => point.value !== null)?.value
  const last = [...points].reverse().find(point => point.value !== null)?.value
  const change = first?.gt(0) && last !== undefined && last !== null && points.filter(point => point.value !== null).length > 1
    ? last.div(first).minus(1) : null
  let previous: Decimal | null = null
  const rows = points.map(point => {
    const dailyChange = point.value !== null && previous?.gt(0) ? point.value.div(previous).minus(1) : null
    if (point.value !== null) previous = point.value
    return { ...point, dailyChange }
  })
  const today = dayKey(Date.now())
  const latest = rows.at(-1)
  const yesterday = rows.at(-2)
  const todayChange = latest?.date === today && yesterday?.date === daysBefore(today, 1) && yesterday.value !== null
    ? latest.dailyChange : null
  return <section className="asset-history" aria-labelledby={id}>
    <div className="section-heading"><div><h3 id={id}>Cours de {name}</h3>
      <p className="hint">{range === 1 ? 'Cours horodatés disponibles sur 24 heures.' : demoMode ? 'Cours fictifs par jour.' : official ? 'Prix de marché par jour. Le dernier point peut être la cotation du jour.' : 'Cours et prix d’opération enregistrés dans l’app.'}</p></div>
      <PeriodButtons range={range} choose={setRange} />
    </div>
    <DailyChart points={points} label={'Courbe du cours de ' + name + ' en ' + display.currency}
      format={value => unitPrice(value, display.currency)} empty={series.length && !points.length ? 'Aucun cours sur cette période.'
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
