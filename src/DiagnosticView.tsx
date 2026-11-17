import { useRef, useState } from 'react'
import { loadPortfolioBackup, probeLocalStorage } from './database'
import { dayKey, daysBefore } from './currency'
import { demoMode } from './demo'
import { checkFinancialCalculations, checkLabels, checkPortfolioBackup, safeProviderError, type Check, type CheckStatus } from './diagnostics'
import { latestClosingDay, marketOpen } from './marketCalendar'
import { diagnosticProviders, fetchFxRates, probeQuoteProvider, providerIsConfigured, quoteIsStale, referenceRate, type DiagnosticProvider, type QuoteKeys } from './quotes'
import { Icon, PanelHeading, timestamp } from './ui'

const lastSuccess = new Map<DiagnosticProvider, number>()
const sessions: Partial<Record<DiagnosticProvider, string>> = { EODHD: 'US', Finnhub: 'US', SIX: 'SW', Xetra: 'XETRA', Tradegate: 'TGAT' }
const statusOrder: CheckStatus[] = ['ok', 'warning', 'failed', 'skipped']

function age(at: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - at) / 60000))
  if (minutes < 60) return minutes + ' min'
  if (minutes < 1440) return Math.floor(minutes / 60) + ' h'
  return Math.floor(minutes / 1440) + ' j'
}

