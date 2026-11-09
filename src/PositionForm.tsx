import { useEffect, useRef, useState, type FormEvent } from 'react'
import AssetPicker, { type AssetInput } from './AssetPicker'
import { estimatedCost, money, parseAmount, platformKey, type Category, type Cost, type Position } from './portfolio'
import { quoteTarget, type Mark } from './ledger'
import { fetchQuotes } from './quotes'

type CostMode = 'none' | 'exact' | 'percent'

export function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),
    byte => byte.toString(16).padStart(2, '0')).join('')
}

export function platformName(value: string, options: string[]) {
  const cleaned = value.trim().replace(/\s+/g, ' ')
  return options.find(item => platformKey(item) === platformKey(cleaned)) ?? cleaned
}

export function useModal() {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return dialog
}

interface Props {
  current: Position | null
  positions: Position[]
  platforms: string[]
  marks: Mark[]
  quoteKey: string
  onClose: () => void
  onSave: (position: Position, quote?: Mark) => Promise<unknown>
}

export default function PositionForm({ current, positions, platforms, marks, quoteKey, onClose, onSave }: Props) {
  const dialog = useModal()
  const [category, setCategory] = useState<Category>(current?.category ?? 'etf')
  const [selected, setSelected] = useState<AssetInput | null>(current)
  const [custom, setCustom] = useState<AssetInput | null>(null)
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
  const [requested, setRequested] = useState<Mark>()
  const [requesting, setRequesting] = useState(false)
  const [quoteMessage, setQuoteMessage] = useState('')

  const asset = selected ?? custom
  const sameAsset = current && asset && quoteTarget(current) === quoteTarget(asset)
  const target = asset && quoteTarget(asset)
  const cached = target ? marks.filter(mark => mark.kind === 'market' && mark.target === target && mark.price !== null)
    .sort((a, b) => b.sourceAt - a.sourceAt || b.at - a.at)[0] : undefined
  const quote = requested?.target === target ? requested : cached
  const qty = parseAmount(units)
  const amount = parseAmount(valuation)
  const currentValue = valuation.trim() ? amount : (qty?.gt(0) && quote?.price ? qty.times(quote.price) : null)
  const enteredCost = parseAmount(costInput)
  const sameEstimate = costMode === 'percent' && sameAsset && current.cost?.kind === 'estimated'
    && enteredCost?.eq(current.cost.initialPercent)
  const estimate = costMode === 'percent' && enteredCost?.gt(-100)
    ? sameEstimate && current?.cost?.kind === 'estimated'
      ? current.cost.amount
      : currentValue?.gt(0) ? estimatedCost(currentValue, enteredCost).toFixed() : null
    : null

  async function requestQuote() {
    if (!asset || requesting) return
    setRequesting(true)
    setQuoteMessage('')
    try {
      const result = await fetchQuotes([asset], quoteKey)
      if (result.marks[0]) {
        setRequested(result.marks[0])
        setQuoteMessage('Cours récupéré. Laisse la valeur manuelle vide pour l’utiliser.')
      } else {
        setQuoteMessage('Cours automatique indisponible pour cet actif. Tu peux saisir sa valeur.')
      }
    } finally {
      setRequesting(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savePending.current) return
    setError('')
    if (!asset) return setError('Choisis un actif dans la liste ou ajoute son nom manuellement.')
    const selectedPlatform = platformName(platform, platforms)
    if (!selectedPlatform) return setError('Renseigne la plateforme, par exemple Revolut ou ta banque.')
    if (!qty?.gt(0)) return setError('La quantité doit être un nombre supérieur à zéro.')
    if (valuation.trim() && (!amount || amount.lt(0))) return setError('La valeur en CHF doit être un nombre positif ou nul.')

    let cost: Cost | null = null
    if (costMode === 'exact') {
      if (!enteredCost || enteredCost.lt(0)) return setError('Indique un coût total positif ou nul.')
      cost = { kind: 'exact', amount: enteredCost.toFixed() }
    }
    if (costMode === 'percent') {
      if (!enteredCost?.gt(-100)) return setError('Indique un pourcentage supérieur à −100 %. Pour une perte totale, saisis le coût d’acquisition.')
      if (!estimate) return setError('Renseigne une valeur positive en CHF ou récupère le cours pour calculer le coût estimé.')
      cost = sameEstimate && current?.cost?.kind === 'estimated' ? current.cost : {
        kind: 'estimated', amount: estimate, initialPercent: enteredCost.toFixed(), initialValue: currentValue!.toFixed(),
      }
    }

    const now = Date.now()
    const cleanValue = amount?.toFixed()
    const known = positions.find(item => quoteTarget(item) === target && item.id !== current?.id)
    const originalValue = current?.initialValue ?? (current?.valuation?.updatedAt === current?.createdAt
      ? current?.valuation?.amount : null)
    const initialValue = sameAsset && current ? originalValue ?? null : currentValue?.toFixed() ?? null
    const entry: Position = {
      id: current?.id ?? newId(), category: asset.category, name: known?.name ?? asset.name,
      reference: asset.reference, listing: asset.listing, platform: selectedPlatform, quantity: qty.toFixed(),
      cost, createdAt: current?.createdAt ?? now, initialValue,
      valuation: cleanValue === undefined ? null : {
        amount: cleanValue,
        updatedAt: sameAsset && current?.valuation?.amount === cleanValue && current.quantity === qty.toFixed()
          ? current.valuation.updatedAt : now,
      },
    }

    savePending.current = true
    setBusy(true)
    try {
      await onSave(entry, requested?.target === target ? requested : undefined)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'L’enregistrement a échoué. Réessaie.')
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
          <div><p className="eyebrow">PORTEFEUILLE</p>
            <h2 id="position-title">{current ? 'Modifier la position' : 'Ajouter une position'}</h2>
            <p className="hint">Pour des titres ou cryptos que tu détiens déjà.</p></div>
          <button type="button" className="icon-button" aria-label="Fermer" onClick={onClose} disabled={busy}>×</button>
        </header>
        <fieldset disabled={busy} className="form-fields">
          <div className="step"><span>1</span><h3>Choisis ton investissement</h3></div>
          <AssetPicker category={category} selected={selected} onCategory={setCategory} onChoose={value => {
            setSelected(value)
            setQuoteMessage('')
          }} onCustom={setCustom} />

          {asset && <>
            <div className="step"><span>2</span><h3>Indique ce que tu détiens</h3></div>
            <div className="form-grid">
              <label>Plateforme
                <input value={platform} list="plateformes" maxLength={80} placeholder="Ex. Revolut"
                  onChange={event => setPlatform(event.target.value)} />
                <datalist id="plateformes">{platforms.map(item => <option key={item} value={item} />)}</datalist>
              </label>
              <label>Quantité détenue
                <input value={units} inputMode="decimal" maxLength={38} placeholder="Ex. 2,5"
                  onChange={event => setUnits(event.target.value)} />
              </label>
              <label className="full">Valeur actuelle de toute la position (CHF) <small>facultatif</small>
                <input value={valuation} inputMode="decimal" maxLength={38} placeholder="Ex. 500"
                  onChange={event => setValuation(event.target.value)} />
              </label>
            </div>
            <div className="quote-form-row">
              <p className="hint">Montant total affiché par ta plateforme. Tu peux aussi le compléter plus tard.</p>
              {(asset.category === 'crypto' || quoteKey) && <button type="button" className="text-button"
                onClick={requestQuote} disabled={requesting}>{requesting ? 'Recherche…' : 'Récupérer le cours'}</button>}
            </div>
            {quoteMessage && <p className="hint" role="status">{quoteMessage}</p>}

            <div className="step"><span>3</span><h3>Renseigne ton prix d’achat <small>facultatif</small></h3></div>
            <div className="segments" role="group" aria-label="Coût d’acquisition">
              {([['none', 'Plus tard'], ['exact', 'Montant payé'], ['percent', 'Gain ou perte en %']] as const).map(([mode, label]) => (
                <label key={mode}><input type="radio" name="costMode" checked={costMode === mode} onChange={() => {
                  setCostMode(mode)
                  setCostInput(mode === 'percent' && current?.cost?.kind === 'estimated' ? current.cost.initialPercent
                    : mode === 'exact' && current?.cost?.kind === 'exact' ? current.cost.amount : '')
                }} /><span>{label}</span></label>
              ))}
            </div>
            {costMode !== 'none' && <label className="cost-input">
              {costMode === 'percent' ? 'Gain ou perte affiché à l’ajout (%)' : 'Montant total payé pour cette position (CHF)'}
              <input value={costInput} inputMode="decimal" maxLength={38} placeholder={costMode === 'percent' ? 'Ex. +12 ou −8' : 'Ex. 450'}
                onChange={event => setCostInput(event.target.value.replaceAll('−', '-'))} />
            </label>}
            {((currentValue && currentValue.gte(0)) || estimate) && <dl className="estimate" aria-live="polite">
              {currentValue && currentValue.gte(0) && <div><dt>{valuation.trim() ? 'Valeur saisie' : 'Valeur au cours disponible'}</dt><dd>{money(currentValue)}</dd></div>}
              {estimate && <div><dt>Coût d’acquisition estimé</dt><dd>{money(estimate)}</dd></div>}
            </dl>}
          </>}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <footer className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="primary" type="submit" disabled={busy || !asset}>{busy ? 'Enregistrement…' : 'Enregistrer la position'}</button>
        </footer>
      </form>
    </dialog>
  )
}
