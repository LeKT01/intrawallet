import { useSlidingIndicator } from './motion'
import { useId, useState } from 'react'
import type { HistoryPoint } from './ledger'
import { dayKey, daysBefore, type CurrencyDisplay } from './currency'
import { money } from './portfolio'
import DailyChart, { formatDay, inPeriod, PeriodButtons } from './DailyChart'

export function portfolioPeriod(history: HistoryPoint[], intraday: HistoryPoint[], range: number) {
  const points = range === 1 ? intraday.filter(point => point.at >= Date.now() - 86400000) : inPeriod(history, range)
  const comparable = points.filter(point => point.result !== null)
  const first = comparable[0]
  const last = comparable.at(-1)
  const change = first && last && first !== last ? last.result!.minus(first.result!) : null
  return { points, first, last, change }
}

export default function HistoryChart({ history, selection, display, range, chooseRange, individualOnly }: {
  individualOnly?: boolean
  history: HistoryPoint[]; selection: ReturnType<typeof portfolioPeriod>
  display: CurrencyDisplay; range: number; chooseRange: (range: number) => void
}) {
  const id = useId()
  const [metric, setMetric] = useState<'value' | 'result'>('value')
  const indicator = useSlidingIndicator<HTMLDivElement>(metric)
  const recent = history.at(-1)
  const { points, first, last } = selection
  const result = recent?.result ?? null
  const flow = recent?.netFlows ?? null
  const useClosedSnapshot = range === 1 && !points.some(point => point[metric] !== null)
    && recent?.closedMarketCarry && recent.date === dayKey(Date.now())
  const graph = (useClosedSnapshot ? [recent] : points).map(point => ({
    date: point.date,
    at: range === 1 && !useClosedSnapshot ? point.at : undefined,
    value: point[metric] === null ? null : display.convert(point[metric], point.date),
    detail: point.closedMarketCarry ? 'Marchés fermés · dernières clôtures' : point.usesNonMarketPrices ? 'Prix déclarés ou d’opération inclus' : point.reconstructed ? 'Estimation sur cours historiques'
      : point.usedOlderPrices ? 'Relevé avec cours antérieurs' : undefined,
  }))

  const daily = new Map(history.map((point, index) => {
    const previous = history[index - 1]
    const change = point.result !== null && previous?.result != null && previous.date === daysBefore(point.date, 1)
      ? point.result.minus(previous.result) : null
    return [point.date, change]
  }))

  return <section className="panel history-panel" data-reveal aria-labelledby={id}>
    <h2 id={id}>{individualOnly ? 'Évolution des positions individuelles' : 'Évolution du portefeuille'}</h2>
    <p className="history-caption">{metric === 'value' ? 'Valeur suivie au fil du temps' : 'Résultat cumulé hors flux d’investissement'}</p>
    {individualOnly && <p className="hint history-scope">Les portefeuilles groupés sont exclus de ce graphique.</p>}
    <div className="history-toolbar">
      <PeriodButtons range={range} choose={chooseRange} />
      <div className="segments history-toggle motion-segments sliding-nav" ref={indicator} role="group" aria-label="Indicateur">
        <button type="button" className="secondary segment-button" aria-pressed={metric === 'value'} onClick={() => setMetric('value')}>Valeur</button>
        <button type="button" className="secondary segment-button" aria-pressed={metric === 'result'} onClick={() => setMetric('result')}>Résultat cumulé</button>
      </div>
    </div>
    {(!first || !last || first === last) && <p className="hint history-coverage">Deux relevés comparables sont nécessaires pour mesurer le résultat sur la période.</p>}
    <DailyChart key={range + '/' + metric} points={graph} label={(metric === 'value' ? 'Courbe de valeur en ' : 'Courbe du résultat cumulé en ') + display.currency}
      format={value => (metric === 'result' && value.gt(0) ? '+' : '') + money(value, 2, display.currency)}
      empty={range === 1 ? 'Aucun relevé complet dans les dernières 24 heures.' : metric === 'value' ? 'La courbe apparaîtra avec une valorisation complète et un taux disponible.'
        : 'Le calcul nécessite une valorisation complète et des montants investis connus.'} />
    <details className="history-details"><summary>Détails du calcul</summary>
    <p className="hint">{range === 1 ? 'Relevés horodatés des dernières 24 heures.' : 'Relevés quotidiens et estimations selon les cours disponibles.'}
      {' '}Le résultat est calculé hors flux d’achat, de vente et d’ouverture.
      {first && last && first !== last && range !== 1 && ' Période mesurée du ' + formatDay(first.date) + ' au ' + formatDay(last.date) + '.'}</p>
    <div className="history-stats">
      <span>Flux nets suivis <strong>{flow === null ? '—' : display.format(flow, { day: recent?.date, signed: true })}</strong></span>
      <span>Résultat depuis le début du suivi <strong>{result === null ? '—' : display.format(result, { day: recent?.date, signed: true })}</strong></span>
    </div>
    {display.currency !== 'CHF' && <p className="hint">Le résultat en CHF est converti au taux de référence du jour affiché.</p>}
    {range !== 1 && graph.some((point, index) => point.value === null
      || (index > 0 && graph[index - 1].date !== daysBefore(point.date, 1))) && <p className="hint">Les jours aux données incomplètes sont laissés vides.</p>}
    {points.some(point => point.usesNonMarketPrices) && <p className="hint">Certains relevés historiques utilisent des prix déclarés ou d’opération. Les cours de marché sont prioritaires pour la valorisation actuelle.</p>}
    </details>
    {range !== 1 && points.length > 0 && <details className="daily-table"><summary>Voir les chiffres par jour</summary>
      <div className="daily-table-scroll"><table>
        <thead><tr><th>Date</th><th>Valeur</th><th>Résultat du jour</th><th>Résultat cumulé</th><th>Source</th></tr></thead>
        <tbody>{[...points].reverse().map(point => {
          const change = daily.get(point.date)
          return <tr key={point.date}><td>{formatDay(point.date)}</td>
            <td>{point.value === null ? '—' : display.format(point.value, { day: point.date })}</td>
            <td>{change == null ? '—' : display.format(change, { day: point.date, signed: true })}</td>
            <td>{point.result === null ? '—' : display.format(point.result, { day: point.date, signed: true })}</td>
            <td>{point.closedMarketCarry ? 'Marchés fermés · dernières clôtures' : point.usesNonMarketPrices ? 'Prix déclarés ou d’opération' : point.reconstructed ? 'Estimé' : point.usedOlderPrices ? 'Cours antérieurs inclus' : 'Relevé'}</td></tr>
        })}</tbody>
      </table></div></details>}
  </section>
}