export default function DiagnosticView({ quoteKeys }: { quoteKeys: QuoteKeys }) {
  const [checks, setChecks] = useState<Check[]>([])
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')
  const [reportVisible, setReportVisible] = useState(false)
  const pending = useRef(false)

  async function run() {
    if (pending.current) return
    pending.current = true
    setChecks([])
    setMessage('')
    setReportVisible(false)
    setRunning(true)
    try {
      const storage: Check = await probeLocalStorage().then(
        () => ({ name: 'Stockage local', status: 'ok', detail: 'Écriture, lecture et retrait de la donnée de test dans une même transaction.' }),
        () => ({ name: 'Stockage local', status: 'failed', detail: 'Ouverture ou écriture IndexedDB impossible. Vérifie les droits de stockage et les éventuelles erreurs de migration.' }),
      )
      const data = await loadPortfolioBackup().catch(() => null)
      let structure: Check = { name: 'Données et sauvegarde', status: 'skipped', detail: 'Les données locales ne sont pas lisibles.' }
      if (data) {
        try {
          checkPortfolioBackup(data)
          structure = { ...structure, status: 'ok', detail: 'Les positions, plateformes, opérations et cours enregistrés passent la validation de sauvegarde et la relecture du journal.' }
        } catch {
          structure = { ...structure, status: 'failed', detail: 'Une structure de sauvegarde ou une opération est incohérente. Les données n’ont pas été modifiées.' }
        }
      }
      let calculations: Check[]
      try { calculations = checkFinancialCalculations() }
      catch { calculations = [{ name: 'Calculs financiers', status: 'failed', detail: 'Un scénario de test a déclenché une erreur de calcul.' }] }
      const local = [storage, structure, ...calculations]
      setChecks(local)

      const providerChecks = diagnosticProviders.map(async (name): Promise<Check> => {
        if (demoMode || !providerIsConfigured(name, quoteKeys)) {
          return { name, status: 'skipped', detail: demoMode ? 'Les appels externes sont désactivés en mode démo.' : 'Aucune clé configurée.' }
        }
        const now = Date.now()
        const start = performance.now()
        const venue = sessions[name]
        const closed = venue && marketOpen(venue, now) === false ? ' · Marché fermé (calendrier local)' : ''
        const cached = data?.marks.filter(mark => mark.kind === 'market' && mark.source.startsWith(name) && mark.source !== 'Tradegate · relevé' && mark.price !== null)
          .reduce<number | undefined>((latest, mark) => Math.max(latest ?? 0, mark.sourceAt), undefined)
        const previous = lastSuccess.get(name)
        const context = (successful?: number) => ' · ' + Math.round(performance.now() - start) + ' ms' + closed
          + (successful ? ' · Dernier contrôle avec réponse à ' + timestamp.format(successful) : '')
          + (cached ? ' · Dernier cours enregistré ' + timestamp.format(cached) + ' (' + age(cached) + ') · en cache' : '')
        try {
          const sourceAt = await probeQuoteProvider(name, quoteKeys)
          lastSuccess.set(name, Date.now())
          if (sourceAt === 'undated') return { name, status: 'warning', detail: 'Source accessible · dernier prix fourni sans heure de transaction' + context(lastSuccess.get(name)) }
          if (!sourceAt) return { name, status: 'warning', detail: 'Source accessible · aucune cotation exploitable pour l’instrument de test' + context(lastSuccess.get(name)) }
          const stale = (name === 'SIX' || name === 'EODHD') && venue
            ? dayKey(sourceAt) < latestClosingDay(venue, now)
            : quoteIsStale({ source: name, sourceAt } as Parameters<typeof quoteIsStale>[0], now)
          const time = name === 'Tradegate' ? 'Transaction du ' : 'Cotation témoin du '
          return { name, status: stale ? 'warning' : 'ok', detail: 'Source accessible · ' + (stale ? 'Cotation périmée · ' : '')
            + time + timestamp.format(sourceAt) + ' (' + age(sourceAt) + ')' + context(lastSuccess.get(name)) }
        } catch (error) {
          const issue = safeProviderError(error)
          return { name, ...issue, detail: issue.detail + context(previous) }
        }
      })
      const fxCheck = (async (): Promise<Check> => {
        const name = 'Devises · CHF, EUR, USD'
        if (demoMode) return { name, status: 'skipped', detail: 'Taux en ligne désactivés en mode démo. Le calcul local est vérifié séparément.' }
        try {
          const day = dayKey(Date.now())
          const rates = await fetchFxRates(daysBefore(day, 7), day, true)
          const dates = ['CHF', 'EUR', 'USD'].map(code => ({ code, date: referenceRate(rates, code, day)?.date }))
          const available = dates.filter(rate => rate.date)
          return { name, status: available.length === dates.length ? 'ok' : 'warning',
            detail: dates.map(rate => rate.code + ' · ' + (rate.date ?? 'taux indisponible')).join(' / ') }
        } catch (error) {
          return { name, ...safeProviderError(error) }
        }
      })()
      setChecks([...local, ...await Promise.all([...providerChecks, fxCheck])])
    } finally {
      pending.current = false
      setRunning(false)
    }
  }

  const report = ['IntraWallet · diagnostic', ...checks.map(check => check.name + ' — ' + checkLabels[check.status] + ' — ' + check.detail)].join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(report)
      setMessage('Rapport copié.')
    } catch {
      setReportVisible(true)
      setMessage('Copie le texte du rapport ci-dessous.')
    }
  }

  return <section className="panel diagnostic-panel" aria-busy={running}>
    <PanelHeading title="Vérifications">
      <button className="primary" type="button" onClick={() => void run()} disabled={running}><Icon name="diagnostic" />
        {running ? 'Vérification en cours…' : 'Lancer les vérifications'}</button>
    </PanelHeading>
    <p className="hint diagnostic-note">Les contrôles réseau interrogent les fournisseurs avec des instruments publics. Le rapport exclut les positions, les montants et les clés.</p>
    {checks.length > 0 && <>
      <div className="diagnostic-summary" aria-label="Résultats">{statusOrder.map(status => <span key={status} className={'check-tag check-' + status}>
        {checks.filter(check => check.status === status).length} · {checkLabels[status]}</span>)}</div>
      <div className="diagnostic-results">{checks.map(check => <details key={check.name}>
        <summary><strong>{check.name}</strong><span className={'check-tag check-' + check.status}>{checkLabels[check.status]}</span></summary>
        <p>{check.detail}</p>
      </details>)}</div>
      <div className="diagnostic-actions">
        <button className="secondary" type="button" onClick={() => void copy()} disabled={running}>Copier le rapport</button>
        <span role="status">{message}</span>
      </div>
      {reportVisible && <label className="diagnostic-actions">Rapport<textarea readOnly value={report} rows={8} /></label>}
    </>}
  </section>
}
