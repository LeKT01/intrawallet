import { useRef, useState, type ChangeEvent } from 'react'
import { backupText, readBackup } from './backup'
import { loadPortfolio, restorePortfolio } from './database'
import type { PortfolioData } from './ledger'
import { useModal } from './PositionForm'

export function ConfirmDialog({ title, description, confirm, busy, onClose, onConfirm, danger = false }: {
  title: string
  description: string
  confirm: string
  busy: boolean
  onClose: () => void
  onConfirm: () => void
  danger?: boolean
}) {
  const dialog = useModal()
  return <dialog ref={dialog} className="delete-dialog" aria-labelledby="confirm-title" onCancel={event => {
    event.preventDefault()
    if (!busy) onClose()
  }}>
    <h2 id="confirm-title">{title}</h2><p>{description}</p>
    <div className="dialog-actions">
      <button className="secondary" onClick={onClose} disabled={busy} autoFocus>Annuler</button>
      <button className={danger ? 'primary danger-button' : 'primary'} onClick={onConfirm} disabled={busy}>{confirm}</button>
    </div>
  </dialog>
}

export default function DataSettings({ quoteKey, onKey, onRefresh, refreshing, refreshStatus, lastChecked, onRestored }: {
  quoteKey: string
  onKey: (key: string) => void
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
  const [pending, setPending] = useState<PortfolioData | null>(null)

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
      const data = await loadPortfolio()
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

  return <div className="settings-grid">
    <section className="panel settings-panel"><h2>Cotations automatiques</h2>
      <p className="hint">Les cryptos du catalogue utilisent CoinGecko. Pour les titres cotés aux États-Unis, tu peux utiliser une clé gratuite Finnhub.</p>
      <form onSubmit={event => { event.preventDefault(); onKey(keyDraft) }}>
        <label className="cost-input">Clé Finnhub <small>facultative</small>
          <input type="password" value={keyDraft} maxLength={128} autoComplete="off" spellCheck={false}
            placeholder="Clé de cotation, si tu en as une" onChange={event => setKeyDraft(event.target.value)} />
        </label>
        <button type="submit" className="secondary" disabled={keyDraft.trim() === quoteKey}>Appliquer la clé</button>
        <p className="hint">{quoteKey ? 'Clé active. Efface le champ et applique pour la retirer.' : 'Aucune clé active.'}
          {' '}Elle est conservée dans cet onglet après rechargement.</p>
      </form>
      <p className="hint">Pour les ETF suisses ou européens, ouvre l’actif et saisis son prix unitaire en CHF.</p>
      <button className="secondary" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Actualisation…' : 'Actualiser les cours'}</button>
      <p className="hint">Vérification à l’ouverture et au rechargement, puis environ toutes les 15 minutes pendant la consultation.</p>
      {lastChecked !== null && <p className="hint">Dernière vérification · {new Date(lastChecked).toLocaleString('fr-CH')}</p>}
      {refreshStatus && <p className="hint" role="status">{refreshStatus}</p>}
    </section>
    <section className="panel settings-panel"><h2>Sauvegarde locale</h2>
      <p className="hint">Le fichier contient les positions, les opérations et les cours enregistrés. Conserve-le dans un endroit sûr.</p>
      <div className="settings-actions">
        <button className="primary" onClick={exportData} disabled={working}>Exporter la sauvegarde</button>
        <button className="secondary" onClick={() => fileInput.current?.click()} disabled={working}>Importer un fichier</button>
        <input ref={fileInput} type="file" accept=".json,application/json" onChange={importData} hidden />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="hint" role="status">{message}</p>}
    </section>
    {pending && <ConfirmDialog title="Restaurer cette sauvegarde ?"
      description={`Le portefeuille actuel sera remplacé par ${pending.positions.length} position(s) de départ et ${pending.operations.length} opération(s) du fichier.`}
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
