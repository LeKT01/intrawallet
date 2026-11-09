import { useRef, useState, type FormEvent } from 'react'
import AssetPicker, { type AssetInput } from './AssetPicker'
import { firstTrackingDate, operationNames, quoteTarget, type Operation, type OperationKind, type PortfolioData } from './ledger'
import { parseAmount, platformKey, type Category } from './portfolio'
import { newId, platformName, useModal } from './PositionForm'

function day(time: number) {
  return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(time)
}

interface Props {
  current: Operation | null
  data: PortfolioData
  platforms: string[]
  marketKey?: string
  onSave: (operation: Operation) => Promise<void>
  onClose: () => void
}

export default function OperationForm({ current, data, platforms, marketKey, onSave, onClose }: Props) {
  const dialog = useModal()
  const [kind, setKind] = useState<OperationKind>(current?.kind ?? 'buy')
  const [category, setCategory] = useState<Category>(current?.category ?? 'etf')
  const [chosen, setChosen] = useState<AssetInput | null>(current)
  const [custom, setCustom] = useState<AssetInput | null>(null)
  const [platform, setPlatform] = useState(current?.platform ?? '')
  const [destination, setDestination] = useState(current?.destination ?? '')
  const [quantity, setQuantity] = useState(current?.quantity ?? '')
  const [gross, setGross] = useState(current?.kind === 'transfer' ? '' : current?.gross ?? '')
  const [fee, setFee] = useState(current?.fee ?? '')
  const [feeUnits, setFeeUnits] = useState(current?.feeUnits ?? '')
  const [date, setDate] = useState(day(current?.at ?? Date.now()))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const candidates = [...new Map([...data.positions, ...data.operations].map(asset => [quoteTarget(asset), asset])).values()]
  const first = firstTrackingDate(data)
  const asset = chosen ?? (kind === 'buy' ? custom : null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setError('')
    if (!asset) return setError('Choisis l’actif concerné.')
    const source = platformName(platform, platforms)
    const to = platformName(destination, platforms)
    if (!source) return setError('Indique la plateforme de l’opération.')
    if (kind === 'transfer' && (!to || platformKey(to) === platformKey(source))) {
      return setError('Indique une plateforme de destination différente.')
    }
    const units = parseAmount(quantity)
    const total = parseAmount(kind === 'transfer' ? '0' : gross)
    const costs = parseAmount(fee.trim() || '0')
    const assetCosts = parseAmount(kind === 'transfer' ? feeUnits.trim() || '0' : '0')
    if (!units?.gt(0)) return setError('La quantité doit être supérieure à zéro.')
    if (!total || total.lt(0) || (kind === 'buy' && !total.gt(0))) return setError('Indique le montant total de l’opération en CHF.')
    if (!costs || costs.lt(0) || !assetCosts || assetCosts.lt(0)) return setError('Les frais doivent être positifs ou nuls.')
    const now = Date.now()
    const at = current && day(current.at) === date ? current.at : date === day(now) ? now : Date.parse(date + 'T23:59:59.999')
    if (!Number.isSafeInteger(at) || at > now || (Number.isFinite(first) && at < first)) {
      return setError('Choisis une date comprise entre le début du suivi et aujourd’hui.')
    }
    pending.current = true
    setBusy(true)
    try {
      await onSave({
        id: current?.id ?? newId(), category: asset.category, name: asset.name, reference: asset.reference, listing: asset.listing, market: asset.market,
        kind, platform: source, destination: kind === 'transfer' ? to : undefined,
        quantity: units.toFixed(), gross: total.toFixed(), fee: costs.toFixed(),
        feeUnits: kind === 'transfer' ? assetCosts.toFixed() : undefined, at, createdAt: current?.createdAt ?? now,
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'L’opération n’a pas pu être enregistrée.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <dialog ref={dialog} aria-labelledby="operation-title" onCancel={event => {
    event.preventDefault()
    if (!pending.current) onClose()
  }}>
    <form className="position-form" onSubmit={submit} noValidate>
      <header className="dialog-header">
        <div><p className="eyebrow">JOURNAL</p><h2 id="operation-title">{current ? 'Modifier l’opération' : 'Enregistrer une opération'}</h2></div>
        <button type="button" className="icon-button" aria-label="Fermer" onClick={onClose} disabled={busy}>×</button>
      </header>
      <fieldset disabled={busy}>
        <div className="segments" role="group" aria-label="Type d’opération">
          {(Object.keys(operationNames) as OperationKind[]).map(key => <button className="secondary segment-button"
            type="button" aria-pressed={kind === key} key={key} onClick={() => { setKind(key); setError('') }}>
            {operationNames[key]}</button>)}
        </div>
        <div className="step"><span>1</span><h3>Choisis l’actif</h3></div>
        {candidates.length > 0 && <label className="cost-input">Actif déjà suivi
          <select value={chosen && candidates.some(item => quoteTarget(item) === quoteTarget(chosen)) ? quoteTarget(chosen) : ''}
            onChange={event => {
              const match = candidates.find(item => quoteTarget(item) === event.target.value)
              setChosen(match ?? null)
              if (match) setCategory(match.category)
            }}>
            <option value="">{kind === 'buy' ? 'Choisir ou chercher un autre actif' : 'Choisir un actif'}</option>
            {candidates.map(item => <option key={quoteTarget(item)} value={quoteTarget(item)}>{item.name} · {item.reference.startsWith('MANUAL:') ? 'Ajout manuel' : item.reference}</option>)}
          </select>
        </label>}
        {kind === 'buy' && <AssetPicker category={category} selected={chosen} onCategory={setCategory}
          onChoose={setChosen} onCustom={setCustom} marketKey={marketKey} />}
        {kind !== 'buy' && candidates.length === 0 && <p className="hint">Ajoute d’abord une position ou un achat dans ton portefeuille.</p>}

        <div className="step"><span>2</span><h3>Renseigne le mouvement</h3></div>
        <div className="form-grid">
          <label>{kind === 'transfer' ? 'Plateforme de départ' : 'Plateforme'}
            <input value={platform} list="operation-platforms" maxLength={80} placeholder="Ex. Revolut" onChange={event => setPlatform(event.target.value)} />
            <datalist id="operation-platforms">{platforms.map(item => <option key={item} value={item} />)}</datalist>
          </label>
          {kind === 'transfer' && <label>Plateforme de destination
            <input value={destination} list="operation-platforms" maxLength={80} placeholder="Ex. Coinbase" onChange={event => setDestination(event.target.value)} />
          </label>}
          <label>{kind === 'transfer' ? 'Quantité reçue à destination' : 'Quantité'}
            <input value={quantity} inputMode="decimal" maxLength={38} placeholder="Ex. 0,5" onChange={event => setQuantity(event.target.value)} />
          </label>
          <label>Date de l’opération
            <input type="date" value={date} min={Number.isFinite(first) ? day(first) : undefined} max={day(Date.now())}
              onChange={event => setDate(event.target.value)} />
          </label>
          {kind !== 'transfer' && <label>{kind === 'buy' ? 'Montant payé hors frais (CHF)' : 'Montant reçu avant frais (CHF)'}
            <input value={gross} inputMode="decimal" maxLength={38} placeholder="Ex. 300" onChange={event => setGross(event.target.value)} />
          </label>}
          <label>Frais payés en CHF <small>facultatif</small>
            <input value={fee} inputMode="decimal" maxLength={38} placeholder="0" onChange={event => setFee(event.target.value)} />
          </label>
          {kind === 'transfer' && <label>Frais prélevés dans l’actif <small>facultatif</small>
            <input value={feeUnits} inputMode="decimal" maxLength={38} placeholder="0" onChange={event => setFeeUnits(event.target.value)} />
          </label>}
        </div>
        <p className="hint">{kind === 'transfer' ? 'Les éventuels frais en unités sont déduits en plus de la quantité reçue.'
          : 'Saisis le montant total pour toutes les unités, en CHF.'}</p>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <footer className="dialog-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>Annuler</button>
        <button type="submit" className="primary" disabled={busy || !asset}>Enregistrer l’opération</button></footer>
    </form>
  </dialog>
}
