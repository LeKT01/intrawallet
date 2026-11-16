import { useEffect, useRef, useState, type FormEvent } from 'react'
import AssetPicker, { type AssetInput } from './AssetPicker'
import { acquisitionCost, estimatedCost, parseAmount, platformKey, unitPrice, type Category, type Cost, type Position } from './portfolio'
import { compareMarketMarks, hasUnknownQuoteTime, isMarketMark, quoteTarget, type Mark } from './ledger'
import { fetchQuotes, hasAutomaticNqseQuote, hasAutomaticSixQuote, hasAutomaticTradegateQuote, instrumentCode, quoteAccess, quoteIsStale, quoteTiming, rateToCHF, referenceRate, type QuoteKeys } from './quotes'
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

export function useModal(onClose: () => void) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closing = useRef<number | undefined>(undefined)
  useEffect(() => {
    const element = dialog.current
    const viewport = window.visualViewport
    const updateViewport = () => {
      if (!viewport || viewport.scale !== 1) {
        element?.style.removeProperty('--dialog-visible-height')
        element?.style.removeProperty('--dialog-visible-top')
        return
      }
      element?.style.setProperty('--dialog-visible-height', viewport.height + 'px')
      element?.style.setProperty('--dialog-visible-top', viewport.offsetTop + 'px')
    }
    element?.showModal()
    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    return () => {
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      window.clearTimeout(closing.current)
      element?.close()
    }
  }, [])
  function close() {
    const element = dialog.current
    if (closing.current !== undefined) return
    if (!element?.open || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element?.close()
      onClose()
      return
    }
    element.dataset.closing = ''
    element.inert = true
    closing.current = window.setTimeout(() => {
      element.close()
      onClose()
    }, 150)
  }
  return { dialog, close }
}

