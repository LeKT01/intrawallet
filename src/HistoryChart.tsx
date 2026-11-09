import { useId, useState } from 'react'
import type { HistoryPoint } from './ledger'
import { daysBefore, type CurrencyDisplay } from './currency'
import { money } from './portfolio'
import DailyChart, { formatDay, inPeriod, PeriodButtons } from './DailyChart'

export default function HistoryChart({ history, intraday, display }: { history: HistoryPoint[]; intraday: HistoryPoint[]; display: CurrencyDisplay }) {
  const id = useId()
  const [range, setRange] = useState(Infinity)
  const [metric, setMetric] = useState<'value' | 'result'>('value')
  const recent = history.at(-1)
  const points = range === 1 ? intraday.filter(point => point.at >= Date.now() - 86400000) : inPeriod(history, range)
  const result = recent?.result ?? null
  const flow = recent?.netFlows ?? null
  const graph = points.map(point => ({
    date: point.date,
    at: range === 1 ? point.at : undefined,
    value: point[metric] === null ? null : display.convert(point[metric], point.date),
    detail: point.reconstructed ? 'Estimation sur cours historiques'
      : point.usedOlderPrices ? 'Relevé avec cours antérieurs' : undefined,
  }))

  const daily = new Map(history.map((point, index) => {
    const previous = history[index - 1]
    const change = point.result !== null && previous?.result != null && previous.date === daysBefore(point.date, 1)
      ? point.result.minus(previous.result) : null
    return [point.date, change]
  }))

  return <section className="panel history-panel" aria-labelledby={id}>
    <div className="section-heading">
      <div><h2 id={id}>Évolution du portefeuille</h2><p className="hint">{range === 1 ? 'Relevés horodatés enregistrés dans les dernières 24 heures.' : 'Relevés quotidiens et estimations lorsque les cours nécessaires sont disponibles.'}</p></div>
      <PeriodButtons range={range} choose={setRange} />
    </div>
    <div className="segments history-toggle" role="group" aria-label="Indicateur">
      <button type="button" className="secondary segment-button" aria-pressed={metric === 'value'} onClick={() => setMetric('value')}>Valeur</button>
      <button type="button" className="secondary segment-button" aria-pressed={metric === 'result'} onClick={() => setMetric('result')}>Performance</button>
    </div>
    <DailyChart points={graph} label={(metric === 'value' ? 'Courbe de valeur en ' : 'Courbe de performance en ') + display.currency}
      format={value => (metric === 'result' && value.gt(0) ? '+' : '') + money(value, 2, display.currency)}
      empty={range === 1 ? 'Aucun relevé complet dans les dernières 24 heures.' : metric === 'value' ? 'La courbe apparaîtra avec une valorisation complète et un taux disponible.'
        : 'Le calcul nécessite une valorisation complète et des montants investis connus.'} />
    <div className="history-stats">
      <span>Flux nets suivis <strong>{flow === null ? '—' : display.format(flow, { day: recent?.date, signed: true })}</strong></span>
      <span>Résultat depuis le début du suivi <strong>{result === null ? '—' : display.format(result, { day: recent?.date, signed: true })}</strong></span>
    </div>
    {display.currency !== 'CHF' && <p className="hint">Le résultat en CHF est converti au taux de référence du jour affiché.</p>}
    {range !== 1 && graph.some((point, index) => point.value === null
      || (index > 0 && graph[index - 1].date !== daysBefore(point.date, 1))) && <p className="hint">Les jours aux données incomplètes sont laissés vides.</p>}
    {range !== 1 && points.length > 0 && <details className="daily-table"><summary>Voir les chiffres par jour</summary>
      <div className="daily-table-scroll"><table>
        <thead><tr><th>Date</th><th>Valeur</th><th>Résultat du jour</th><th>Résultat cumulé</th><th>Source</th></tr></thead>
        <tbody>{[...points].reverse().map(point => {
          const change = daily.get(point.date)
          return <tr key={point.date}><td>{formatDay(point.date)}</td>
            <td>{point.value === null ? '—' : display.format(point.value, { day: point.date })}</td>
            <td>{change == null ? '—' : display.format(change, { day: point.date, signed: true })}</td>
            <td>{point.result === null ? '—' : display.format(point.result, { day: point.date, signed: true })}</td>
            <td>{point.reconstructed ? 'Estimé' : point.usedOlderPrices ? 'Cours antérieurs inclus' : 'Relevé'}</td></tr>
        })}</tbody>
      </table></div></details>}
  </section>
}
