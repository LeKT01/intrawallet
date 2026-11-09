import { useRef, useState, type FormEvent } from 'react'
import { saveMarks } from './database'
import { quoteTarget, type Holding } from './ledger'
import { parseAmount } from './portfolio'
import { newId, useModal } from './PositionForm'

export default function ManualQuoteForm({ asset, onClose, onSave }: {
  asset: Holding
  onClose: () => void
  onSave: () => void
}) {
  const dialog = useModal()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const price = parseAmount(amount)
    if (!price || price.lt(0)) return setError('Renseigne un prix unitaire positif ou nul.')
    pending.current = true
    setBusy(true)
    const now = Date.now()
    try {
      await saveMarks([{ id: newId(), kind: 'market', target: quoteTarget(asset), price: price.toFixed(),
        at: now, sourceAt: now, source: 'Cours manuel' }])
      onSave()
      onClose()
    } catch {
      setError('Le cours n’a pas pu être enregistré.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <dialog ref={dialog} aria-labelledby="manual-quote-title" onCancel={event => {
    event.preventDefault()
    if (!pending.current) onClose()
  }}><form className="position-form" onSubmit={submit} noValidate>
    <header className="dialog-header"><div><p className="eyebrow">VALORISATION</p><h2 id="manual-quote-title">Saisir un cours</h2>
      <p className="hint">{asset.name} · appliqué à toutes les plateformes pour cet actif.</p></div></header>
    <label className="cost-input">Prix d’une unité (CHF)
      <input autoFocus value={amount} inputMode="decimal" maxLength={38} placeholder="Ex. 125,50"
        onChange={event => setAmount(event.target.value)} disabled={busy} />
    </label>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="dialog-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>Annuler</button>
      <button type="submit" className="primary" disabled={busy}>Enregistrer le cours</button></footer>
  </form></dialog>
}
