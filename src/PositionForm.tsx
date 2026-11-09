import { useEffect, useRef, useState, type FormEvent } from 'react'
import AssetPicker, { type AssetInput } from './AssetPicker'
import { estimatedCost, parseAmount, platformKey, unitPrice, type Category, type Cost, type Position } from './portfolio'
import { quoteTarget, type Mark } from './ledger'
import { fetchQuotes, quoteAccess, quoteTiming, rateToCHF, referenceRate, type QuoteKeys } from './quotes'
import { currencies, dayKey, type Currency, type CurrencyDisplay } from './currency'
import { Decimal } from 'decimal.js'
import { demoFxRates, demoMode } from './demo'

type CostMode = 'none' | 'exact' | 'percent'
const quoteTime = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'short', timeStyle: 'short' })

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
  display: CurrencyDisplay
  currentRate: (code: string) => Decimal | null
  quoteKey: QuoteKeys
  onConfigure: () => void
  onClose: () => void
  onSave: (position: Position, quote?: Mark) => Promise<unknown>
}

export default function PositionForm({ current, positions, platforms, marks, display, currentRate, quoteKey, onConfigure, onClose, onSave }: Props) {
  const dialog = useModal()
  const [category, setCategory] = useState<Category>(current?.category ?? 'etf')
  const [selected, setSelected] = useState<AssetInput | null>(current)
  const [custom, setCustom] = useState<AssetInput | null>(null)
  const [platform, setPlatform] = useState(current?.platform ?? '')
  const [units, setUnits] = useState(current?.quantity ?? '')
  const [valuation, setValuation] = useState(current?.valuation?.amount ?? '')
  const [manualOverride, setManualOverride] = useState(false)
  const [purchaseCurrency, setPurchaseCurrency] = useState<Currency>(current?.purchase?.currency ?? 'CHF')
  const [purchaseDate, setPurchaseDate] = useState(current?.acquiredOn ?? current?.purchase?.date ?? '')
  const [costMode, setCostMode] = useState<CostMode>(
    current?.cost?.kind === 'exact' ? 'exact' : current?.cost ? 'percent' : 'none',
  )
  const [costInput, setCostInput] = useState(current?.cost?.kind === 'estimated'
    ? current.cost.initialPercent : current?.purchase?.total ?? current?.cost?.amount ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const savePending = useRef(false)
  const [retry, setRetry] = useState(0)
  const [quoteState, setQuoteState] = useState<{ target: string; loading: boolean; mark?: Mark; issue?: string }>()

  const asset = selected ?? custom
  const sameAsset = current && asset && quoteTarget(current) === quoteTarget(asset)
  const target = asset && quoteTarget(asset)
  const cached = target ? marks.filter(mark => mark.kind === 'market' && mark.target === target && mark.price !== null && (demoMode || mark.source !== 'Cours manuel'))
    .sort((a, b) => b.sourceAt - a.sourceAt || b.at - a.at)[0] : undefined
  const request = quoteState?.target === target ? quoteState : undefined
  const fresh = request?.mark
  const quote = fresh && (!cached || fresh.sourceAt >= cached.sourceAt) ? fresh : cached
  const access = asset && !demoMode ? quoteAccess(asset, quoteKey) : 'manual'
  const { eodhd, finnhub, coingecko } = quoteKey

  useEffect(() => {
    if (!asset || !target || access !== 'available') return
    let active = true
    setQuoteState({ target, loading: true })
    void fetchQuotes([asset], { eodhd, finnhub, coingecko }, { force: retry > 0, opening: true }).then(({ marks, issues }) => {
      if (!active) return
      const mark = marks.sort((a, b) => b.sourceAt - a.sourceAt)[0]
      setQuoteState({ target, loading: false, mark, issue: issues[0] ?? (mark ? undefined : 'Le fournisseur n’a pas renvoyé de cours.') })
    }).catch(() => {
      if (active) setQuoteState({ target, loading: false, issue: 'Le cours n’a pas pu être récupéré.' })
    })
    return () => { active = false }
  }, [asset, target, access, eodhd, finnhub, coingecko, retry])

  const qty = parseAmount(units)
  const useManual = !quote || manualOverride
  const amount = useManual ? parseAmount(valuation) : null
  const rate = quote?.currency && quote.originalPrice ? currentRate(quote.currency) : null
  const currentPrice = rate && quote?.originalPrice ? new Decimal(quote.originalPrice).times(rate) : quote?.price
  const currentValue = useManual && valuation.trim() ? amount : (qty?.gt(0) && currentPrice ? qty.times(currentPrice) : null)
  const enteredCost = parseAmount(costInput)
  const sameEstimate = costMode === 'percent' && sameAsset && current.cost?.kind === 'estimated'
    && enteredCost?.eq(current.cost.initialPercent)
  const estimate = costMode === 'percent' && enteredCost?.gt(-100)
    ? sameEstimate && current?.cost?.kind === 'estimated'
      ? current.cost.amount
      : currentValue?.gt(0) ? estimatedCost(currentValue, enteredCost).toFixed() : null
    : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savePending.current) return
    setError('')
    if (!asset) return setError('Choisis un actif dans la liste ou ajoute son nom manuellement.')
    const selectedPlatform = platformName(platform, platforms)
    if (!selectedPlatform) return setError('Renseigne la plateforme, par exemple Revolut ou ta banque.')
    if (!qty?.gt(0)) return setError('La quantité doit être un nombre supérieur à zéro.')
    if (useManual && valuation.trim() && (!amount || amount.lt(0))) return setError('La valeur en CHF doit être un nombre positif ou nul.')

    if (purchaseDate && (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) || purchaseDate > dayKey(Date.now()))) {
      return setError('Choisis une date d’acquisition valide, au plus tard aujourd’hui.')
    }
    if (costMode === 'exact' && (!enteredCost || enteredCost.lt(0))) return setError('Indique un coût total positif ou nul.')
    if (costMode === 'percent' && !enteredCost?.gt(-100)) {
      return setError('Indique un pourcentage supérieur à −100 %. Pour une perte totale, saisis le coût d’acquisition.')
    }
    if (costMode === 'percent' && !estimate) return setError('Il faut une valeur de position positive pour estimer le coût.')

    savePending.current = true
    setBusy(true)
    try {
      let cost: Cost | null = null
      let purchase: Position['purchase']
      if (costMode === 'exact' && enteredCost) {
        const unchanged = sameAsset && current.purchase && enteredCost.eq(current.purchase.total)
          && purchaseCurrency === current.purchase.currency && (purchaseDate || undefined) === current.purchase.date
        const day = purchaseDate || dayKey(Date.now())
        const demoRate = demoMode ? referenceRate(demoFxRates(day), purchaseCurrency, day) : null
        if (demoMode && !demoRate) throw new Error('Taux fictif indisponible pour cette date.')
        const rate = unchanged ? new Decimal(current.purchase!.rate)
          : demoRate ? new Decimal(1).div(demoRate.rate) : (await rateToCHF(purchaseCurrency, day)).rate
        purchase = { total: enteredCost.toFixed(), currency: purchaseCurrency, date: purchaseDate || undefined, rate: rate.toFixed() }
        cost = { kind: 'exact', amount: enteredCost.times(rate).toFixed() }
      }
      if (costMode === 'percent' && estimate && enteredCost) {
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
        reference: asset.reference, listing: asset.listing, market: asset.market, platform: selectedPlatform, quantity: qty.toFixed(),
        cost, purchase, acquiredOn: purchaseDate || undefined, createdAt: current?.createdAt ?? now, initialValue,
        valuation: cleanValue === undefined ? null : {
          amount: cleanValue,
          updatedAt: sameAsset && current?.valuation?.amount === cleanValue && current.quantity === qty.toFixed()
            ? current.valuation.updatedAt : now,
        },
      }

      await onSave(entry, quote === fresh ? fresh : undefined)
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
          <AssetPicker category={category} selected={selected} onCategory={setCategory}
            onChoose={item => {
              if (item && (!current || quoteTarget(item) !== quoteTarget(current))) { setValuation(''); setManualOverride(false) }
              setSelected(item)
              setQuoteState(undefined)
              setRetry(0)
            }} onCustom={setCustom} marketKey={demoMode ? undefined : eodhd} />

          {asset && <>
            <section className="quote-card" aria-label="Cours de l’actif">
              <div className="quote-form-row">
                <div aria-live="polite">
                  <p className="quote-caption">Cours du marché par unité</p>
                  {quote?.price != null
                    ? <><strong className="quote-price">{quote.originalPrice && quote.currency && currencies.includes(quote.currency as Currency)
                      ? unitPrice(quote.originalPrice, quote.currency as Currency) : unitPrice(quote.price)}</strong>
                      <small>{quoteTiming(quote)} · {quote.source} · {quoteTime.format(quote.sourceAt)}</small></>
                    : <strong className="quote-price">{access === 'available' && (!request || request.loading)
                      ? 'Recherche du cours…' : 'Cours indisponible'}</strong>}
                </div>
                {access === 'available' && <button type="button" className="secondary"
                  onClick={() => setRetry(value => value + 1)} disabled={request?.loading}>{request?.loading ? 'Recherche…' : 'Vérifier le cours'}</button>}
              </div>
              {access === 'manual' && <p className="hint">{demoMode ? 'La démo utilise des cours fictifs.' : 'Cet identifiant n’est pas relié à une cotation automatique.'}</p>}
              {access === 'key' && <p className="hint">Active une clé de cotation pour ce titre dans <button type="button" className="text-button" onClick={onConfigure}>Données</button>.</p>}
              {request?.issue && <p className="hint" role="status">{request.issue}{quote ? ' Le dernier cours connu est affiché.' : ' Tu peux enregistrer la quantité et valoriser la position plus tard.'}</p>}
            </section>
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
            </div>
            <details className="manual-valuation">
              <summary>Saisie de secours du montant en CHF</summary>
              <label>Valeur totale saisie manuellement
                <input value={valuation} inputMode="decimal" maxLength={38} placeholder="Ex. 500"
                  onChange={event => { setValuation(event.target.value); setManualOverride(true) }} />
              </label>
              {valuation.trim() && quote?.price != null && <button type="button" className="text-button"
                onClick={() => setManualOverride(value => !value)}>{manualOverride ? 'Revenir au cours automatique' : 'Utiliser le montant saisi'}</button>}
            </details>
            {currentValue?.gte(0) && <dl className="estimate" aria-live="polite">
              <div><dt>{useManual && valuation.trim() ? 'Valeur détenue · saisie manuelle' : 'Valeur détenue · quantité × cours'}</dt>
                <dd>{display.format(currentValue)}</dd></div>
            </dl>}
            {quote?.price != null && !qty?.gt(0) && !(useManual && valuation.trim())
              && <p className="hint">Saisis ta quantité pour calculer la valeur détenue.</p>}

            <div className="step"><span>3</span><h3>Renseigne ton prix d’achat <small>facultatif</small></h3></div>
            <div className="segments" role="group" aria-label="Coût d’acquisition">
              {([['none', 'Plus tard'], ['exact', 'Montant payé'], ['percent', 'Gain ou perte en %']] as const).map(([mode, label]) => (
                <label key={mode}><input type="radio" name="costMode" checked={costMode === mode} onChange={() => {
                  setCostMode(mode)
                  setCostInput(mode === 'percent' && current?.cost?.kind === 'estimated' ? current.cost.initialPercent
                    : mode === 'exact' && current?.cost?.kind === 'exact' ? current.purchase?.total ?? current.cost.amount : '')
                }} /><span>{label}</span></label>
              ))}
            </div>
            {costMode === 'exact' && <div className="form-grid">
              <label>Montant total payé, frais compris
                <input value={costInput} inputMode="decimal" maxLength={38} placeholder="Ex. 450" onChange={event => setCostInput(event.target.value)} />
              </label>
              <label>Devise du montant payé
                <select value={purchaseCurrency} onChange={event => setPurchaseCurrency(event.target.value as Currency)}>
                  {currencies.map(currency => <option key={currency}>{currency}</option>)}
                </select>
              </label>
              {enteredCost?.gte(0) && qty?.gt(0) && <p className="hint full">Prix d’achat moyen par unité, frais compris <strong>{unitPrice(enteredCost.div(qty), purchaseCurrency)}</strong></p>}
            </div>}
            {costMode === 'percent' && <label className="cost-input">Gain ou perte affiché à l’ajout (%)
              <input value={costInput} inputMode="decimal" maxLength={38} placeholder="Ex. +12 ou −8"
                onChange={event => setCostInput(event.target.value.replaceAll('−', '-'))} />
            </label>}
            <label className="cost-input">Date d’acquisition <small>facultative</small>
              <input type="date" value={purchaseDate} max={dayKey(Date.now())} onChange={event => setPurchaseDate(event.target.value)} />
            </label>
            <p className="hint">Le suivi commence à l’ajout de la position. Le taux de référence de la date d’achat est utilisé si tu la renseignes.</p>
            {estimate && <dl className="estimate" aria-live="polite">
              <div><dt>Coût d’acquisition estimé</dt><dd>{display.format(estimate)}</dd></div>
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