interface Props {
  current: Position | null
  fixedPlatform?: string
  fixedCategory?: Category
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

export default function PositionForm({ current, fixedPlatform, fixedCategory, positions, platforms, marks, display, currentRate, quoteKey, onConfigure, onClose, onSave }: Props) {
  const { dialog, close } = useModal(onClose)
  const [category, setCategory] = useState<Category>(current?.category ?? fixedCategory ?? 'etf')
  const [selected, setSelected] = useState<AssetInput | null>(current)
  const [custom, setCustom] = useState<AssetInput | null>(null)
  const [platform, setPlatform] = useState(current?.platform ?? fixedPlatform ?? '')
  const [units, setUnits] = useState(current?.quantity ?? '')
  const [manualInput, setManualInput] = useState(current?.valuation?.manual?.amount ?? '')
  const [manualCurrencyChoice, setManualCurrencyChoice] = useState(current?.valuation?.manual?.currency)
  const [purchaseCurrency, setPurchaseCurrency] = useState<Currency>(current?.purchase?.currency ?? 'CHF')
  const [purchaseDate, setPurchaseDate] = useState(current?.acquiredOn ?? current?.purchase?.date ?? '')
  const [costMode, setCostMode] = useState<CostMode>(
    current?.cost?.kind === 'exact' ? 'exact' : current?.cost ? 'percent' : 'none',
  )
  const [costInput, setCostInput] = useState(current?.cost?.kind === 'estimated'
    ? current.cost.initialPercent : current?.purchase?.unit
      ?? (current?.purchase ? new Decimal(current.purchase.total).minus(current.purchase.fees ?? '0').toFixed() : ''))
  const [totalCostInput, setTotalCostInput] = useState(Boolean(current?.purchase && !current.purchase.unit))
  const [brokerValueInput, setBrokerValueInput] = useState('')
  const [brokerCurrency, setBrokerCurrency] = useState<Currency>(display.currency)
  const [fees, setFees] = useState(current?.purchase?.fees ?? '')
  const [keepCost, setKeepCost] = useState(Boolean(current?.cost?.kind === 'exact' && !current.purchase))
  const [previewRate, setPreviewRate] = useState<{ key: string; rate: Decimal | null }>()
  const [confirmedInstrument, setConfirmedInstrument] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const savePending = useRef(false)
  const [retry, setRetry] = useState(0)
  const [quoteState, setQuoteState] = useState<{ target: string; loading: boolean; mark?: Mark; issue?: string }>()

  const asset = selected ?? custom
  const sameAsset = current && asset && quoteTarget(current) === quoteTarget(asset)
  const target = asset && quoteTarget(asset)
  const identityChanged = Boolean(current && asset && (!sameAsset || instrumentCode(current) !== instrumentCode(asset)))
  const instrument = asset ? instrumentCode(asset) : undefined
  const cached = target ? marks.filter(mark => isMarketMark(mark) && mark.target === target
    && (!instrument || mark.instrument === instrument || (mark.instrument === undefined && ((sameAsset && !identityChanged) || demoMode))))
    .sort((a, b) => compareMarketMarks(b, a))[0] : undefined
  const request = quoteState?.target === target ? quoteState : undefined
  const fresh = request?.mark
  const quote = fresh && (!cached || compareMarketMarks(fresh, cached) >= 0) ? fresh : cached
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
  const rate = quote?.currency && quote.originalPrice ? currentRate(quote.currency) : null
  const currentPrice = rate && quote?.originalPrice ? new Decimal(quote.originalPrice).times(rate) : quote?.price
  const savedValuation = sameAsset && !identityChanged ? current?.valuation : null
  const savedManual = savedValuation?.manual
  const manualCurrency = manualCurrencyChoice ?? currencies.find(code => code === asset?.market?.currency) ?? 'CHF'
  const manualAmount = parseAmount(manualInput)
  const manualRate = !quote && manualAmount?.gt(0) ? currentRate(manualCurrency)
    ?? (savedValuation && savedManual?.currency === manualCurrency ? new Decimal(savedValuation.amount).div(savedManual.amount) : null) : null
  const manualTotal = qty?.gt(0) && manualAmount && manualRate ? manualAmount.times(manualRate) : null
  const currentValue = qty?.gt(0) && currentPrice ? qty.times(currentPrice) : manualTotal
  const enteredCost = parseAmount(costInput)
  const fee = parseAmount(fees || '0')
  const purchaseDay = purchaseDate || dayKey(Date.now())
  const rateKey = purchaseCurrency + '/' + purchaseDay
  const savedRate = current?.purchase?.currency === purchaseCurrency && (current.purchase.date || '') === purchaseDate
    ? new Decimal(current.purchase.rate) : null

  useEffect(() => {
    if (costMode !== 'exact' || keepCost || purchaseCurrency === 'CHF') return
    let active = true
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDay) || purchaseDay > dayKey(Date.now())) return
    const timer = window.setTimeout(() => {
      const demoRate = demoMode ? referenceRate(demoFxRates(purchaseDay), purchaseCurrency, purchaseDay) : null
      const pending = demoMode ? Promise.resolve(demoRate ? new Decimal(1).div(demoRate.rate) : null)
        : rateToCHF(purchaseCurrency, purchaseDay).then(value => value.rate)
      void pending.then(rate => { if (active) setPreviewRate({ key: rateKey, rate }) })
        .catch(() => { if (active) setPreviewRate({ key: rateKey, rate: null }) })
    }, 300)
    return () => { active = false; window.clearTimeout(timer) }
  }, [costMode, keepCost, purchaseCurrency, purchaseDay, rateKey])

  const purchaseRate = purchaseCurrency === 'CHF' ? new Decimal(1) : savedRate ?? (previewRate?.key === rateKey ? previewRate.rate : null)
  const purchaseTotal = qty?.gt(0) && enteredCost?.gte(0) && fee?.gte(0)
    ? totalCostInput ? enteredCost.plus(fee) : acquisitionCost(qty, enteredCost, fee) : null
  const brokerValue = parseAmount(brokerValueInput)
  const brokerRate = brokerValueInput.trim() ? currentRate(brokerCurrency) : null
  const estimateValue = brokerValueInput.trim() ? brokerValue?.gt(0) && brokerRate ? brokerValue.times(brokerRate) : null : currentValue
  const sameEstimate = costMode === 'percent' && sameAsset && current.cost?.kind === 'estimated'
    && enteredCost?.eq(current.cost.initialPercent) && !brokerValueInput.trim()
  const estimate = costMode === 'percent' && enteredCost?.gt(-100)
    ? sameEstimate && current?.cost?.kind === 'estimated'
      ? current.cost.amount
      : estimateValue?.gt(0) ? estimatedCost(estimateValue, enteredCost).toFixed() : null
    : null

  const basis = costMode === 'exact' ? keepCost && current?.cost ? new Decimal(current.cost.amount)
    : purchaseTotal && purchaseRate ? purchaseTotal.times(purchaseRate) : null : estimate ? new Decimal(estimate) : null
  const previewGain = currentValue && basis ? currentValue.minus(basis) : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savePending.current) return
    setError('')
    if (!asset) return setError('Choisis un actif dans la liste ou ajoute son nom manuellement.')
    if (identityChanged && !confirmedInstrument) return setError('Confirme que cette ligne correspond bien à la position existante.')
    const selectedPlatform = platformName(platform, platforms)
    if (!selectedPlatform) return setError('Renseigne la plateforme, par exemple Revolut ou ta banque.')
    if (!qty?.gt(0)) return setError('La quantité doit être un nombre supérieur à zéro.')
    if (!quote && manualInput.trim()) {
      if (!manualAmount?.gt(0)) return setError('Saisis une valeur totale supérieure à zéro.')
      if (!manualRate) return setError('Taux de change indisponible. Réessaie ou saisis la valeur en CHF.')
    }

    if (purchaseDate && (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) || purchaseDate > dayKey(Date.now()))) {
      return setError('Choisis une date d’acquisition valide, au plus tard aujourd’hui.')
    }
    if (costMode === 'exact' && !keepCost && !purchaseTotal) return setError('Indique un prix d’achat et des frais positifs ou nuls.')
    if (costMode === 'percent' && !enteredCost?.gt(-100)) {
      return setError('Indique un pourcentage supérieur à −100 %. Pour une perte totale, saisis le coût d’acquisition.')
    }
    if (costMode === 'percent' && brokerValueInput.trim()) {
      if (!brokerValue?.gt(0)) return setError('Indique une valeur du courtier supérieure à zéro.')
      if (!brokerRate) return setError('Taux de change indisponible pour la devise du courtier.')
    }
    if (costMode === 'percent' && !estimate) return setError('Il faut une valeur de position positive pour estimer le coût.')

    savePending.current = true
    setBusy(true)
    try {
      let cost: Cost | null = null
      let purchase: Position['purchase']
      if (costMode === 'exact' && keepCost && current?.cost?.kind === 'exact') {
        cost = current.cost
        purchase = current.purchase
      } else if (costMode === 'exact' && enteredCost && purchaseTotal && fee) {
        const rate = purchaseRate ?? (!demoMode ? (await rateToCHF(purchaseCurrency, purchaseDay)).rate : null)
        if (!rate) throw new Error('Taux de change indisponible pour cette acquisition.')
        purchase = { total: purchaseTotal.toFixed(), unit: totalCostInput ? undefined : enteredCost.toFixed(), fees: fee.toFixed(),
          currency: purchaseCurrency, date: purchaseDate || undefined, rate: rate.toFixed() }
        cost = { kind: 'exact', amount: purchaseTotal.times(rate).toFixed() }
      }
      if (costMode === 'percent' && estimate && enteredCost) {
        cost = sameEstimate && current?.cost?.kind === 'estimated' ? current.cost : {
          kind: 'estimated', amount: estimate, initialPercent: enteredCost.toFixed(), initialValue: estimateValue!.toFixed(),
        }
      }

      const now = Date.now()
      const known = positions.find(item => quoteTarget(item) === target && item.id !== current?.id)
      let valuation = savedValuation ?? null
      if (manualTotal && manualAmount) {
        if (savedManual?.amount !== manualAmount.toFixed() || savedManual.currency !== manualCurrency || qty.toFixed() !== current?.quantity) {
          valuation = { amount: manualTotal.toFixed(), updatedAt: Math.max(now, (valuation?.updatedAt ?? 0) + 1),
            manual: { amount: manualAmount.toFixed(), currency: manualCurrency } }
        }
      } else if (!quote && savedManual && !manualInput.trim()) valuation = null
      const originalValue = current?.initialValue ?? (current?.valuation?.updatedAt === current?.createdAt
        ? current?.valuation?.amount : null)
      const initialValue = current ? originalValue ?? null : currentValue?.toFixed() ?? null
      const entry: Position = {
        id: current?.id ?? newId(), category: asset.category, name: known?.name ?? asset.name,
        reference: asset.reference, listing: asset.listing, isin: asset.isin, market: asset.market, platform: selectedPlatform, quantity: qty.toFixed(),
        cost, purchase, acquiredOn: purchaseDate || undefined, createdAt: current?.createdAt ?? now, initialValue,
        valuation,
      }

      await onSave(entry, quote === fresh ? fresh : undefined)
      close()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'L’enregistrement a échoué. Réessaie.')
    } finally {
      savePending.current = false
      setBusy(false)
    }
  }

  return (
    <dialog className="form-dialog" ref={dialog} aria-labelledby="position-title" onCancel={event => {
      event.preventDefault()
      if (!savePending.current) close()
    }}>
      <form className="position-form" onSubmit={submit} noValidate>
        <header className="dialog-header">
          <div><p className="eyebrow">PORTEFEUILLE</p>
            <h2 id="position-title">{current ? 'Modifier la position' : 'Ajouter une position'}</h2>
            <p className="hint">Pour des titres ou cryptos que tu détiens déjà.</p></div>
          <button type="button" className="icon-button" aria-label="Fermer" onClick={close} disabled={busy}>×</button>
        </header>
        <fieldset disabled={busy} className="form-fields dialog-body">
          <div className="step"><span>1</span><h3>Choisis ton investissement</h3></div>
          <AssetPicker fixedCategory={Boolean(fixedCategory)} category={category} selected={selected} onCategory={setCategory}
            onChoose={item => {
              const previousManual = item && current && quoteTarget(item) === quoteTarget(current) && instrumentCode(item) === instrumentCode(current)
                ? current.valuation?.manual : undefined
              setSelected(item)
              setConfirmedInstrument(false)
              setQuoteState(undefined)
              setRetry(0)
              setManualInput(previousManual?.amount ?? '')
              setManualCurrencyChoice(previousManual?.currency)
              setBrokerValueInput('')
            }} onCustom={item => {
              setCustom(item)
              setConfirmedInstrument(false)
              setManualInput('')
              setManualCurrencyChoice(undefined)
            }} marketKey={demoMode ? undefined : eodhd} cryptoKey={demoMode ? undefined : coingecko} />

          {asset && <>
            <section className="quote-card" aria-label="Cours de l’actif">
              <div className="quote-form-row">
                <div aria-live="polite">
                  <p className="quote-caption">Cours du marché par unité</p>
                  {quote?.price != null
                    ? <><strong className="quote-price">{quote.originalPrice && quote.currency && currencies.includes(quote.currency as Currency)
                      ? unitPrice(quote.originalPrice, quote.currency as Currency) : unitPrice(quote.price)}</strong>
                      <small>{quoteIsStale(quote) ? 'Cours ancien · ' : ''}{quoteTiming(quote)} · {quote.instrument ? quote.instrument + ' · ' : ''}{quote.source} · {(hasUnknownQuoteTime(quote) ? 'Reçu le ' + quoteTime.format(quote.receivedAt ?? quote.at) : quoteTime.format(quote.sourceAt))}</small></>
                    : <strong className="quote-price">{access === 'available' && (!request || request.loading)
                      ? 'Recherche du cours…' : 'Cours indisponible'}</strong>}
                </div>
                {access === 'available' && <button type="button" className="secondary"
                  onClick={() => setRetry(value => value + 1)} disabled={request?.loading}>{request?.loading ? 'Recherche…' : 'Vérifier le cours'}</button>}
              </div>
              {access === 'manual' && <p className="hint">{demoMode ? 'La démo utilise des cours fictifs.' : 'Cet identifiant n’est pas relié à une cotation automatique.'}</p>}
              {!demoMode && hasAutomaticSixQuote(asset) && <p className="hint">Clôture publiée par SIX Swiss Exchange, récupérée sans clé.</p>}
              {!demoMode && hasAutomaticNqseQuote(asset) && <p className="hint">Dernier cours Xetra publié par Deutsche Börse, récupéré sans clé.</p>}
              {!demoMode && hasAutomaticTradegateQuote(asset) && <p className="hint">Dernier prix relevé sur Tradegate en EUR, sans clé.</p>}
              {access === 'key' && <p className="hint">Active une clé de cotation pour ce titre dans <button type="button" className="text-button" onClick={onConfigure}>Paramètres</button>.</p>}
              {request?.issue && <p className="hint" role="status">{request.issue}{quote ? ' Le dernier cours connu est affiché.' : ' Tu peux saisir la valeur affichée par ton courtier ci-dessous.'}</p>}
            </section>
            {identityChanged && <label className="check-row"><input type="checkbox" checked={confirmedInstrument}
              onChange={event => setConfirmedInstrument(event.target.checked)} />
              Je confirme que cette ligne de cotation correspond à l’investissement déjà enregistré.</label>}
            <div className="step"><span>2</span><h3>Indique ce que tu détiens</h3></div>
            <div className="form-grid">
              <label>Plateforme
                <input value={platform} readOnly={Boolean(fixedPlatform)} list="plateformes" maxLength={80} placeholder="Ex. Revolut"
                  onChange={event => setPlatform(event.target.value)} />
                <datalist id="plateformes">{platforms.map(item => <option key={item} value={item} />)}</datalist>
              </label>
              <label>Quantité détenue
                <input value={units} inputMode="decimal" maxLength={38} placeholder="Ex. 2,5"
                  onChange={event => setUnits(event.target.value)} />
              </label>
              {!quote && <>
                <label>Valeur totale actuelle <small>facultative</small>
                  <input value={manualInput} inputMode="decimal" maxLength={38} placeholder="Ex. 843,32"
                    onChange={event => setManualInput(event.target.value)} />
                </label>
                <label>Devise de la valeur
                  <select value={manualCurrency} onChange={event => setManualCurrencyChoice(event.target.value as Currency)}>
                    {currencies.map(currency => <option key={currency}>{currency}</option>)}
                  </select>
                </label>
                <p className="hint full">Recopie la valeur totale affichée par ton courtier pour la quantité indiquée. Le cours automatique prend le relais dès qu’il est disponible.</p>
              </>}
            </div>
            <div className="step"><span>3</span><h3>Renseigne ton prix d’achat <small>facultatif</small></h3></div>
            <div className="segments" role="group" aria-label="Coût d’acquisition">
              {([['none', 'Plus tard'], ['exact', 'Prix d’achat'], ['percent', 'Gain ou perte en %']] as const).map(([mode, label]) => (
                <label key={mode}><input type="radio" name="costMode" checked={costMode === mode} onChange={() => {
                  setCostMode(mode)
                  setCostInput(mode === 'percent' && current?.cost?.kind === 'estimated' ? current.cost.initialPercent
                    : mode === 'exact' && current?.purchase ? current.purchase.unit
                      ?? new Decimal(current.purchase.total).minus(current.purchase.fees ?? '0').toFixed() : '')
                  if (mode === 'exact') setTotalCostInput(Boolean(current?.purchase && !current.purchase.unit))
                }} /><span>{label}</span></label>
              ))}
            </div>
            {costMode === 'exact' && (keepCost ? <div className="estimate">
              <div><dt>Coût total enregistré</dt><dd>{display.format(current!.cost!.amount)}</dd></div>
              <button type="button" className="text-button" onClick={() => setKeepCost(false)}>Corriger le coût d’achat</button>
            </div> : <div className="form-grid">
              <label>Type de montant
                <select value={totalCostInput ? 'total' : 'unit'} onChange={event => {
                  setTotalCostInput(event.target.value === 'total')
                  setCostInput('')
                }}><option value="unit">Prix par unité</option><option value="total">Montant total hors frais</option></select>
              </label>
              <label>{totalCostInput ? 'Montant total hors frais' : 'Prix d’achat par unité'}
                <input value={costInput} inputMode="decimal" maxLength={38} placeholder="Ex. 105,50" onChange={event => setCostInput(event.target.value)} />
              </label>
              <label>Devise d’achat
                <select value={purchaseCurrency} onChange={event => setPurchaseCurrency(event.target.value as Currency)}>
                  {currencies.map(currency => <option key={currency}>{currency}</option>)}
                </select>
              </label>
              <label>Frais totaux <small>facultatif</small>
                <input value={fees} inputMode="decimal" maxLength={38} placeholder="0" onChange={event => setFees(event.target.value)} />
              </label>
              {purchaseTotal && <p className="hint">Total payé <strong>{unitPrice(purchaseTotal, purchaseCurrency)}</strong></p>}
            </div>)}
            {costMode === 'percent' && <div className="form-grid">
              <label>Gain ou perte affiché par le courtier (%)
                <input value={costInput} inputMode="decimal" maxLength={38} placeholder="Ex. +12 ou −8"
                  onChange={event => setCostInput(event.target.value.replaceAll('−', '-'))} />
              </label>
              <label>Valeur affichée par le courtier <small>facultative</small>
                <input value={brokerValueInput} inputMode="decimal" maxLength={38} placeholder="Ex. 430,80"
                  onChange={event => setBrokerValueInput(event.target.value)} />
              </label>
              <label>Devise de la valeur du courtier
                <select value={brokerCurrency} onChange={event => setBrokerCurrency(event.target.value as Currency)}>
                  {currencies.map(currency => <option key={currency}>{currency}</option>)}
                </select>
              </label>
              <p className="hint full">Recopie la valeur et le pourcentage du même relevé pour la quantité de ce lot. Si tu as plusieurs lots, utilise le montant débité pour chacun. Si tu laisses la valeur vide, une nouvelle estimation utilise le cours de l’application.</p>
            </div>}
            <label className="cost-input">Date d’acquisition <small>facultative</small>
              <input type="date" value={purchaseDate} max={dayKey(Date.now())} onChange={event => setPurchaseDate(event.target.value)} />
            </label>
            <p className="hint">Le suivi commence à l’ajout de la position. Le taux de référence de la date d’achat est utilisé si tu la renseignes.</p>
            <dl className="estimate position-preview" aria-label="Aperçu de la position" aria-live="polite">
              <div><dt>Quantité</dt><dd>{qty?.gt(0) ? qty.toFixed() : '—'}</dd></div>
              <div><dt>{costMode === 'percent' ? 'Coût estimé' : 'Coût d’acquisition'}</dt><dd>{basis === null ? '—' : display.format(basis)}</dd></div>
              <div><dt>{manualTotal ? 'Valeur saisie manuellement' : 'Valeur de marché'}</dt><dd>{currentValue === null ? '—' : display.format(currentValue)}</dd></div>
              <div><dt>Gain latent indicatif</dt><dd>{previewGain === null ? '—' : display.format(previewGain, { signed: true })}</dd></div>
            </dl>
            {costMode === 'exact' && purchaseTotal && !purchaseRate && <p className="hint" role="status">
              {previewRate?.key === rateKey ? 'Taux de change indisponible pour cette date.' : 'Recherche du taux de change…'}
            </p>}
          </>}
        </fieldset>
        <footer className="dialog-actions">
          {error && <p className="error dialog-error" role="alert">{error}</p>}
          <button type="button" className="secondary" onClick={close} disabled={busy}>Annuler</button>
          <button className="primary" type="submit" disabled={busy || !asset}>{busy ? 'Enregistrement…' : 'Enregistrer la position'}</button>
        </footer>
      </form>
    </dialog>
  )
}
