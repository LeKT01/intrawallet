import { useRef, useState, type ChangeEvent } from 'react'
import { backupText, readBackup, type PortfolioBackup } from './backup'
import { loadPortfolioBackup, restorePortfolio } from './database'
import { useModal } from './PositionForm'
import { demoLink, demoMode } from './demo'
import type { QuoteKeys } from './quotes'

export function ConfirmDialog({ title, description, confirm, busy, onClose, onConfirm, danger = false }: {
  title: string
  description: string
  confirm: string
  busy: boolean
  onClose: () => void
  onConfirm: () => void
  danger?: boolean
}) {
  const { dialog, close } = useModal(onClose)
  return <dialog ref={dialog} className="delete-dialog" aria-labelledby="confirm-title" onCancel={event => {
    event.preventDefault()
    if (!busy) close()
  }}>
    <h2 id="confirm-title">{title}</h2><p>{description}</p>
    <div className="dialog-actions">
      <button className="secondary" onClick={close} disabled={busy} autoFocus>Annuler</button>
      <button className={danger ? 'primary danger-button' : 'primary'} onClick={onConfirm} disabled={busy}>{confirm}</button>
    </div>
  </dialog>
}

export default function DataSettings({ quoteKey, onKey, onRefresh, refreshing, refreshStatus, lastChecked, onRestored }: {
  quoteKey: QuoteKeys
  onKey: (key: QuoteKeys) => void
  onRefresh: () => void
  refreshing: boolean
  refreshStatus: string
  lastChecked: number | null
  onRestored: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [keyDraft, setKeyDraft] = useState(quoteKey)
  const [pending, setPending] = useState<PortfolioBackup | null>(null)

  async function run(action: () => Promise<void>) {
    if (busy.current) return
    busy.current = true
    setWorking(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'L’opération a échoué.')
    } finally {
      busy.current = false
      setWorking(false)
    }
  }

  function exportData() {
    void run(async () => {
      const data = await loadPortfolioBackup()
      const url = URL.createObjectURL(new Blob([backupText(data)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'portefeuille-' + new Date().toISOString().slice(0, 10) + '.json'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('Sauvegarde exportée.')
    })
  }

  function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void run(async () => {
      if (file.size > 20 * 1024 * 1024) throw new Error('Le fichier dépasse la limite de 20 Mo.')
      setPending(readBackup(await file.text()))
    })
  }

  if (demoMode) return <section className="panel settings-panel">
    <h2 id="backup" tabIndex={-1}>Données de démonstration</h2>
    <p className="hint">Les cours et taux de change sont simulés. Tes essais sont enregistrés dans ce portefeuille de démonstration.</p>
    <a className="secondary" href={demoLink(false)}>Revenir aux données de mon portefeuille</a>
  </section>

  return <div className="settings-grid">
    <section className="panel settings-panel"><h2>Cotations automatiques</h2>
      <p className="hint">Les ETF pris en charge sur SIX Swiss Exchange récupèrent leur clôture sans clé lorsque l’application tourne en local. EODHD étend la couverture aux autres places et à l’historique. CoinGecko fournit les cours des cryptos du catalogue.</p>
      <form className="market-settings" onSubmit={event => {
        event.preventDefault()
        onKey({ eodhd: keyDraft.eodhd.trim(), finnhub: keyDraft.finnhub.trim(), coingecko: keyDraft.coingecko.trim() })
      }}>
        <label className="cost-input">Clé EODHD
          <input type="password" value={keyDraft.eodhd} maxLength={128} autoComplete="off" spellCheck={false}
            placeholder="Clé personnelle EODHD" onChange={event => setKeyDraft({ ...keyDraft, eodhd: event.target.value })} />
        </label>
        <p className="hint"><a href="https://eodhd.com/pricing" target="_blank" rel="noreferrer">Offre gratuite EODHD</a> · 20 appels par jour, jusqu’à un an de clôtures pour les titres couverts.</p>
        <label className="cost-input">Clé Finnhub <small>facultative</small>
          <input type="password" value={keyDraft.finnhub} maxLength={128} autoComplete="off" spellCheck={false}
            placeholder="Clé personnelle Finnhub" onChange={event => setKeyDraft({ ...keyDraft, finnhub: event.target.value })} />
        </label>
        <p className="hint">Finnhub complète les clôtures avec le dernier cours reçu sur les titres américains compatibles.</p>
        <label className="cost-input">Clé CoinGecko Demo <small>facultative</small>
          <input type="password" value={keyDraft.coingecko} maxLength={128} autoComplete="off" spellCheck={false}
            placeholder="À renseigner si CoinGecko demande une clé" onChange={event => setKeyDraft({ ...keyDraft, coingecko: event.target.value })} />
        </label>
        <button type="submit" className="secondary" disabled={keyDraft.coingecko.trim() === quoteKey.coingecko
          && keyDraft.eodhd.trim() === quoteKey.eodhd
          && keyDraft.finnhub.trim() === quoteKey.finnhub}>Appliquer les clés</button>
        <p className="hint">Les clés restent dans la session du navigateur et sont envoyées à leurs fournisseurs respectifs. Elles sont accessibles depuis ton navigateur. Efface un champ et applique pour retirer sa clé.</p>
      </form>
      <button className="secondary" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Actualisation…' : 'Actualiser les cours'}</button>
      <p className="hint">Crypto environ chaque minute (5 min avec une clé Demo pour limiter sa consommation), Finnhub environ toutes les 3 minutes en séance, EODHD après les clôtures selon disponibilité et quota. La vérification reprend au retour dans l’application.</p>
      {lastChecked !== null && <p className="hint">Dernière vérification · {new Date(lastChecked).toLocaleString('fr-CH')}</p>}
      {refreshStatus && <p className="hint" role="status">{refreshStatus}</p>}
    </section>
    <section className="panel settings-panel"><h2 id="backup" tabIndex={-1}>Sauvegarde locale</h2>
      <p className="hint">Le fichier contient les positions, les opérations, les plateformes et les historiques de cours enregistrés. Conserve-le dans un endroit sûr.</p>
      <div className="settings-actions">
        <button className="primary" onClick={exportData} disabled={working}>Exporter la sauvegarde</button>
        <button className="secondary" onClick={() => fileInput.current?.click()} disabled={working}>Importer un fichier</button>
        <input ref={fileInput} type="file" accept=".json,application/json" onChange={importData} hidden />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="hint" role="status">{message}</p>}
    </section>
    <section className="panel settings-panel"><h2>Portefeuille de démonstration</h2>
      <p className="hint">Découvre les courbes et le journal avec 30 jours de données fictives.</p>
      <a className="secondary" href={demoLink(true)}>Ouvrir la démo</a>
    </section>
    {pending && <ConfirmDialog title="Restaurer cette sauvegarde ?"
      description={`Le portefeuille actuel sera remplacé par ${pending.positions.length} position(s) de départ, ${pending.operations.length} opération(s) et les plateformes du fichier. Les groupes actuels seront remplacés par les ${pending.groups?.length ?? 0} groupe(s) de la sauvegarde.${pending.dailyPrices === undefined ? ' Ce fichier ancien ne contient pas d’historiques téléchargés. Le cache de cotations actuel sera vidé.' : ''}`}
      confirm="Restaurer le fichier" busy={working} onClose={() => setPending(null)} onConfirm={() => {
        void run(async () => {
          try {
            await restorePortfolio(pending)
            onRestored()
            setMessage('Sauvegarde restaurée.')
          } finally {
            setPending(null)
          }
        })
      }} />}
  </div>
}
