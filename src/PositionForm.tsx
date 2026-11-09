import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  categories, estimatedCost, money, parseAmount, platformKey,
  type Category, type Cost, type Position,
} from './portfolio'

type CostMode = 'none' | 'exact' | 'percent'

function newPositionId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),
    byte => byte.toString(16).padStart(2, '0')).join('')
}

interface Props {
  current: Position | null
  positions: Position[]
  onClose: () => void
  onSave: (position: Position) => Promise<unknown>
}

export default function PositionForm({ current, positions, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [category, setCategory] = useState<Category>(current?.category ?? 'crypto')
  const [name, setName] = useState(current?.name ?? '')
  const [reference, setReference] = useState(current?.reference ?? '')
  const [platform, setPlatform] = useState(current?.platform ?? '')
  const [units, setUnits] = useState(current?.quantity ?? '')
  const [valuation, setValuation] = useState(current?.valuation?.amount ?? '')
  const [costMode, setCostMode] = useState<CostMode>(
    current?.cost?.kind === 'exact' ? 'exact' : current?.cost ? 'percent' : 'none',
  )
  const [costInput, setCostInput] = useState(current?.cost?.kind === 'estimated'
    ? current.cost.initialPercent : current?.cost?.amount ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const savePending = useRef(false)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  const normalizedRef = reference.trim().toUpperCase()
  const knownAsset = positions.find(item => item.category === category && item.reference === normalizedRef && item.id !== current?.id)
  const platformOptions = [...new Map(positions.map(item => [platformKey(item.platform), item.platform])).values()]
  const amount = parseAmount(valuation)
  const enteredCost = parseAmount(costInput)
  const sameAsset = current?.category === category && current.reference === normalizedRef
  const sameEstimate = costMode === 'percent' && sameAsset && current.cost?.kind === 'estimated'
    && enteredCost?.eq(current.cost.initialPercent)
  const estimate = costMode === 'percent' && enteredCost?.gt(-100)
    ? sameEstimate && current?.cost?.kind === 'estimated'
      ? current.cost.amount
      : amount?.gt(0) ? estimatedCost(amount, enteredCost).toFixed() : null
    : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savePending.current) return
    setError('')
    const trimmedName = knownAsset?.name ?? name.trim()
    const trimmedPlatform = platform.trim().replace(/\s+/g, ' ')
    const qty = parseAmount(units)
    const validReference = category === 'crypto'
      ? /^[A-Z0-9][A-Z0-9._-]{0,49}$/.test(normalizedRef)
      : /^(?:[A-Z]{2}[A-Z0-9]{9}[0-9]|[A-Z0-9._-]{1,18}:[A-Z0-9._-]{1,25})$/.test(normalizedRef)

    if (!trimmedName || !trimmedPlatform) return setError('Renseigne le nom de l’actif et la plateforme.')
    if (!validReference) return setError(category === 'crypto'
      ? 'Renseigne un identifiant crypto, par exemple BTC.'
      : 'Renseigne un ISIN ou une référence marché:symbole, par exemple XSWX:NESN.')
    if (!qty?.gt(0)) return setError('La quantité doit être un nombre supérieur à zéro.')
    if (valuation.trim() && (!amount || amount.lt(0))) return setError('La valeur en CHF doit être un nombre positif ou nul.')

    let cost: Cost | null = null
    if (costMode === 'exact') {
      if (!enteredCost || enteredCost.lt(0)) return setError('Indique un coût total positif ou nul.')
      cost = { kind: 'exact', amount: enteredCost.toFixed() }
    }
    if (costMode === 'percent') {
      if (!enteredCost?.gt(-100)) return setError('Indique un pourcentage supérieur à −100 %. Pour une perte totale, saisis le coût d’acquisition.')
      if (!estimate) return setError('Renseigne une valeur positive en CHF pour calculer le coût estimé.')
      cost = sameEstimate && current?.cost?.kind === 'estimated' ? current.cost : {
        kind: 'estimated', amount: estimate, initialPercent: enteredCost.toFixed(), initialValue: amount!.toFixed(),
      }
    }

    const now = Date.now()
    const cleanValue = amount?.toFixed()
    const entry: Position = {
      id: current?.id ?? newPositionId(),
      category, name: trimmedName, reference: normalizedRef,
      platform: platformOptions.find(item => platformKey(item) === platformKey(trimmedPlatform)) ?? trimmedPlatform,
      quantity: qty.toFixed(), cost, createdAt: current?.createdAt ?? now,
      valuation: cleanValue === undefined ? null : {
        amount: cleanValue,
        updatedAt: sameAsset && current.valuation?.amount === cleanValue ? current.valuation.updatedAt : now,
      },
    }

    savePending.current = true
    setBusy(true)
    try {
      await onSave(entry)
      onClose()
    } catch (cause) {
      console.error(cause)
      setError('L’enregistrement a échoué. Vérifie que le stockage de ce navigateur est disponible, puis réessaie.')
    } finally {
      savePending.current = false
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby="position-title" onCancel={event => {
      event.preventDefault()
      if (!savePending.current) onClose()
    }}>
      <form className="position-form" onSubmit={submit} noValidate>
        <header className="dialog-header">
          <div>
            <p className="eyebrow">POSITION EXISTANTE</p>
            <h2 id="position-title">{current ? 'Modifier la position' : 'Ajouter une position'}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Fermer" onClick={onClose} disabled={busy}>×</button>
        </header>
        <fieldset disabled={busy} className="form-fields">
          <div className="form-grid">
            <label>Catégorie
              <select value={category} onChange={event => {
                setCategory(event.target.value as Category)
                setReference('')
              }}>
                {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Identifiant de l’actif
              <input autoFocus value={reference} maxLength={50} required
                placeholder={category === 'crypto' ? 'Ex. BTC' : 'ISIN ou marché:symbole'}
                onChange={event => setReference(event.target.value)} />
            </label>
            <label className="full">Nom de l’actif
              <input value={knownAsset?.name ?? name} readOnly={Boolean(knownAsset)} maxLength={100} required
                placeholder={category === 'crypto' ? 'Ex. Bitcoin' : 'Ex. ETF S&P 500'}
                onChange={event => setName(event.target.value)} />
            </label>
            <label>Plateforme
              <input value={platform} list="plateformes" maxLength={80} required
                placeholder="Ex. Revolut" onChange={event => setPlatform(event.target.value)} />
              <datalist id="plateformes">
                {platformOptions.map(item => <option key={item} value={item} />)}
              </datalist>
            </label>
            <label>Quantité
              <input value={units} inputMode="decimal" maxLength={38} required
                placeholder="Ex. 0,005" onChange={event => setUnits(event.target.value)} />
            </label>
            <label className="full">Valeur totale de la position en CHF <small>facultatif</small>
              <input value={valuation} inputMode="decimal" maxLength={38}
                placeholder="Ex. 500" onChange={event => setValuation(event.target.value)} />
            </label>
          </div>
          <fieldset className="cost-fields">
            <legend>Coût ou performance initiale <small>facultatif</small></legend>
            <div className="segments">
              {([['none', 'Ignorer'], ['exact', 'Coût d’achat'], ['percent', 'Gain ou perte en %']] as const).map(([mode, label]) => (
                <label key={mode}>
                  <input type="radio" name="costMode" checked={costMode === mode} onChange={() => {
                    setCostMode(mode)
                    setCostInput(mode === 'percent' && current?.cost?.kind === 'estimated' ? current.cost.initialPercent
                      : mode === 'exact' && current?.cost?.kind === 'exact' ? current.cost.amount : '')
                  }} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {costMode !== 'none' && (
              <label className="cost-input">{costMode === 'percent' ? 'Performance au moment de l’ajout (%)' : 'Coût total d’acquisition en CHF'}
                <input value={costInput} inputMode="decimal" maxLength={38}
                  placeholder={costMode === 'percent' ? 'Ex. +12 ou −8' : 'Ex. 450'}
                  onChange={event => setCostInput(event.target.value.replaceAll('−', '-'))} />
              </label>
            )}
          </fieldset>
          {((amount && amount.gte(0)) || estimate) && (
            <dl className="estimate" aria-live="polite">
              {amount && amount.gte(0) && <div><dt>Valeur saisie</dt><dd>{money(amount)}</dd></div>}
              {estimate && <div><dt>Coût d’acquisition estimé</dt><dd>{money(estimate)}</dd></div>}
            </dl>
          )}
          {amount === null && !valuation.trim() && (
            <p className="hint">Tu peux ajouter la position maintenant et saisir sa valeur plus tard.</p>
          )}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <footer className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer la position'}</button>
        </footer>
      </form>
    </dialog>
  )
}
