import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deleteOperation, deletePosition, loadPortfolio, saveMarks, saveOperation, savePosition } from './database'
import { assetKey, categories, consolidate, platformKey, quantity, summarize, type Position } from './portfolio'
import { assetChartMarks, dailyPortfolioHistory, firstTrackingDate, operationNames, replay, type Holding, type Mark, type Operation, type PortfolioData } from './ledger'
import PositionForm from './PositionForm'
import OperationForm from './OperationForm'
import DataSettings, { ConfirmDialog } from './DataSettings'
import HistoryChart from './HistoryChart'
import ManualQuoteForm from './ManualQuoteForm'
import { fetchQuotes, quoteAccess, readSessionQuoteKey, saveSessionQuoteKey } from './quotes'
import { catalogEntry } from './catalog'
import { currencies, dayKey, type Currency, type CurrencyDisplay } from './currency'
import useCurrency from './useCurrency'
import useDailyPrices from './useDailyPrices'
import AssetHistory from './AssetHistory'

type Section = 'overview' | 'positions' | 'journal' | 'data'
type IconName = Section | 'plus' | 'lock' | 'chevron'
const sections = { overview: 'Vue d’ensemble', positions: 'Positions', journal: 'Journal', data: 'Données' } as const
const emptyData: PortfolioData = { positions: [], operations: [], marks: [] }
const quoteInterval = 60 * 1000
const timestamp = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeStyle: 'short' })

function Icon({ name }: { name: IconName }) {
  const paths = {
    overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    positions: 'M3 7h18v13H3z M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M3 12h18 M10 12v2h4v-2',
    journal: 'M5 3h14v18H5z M9 8h6 M9 12h6 M9 16h4',
    data: 'M4 4h16v16H4z M8 9h8 M8 14h8',
    plus: 'M12 5v14 M5 12h14',
    lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
    chevron: 'm9 6 6 6-6 6',
  }
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

function ReadableValue({ position, display }: { position: Holding; display: CurrencyDisplay }) {
  if (!position.valuation) return <span className="muted">Valorisation incomplète</span>
  return <><strong>{display.format(position.valuation.amount)}</strong>
    {position.unitPrice !== null && <small>{position.averageUnitPrice ? 'Prix moyen utilisé' : 'Prix unitaire utilisé'} {display.format(position.unitPrice, { unit: true })}</small>}
    <small>{position.partiallyValued ? 'Valeur partielle · ' : ''}{position.source?.source ?? 'Saisie manuelle'} · {
      timestamp.format(position.valuation.updatedAt)
    }</small></>
}

function labelReference(reference: string) {
  return reference.startsWith('MANUAL:') ? 'Ajout manuel' : reference
}

export default function App() {
  const [expanded, setExpanded] = useState(new Set<string>())
  const [section, setSection] = useState<Section>('overview')
  const [editor, setEditor] = useState<Position | 'new' | null>(null)
  const [tradeEditor, setTradeEditor] = useState<Operation | 'new' | null>(null)
  const [manualQuote, setManualQuote] = useState<Holding | null>(null)
  const [toDelete, setToDelete] = useState<{ id: string; name: string; type: 'position' | 'operation' } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const [quoteKey, setQuoteKey] = useState(readSessionQuoteKey)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState('')
  const [lastChecked, setLastChecked] = useState<number | null>(null)
  const [allocationMode, setAllocationMode] = useState<'category' | 'platform'>('category')
  const heading = useRef<HTMLHeadingElement>(null)
  const quotePending = useRef(false)
  const lastAuto = useRef(0)

  const loaded = useLiveQuery(async () => {
    try {
      const data = await loadPortfolio()
      return { data, view: replay(data), failed: false } as const
    } catch (cause) {
      console.error(cause)
      return { data: emptyData, view: replay(emptyData), failed: true } as const
    }
  })
  const data = loaded?.data ?? emptyData
  const holdings = loaded?.view.holdings ?? []
  const total = summarize(holdings)
  const assets = consolidate(holdings)
  const platforms = [...new Map([...data.positions, ...data.operations].flatMap(item => [
    item.platform, 'destination' in item ? item.destination : undefined,
  ]).filter((name): name is string => Boolean(name)).map(name => [platformKey(name), name])).values()]
  const activePlatforms = [...new Map(holdings.map(item => [platformKey(item.platform), item.platform])).values()]
  const marketByAsset = new Map<string, Mark>()
  for (const mark of data.marks) {
    if (mark.kind !== 'market' || mark.price === null || mark.source === 'Cours manuel') continue
    const previous = marketByAsset.get(mark.target)
    if (!previous || previous.sourceAt < mark.sourceAt || (previous.sourceAt === mark.sourceAt && previous.at <= mark.at)) {
      marketByAsset.set(mark.target, mark)
    }
  }
  const unpriced = holdings.filter(item => item.partiallyValued).length
  const start = firstTrackingDate(data)
  const { display, loading: fxLoading, choose: chooseCurrency } = useCurrency(start)
  const fx = display.reference()
  const symbols = useMemo(() => {
    const byAsset = new Map<string, Holding>()
    for (const holding of holdings) {
      const key = assetKey(holding)
      if (!byAsset.has(key) || (!byAsset.get(key)?.listing && holding.listing)) byAsset.set(key, holding)
    }
    return [...byAsset.values()].map(({ category, reference, name, listing }) => ({ category, reference, name, listing }))
  }, [holdings])
  const dailyPrices = useDailyPrices(symbols)
  const history = useMemo(() => {
    if (!loaded) return []
    const recorded = loaded.view.history.filter(point => point.at >= start)
    return dailyPortfolioHistory(loaded.data, recorded, dailyPrices.flatMap(series => series.marks))
  }, [loaded, start, dailyPrices])
  const latest = useRef({ symbols, quoteKey })
  latest.current = { symbols, quoteKey }
  const trackedAssets = symbols.map(assetKey).sort().join('|')

  function updateQuoteKey(key: string) {
    saveSessionQuoteKey(key)
    setQuoteKey(key.trim())
  }

  async function refreshQuotes(userInitiated: boolean) {
    if (quotePending.current) return
    const { symbols, quoteKey } = latest.current
    if (symbols.length === 0) {
      if (userInitiated) setRefreshStatus('Ajoute d’abord une position pour récupérer un cours.')
      return
    }
    if (!symbols.some(asset => quoteAccess(asset, quoteKey) === 'available')) {
      if (userInitiated) setRefreshStatus('Aucun cours automatique disponible pour ces positions. Tu peux saisir un cours manuellement.')
      return
    }
    lastAuto.current = Date.now()
    quotePending.current = true
    setRefreshing(true)
    try {
      const result = await fetchQuotes(symbols, quoteKey.trim())
      const added = result.marks.length ? await saveMarks(result.marks) : 0
      setRefreshStatus(result.marks.length === 0 ? 'Aucun cours reçu. Les dernières valeurs connues restent affichées.'
        : `${result.marks.length} cours reçu(s) · ${added} nouveau(x).${result.unavailable ? ` ${result.unavailable} actif(s) sans cours reçu.` : ''}`)
    } catch {
      setRefreshStatus('Les cours n’ont pas pu être enregistrés.')
    } finally {
      setLastChecked(Date.now())
      quotePending.current = false
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const auto = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastAuto.current >= quoteInterval
        && latest.current.symbols.some(asset => quoteAccess(asset, latest.current.quoteKey) === 'available')) {
        void refreshQuotes(false)
      }
    }
    auto()
    const interval = window.setInterval(auto, 10 * 1000)
    document.addEventListener('visibilitychange', auto)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', auto)
    }
  }, [trackedAssets, quoteKey])

  function navigate(destination: Section) {
    setSection(destination)
    setMessage('')
    setActionError('')
    requestAnimationFrame(() => heading.current?.focus())
    window.scrollTo({ top: 0 })
  }

  async function confirmDelete() {
    if (!toDelete || deleting) return
    setDeleting(true)
    setActionError('')
    try {
      if (toDelete.type === 'position') await deletePosition(toDelete.id)
      else await deleteOperation(toDelete.id)
      setMessage('Entrée supprimée.')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'La suppression a échoué.')
    } finally {
      setToDelete(null)
      setDeleting(false)
    }
  }

  const assetList = <div className="asset-list">
    {assets.map(asset => {
      const entries = asset.entries
      const listed = catalogEntry(asset.category, asset.reference)
      const lastMarket = marketByAsset.get(asset.key)
      const firstPrice = entries[0].unitPrice
      const sharedPrice = firstPrice !== null && entries.every(entry => !entry.averageUnitPrice && entry.unitPrice?.eq(firstPrice))
        ? firstPrice : null
      const hasValue = entries.some(entry => entry.valuation !== null)
      const chart = expanded.has(asset.key)
        ? assetChartMarks(data, asset.key, dailyPrices.find(series => series.target === asset.key)?.marks ?? []) : null
      return <details className="asset" key={asset.key} onToggle={event => {
        if (event.target !== event.currentTarget) return
        const isOpen = event.currentTarget.open
        setExpanded(previous => {
          if (previous.has(asset.key) === isOpen) return previous
          const next = new Set(previous)
          if (isOpen) next.add(asset.key)
          else next.delete(asset.key)
          return next
        })
      }}>
        <summary>
          <span className="asset-mark" aria-hidden="true">{categories[asset.category].slice(0, 2).toUpperCase()}</span>
          <span className="asset-title"><strong>{asset.name}</strong><small>{[categories[asset.category], listed?.detail, listed?.aliases?.split(' ')[0] ?? labelReference(asset.reference)].filter(Boolean).join(' · ')}</small>
            <small>Détenu <strong className="quantity-inline">{quantity(asset.quantity)}</strong> unité(s)</small></span>
          <span className="asset-platforms">{asset.platformCount} plateforme{asset.platformCount !== 1 ? 's' : ''}</span>
          <span className="asset-value asset-unit"><strong>{sharedPrice !== null ? display.format(sharedPrice, { unit: true }) : '—'}</strong>
            <small>{sharedPrice !== null ? 'Prix unitaire utilisé' : hasValue ? 'Cours dans le détail' : 'Cours indisponible'}</small></span>
          <span className="asset-value asset-total"><strong>{asset.priced ? display.format(asset.amount) : '—'}</strong>
            <small>{entries.some(entry => entry.partiallyValued) ? 'Valeur détenue partielle' : 'Valeur détenue'}</small></span>
          <span className="disclosure"><Icon name="chevron" /></span>
        </summary>
        <div className="asset-body">
          <div className="asset-rollup">
            <span>Quantité totale <strong>{quantity(asset.quantity)}</strong></span>
            <span>Gain latent <strong>{asset.gain === null ? 'Indéterminé' : display.format(asset.gain, { signed: true })}</strong>
              {asset.gain !== null && asset.estimated && <small> · coût estimé</small>}</span>
            <button className="text-button" onClick={() => setManualQuote(entries[0])}>Saisir un cours</button>
          </div>
          {lastMarket?.price != null && <p className="asset-market">
            Dernier cours du marché <strong>{display.format(lastMarket.price, { unit: true })}</strong>
            <small>{lastMarket.source} · {timestamp.format(lastMarket.sourceAt)}</small>
          </p>}
          {entries.map(position => {
            const result = summarize([position])
            return <div className="entry holding-entry" key={position.id}>
              <span><strong>{position.platform}</strong><small>{quantity(position.quantity)} unité(s)</small></span>
              <span><ReadableValue position={position} display={display} />
                {result.gain !== null && <small>Gain latent {display.format(result.gain, { signed: true })}{result.estimated ? ' · estimé' : ''}</small>}</span>
              <span className="cost-summary">{position.cost ? <><strong>{display.format(position.cost.amount)}</strong><small>Coût d’acquisition</small></> : <small>Coût inconnu</small>}</span>
            </div>
          })}
          {chart && <AssetHistory {...chart} name={asset.name} display={display} />}
        </div>
      </details>
    })}
  </div>

  const allocation = allocationMode === 'category'
    ? Object.entries(categories).map(([key, label]) => ({ label, amount: summarize(holdings.filter(item => item.category === key)).amount }))
    : activePlatforms.map(label => ({ label, amount: summarize(holdings.filter(item => platformKey(item.platform) === platformKey(label))).amount }))
  const journal = [
    ...data.positions.map(value => ({ type: 'position' as const, value, at: value.createdAt })),
    ...data.operations.map(value => ({ type: 'operation' as const, value, at: value.at })),
  ].sort((a, b) => b.at - a.at)

  return <>
    <header className="site-header"><div className="shell header-content">
      <button className="brand" onClick={() => navigate('overview')}><span aria-hidden="true">P</span>Portefeuille</button>
      <nav aria-label="Navigation principale">
        {(Object.keys(sections) as Section[]).map(item => <button key={item} className={section === item ? 'selected' : ''}
          aria-current={section === item ? 'page' : undefined} onClick={() => navigate(item)}><Icon name={item} /><span>{sections[item]}</span></button>)}
      </nav>
      <button className="primary header-add" disabled={!loaded || loaded.failed} onClick={() => setEditor('new')}>
        <Icon name="plus" /><span className="wide-label">Ajouter une position</span><span className="short-label">Ajouter</span></button>
    </div></header>

    <main className="shell main">
      <div className="page-title">
        <div><p className="eyebrow">SUIVI DES INVESTISSEMENTS</p><h1 ref={heading} tabIndex={-1}>{sections[section]}</h1></div>
        <div className="page-actions">
          <label className="currency-picker">Devise <select value={display.currency}
            onChange={event => chooseCurrency(event.target.value as Currency)}>
            {currencies.map(currency => <option key={currency}>{currency}</option>)}
          </select></label>
          <span className="local-badge"><Icon name="lock" /> Stockage local</span>
        </div>
      </div>
      {display.currency !== 'CHF' && <p className="hint fx-note" role="status">{fxLoading && !fx ? 'Chargement des taux de change…'
        : fx ? `Taux de référence CHF → ${display.currency} du ${fx.date} · Frankfurter`
          : 'Taux de change indisponible. Tu peux revenir au CHF.'}</p>}
      <div role="status" className={message ? 'status-message' : 'sr-only'}>{message}</div>
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {!loaded ? <p className="panel blank" role="status">Ouverture du portefeuille…</p> : loaded.failed ? (
        <div className="panel blank"><h2>Stockage local indisponible</h2><p>Vérifie que ce navigateur autorise le stockage du site, puis recharge la page.</p></div>
      ) : section === 'data' ? (
        <DataSettings quoteKey={quoteKey} onKey={updateQuoteKey} onRefresh={() => void refreshQuotes(true)} refreshing={refreshing}
          refreshStatus={refreshStatus} lastChecked={lastChecked} onRestored={() => { setRefreshStatus(''); setMessage('Portefeuille restauré.'); lastAuto.current = Date.now() }} />
      ) : section === 'journal' ? (
        <section className="panel"><header className="panel-header section-heading">
          <div><h2>Journal du portefeuille</h2><p>Positions de départ, achats, ventes et transferts.</p></div>
          <button className="primary" onClick={() => setTradeEditor('new')}><Icon name="plus" /> Enregistrer une opération</button>
        </header>
          {journal.length === 0 && <p className="hint journal-empty">Aucune entrée pour l’instant.</p>}
          {journal.map(item => {
            const value = item.value
            const operation = item.type === 'operation' ? item.value : null
            const gain = operation?.kind === 'sell' ? loaded.view.sales.get(operation.id) : undefined
            return <div className="entry journal-entry" key={item.type + '/' + value.id}>
              <span><strong>{value.name}</strong><small>{operation ? operationNames[operation.kind] : 'Position de départ'} · {timestamp.format(item.at)}</small></span>
              <span><strong>{quantity(value.quantity)} unité(s)</strong>
                <small>{value.platform}{operation?.destination ? ' → ' + operation.destination : ''}</small>
                {operation && operation.kind !== 'transfer' && <small>Montant hors frais {display.format(operation.gross, { day: dayKey(operation.at) })}</small>}
                {operation && operation.fee !== '0' && <small>Frais {display.format(operation.fee, { day: dayKey(operation.at) })}</small>}
                {operation?.feeUnits && operation.feeUnits !== '0' && <small>Frais {quantity(operation.feeUnits)} unité(s)</small>}
                {gain !== undefined && <small>Gain réalisé {gain === null ? 'indéterminé' : display.format(gain, { day: dayKey(operation!.at), signed: true })}</small>}</span>
              <span className="entry-actions">
                <button className="text-button" onClick={() => item.type === 'position' ? setEditor(item.value) : setTradeEditor(item.value)}>Modifier</button>
                <button className="text-button danger" onClick={() => setToDelete({ id: value.id, name: value.name, type: item.type })}>Supprimer</button>
              </span>
            </div>
          })}
        </section>
      ) : journal.length === 0 ? (
        <section className="panel empty"><span className="empty-icon"><Icon name={section} /></span><h2>Ajoute ta première position</h2>
          <p>Retrouve tes actions, ETF et cryptos au même endroit.</p>
          <button className="primary" onClick={() => setEditor('new')}><Icon name="plus" /> Ajouter une position</button></section>
      ) : <>
        {section === 'overview' && <>
          <section className="overview-grid" aria-label="Synthèse du portefeuille">
            <div className="panel total-panel">
              <div className="total-header"><h2>Valeur {unpriced ? 'connue' : 'totale'}</h2><span className="chip">{display.currency}</span></div>
              <p className="total-number">{total.priced || holdings.length === 0 ? display.format(total.amount) : '—'}</p>
              <p className="muted counts">{assets.length} actif(s) · {activePlatforms.length} plateforme(s)</p>
              {unpriced > 0 && <p className="notice">{unpriced} position(s) à valoriser.</p>}
              <p className="hint">Gain réalisé connu <strong>{display.format(loaded.view.realized, { signed: true })}</strong>
                {loaded.view.unknownSales > 0 && ` · ${loaded.view.unknownSales} vente(s) sans coût connu`}</p>
              <button className="text-button" onClick={() => void refreshQuotes(true)} disabled={refreshing}>{refreshing ? 'Actualisation…' : 'Actualiser les cours'}</button>
              {lastChecked !== null && <p className="hint">Dernière vérification des cours · {timestamp.format(lastChecked)}</p>}
              {refreshStatus && <p className="hint" role="status">{refreshStatus}</p>}
            </div>
            <div className="panel allocation">
              <div className="section-heading"><h2>Répartition</h2>
                <select aria-label="Répartition par" value={allocationMode} onChange={event => setAllocationMode(event.target.value as 'category' | 'platform')}>
                  <option value="category">Par catégorie</option><option value="platform">Par plateforme</option></select></div>
              {total.amount.lte(0) ? <p className="muted">Disponible avec une valorisation positive.</p> : <ul>
                {allocation.filter(item => item.amount.gt(0)).map(item => {
                  const weight = item.amount.div(total.amount).times(100).toNumber()
                  return <li key={item.label}><div><span>{item.label}</span>
                    <strong>{weight.toLocaleString('fr-CH', { maximumFractionDigits: 1 })} %</strong></div>
                    <div className="bar" aria-hidden="true"><span style={{ width: `${weight}%` }} /></div></li>
                })}
              </ul>}
            </div>
          </section>
          <HistoryChart history={history} display={display} />
        </>}
        <section className="panel positions-panel">
          <header className="panel-header"><h2>Positions consolidées</h2><p>Ouvre un actif pour voir sa courbe, ses cours et le détail par plateforme.</p></header>
          {holdings.length ? assetList : <p className="hint journal-empty">Aucune position ouverte.</p>}
        </section>
      </>}
    </main>
    {editor !== null && <PositionForm current={editor === 'new' ? null : editor} positions={data.positions}
      platforms={platforms} marks={data.marks} display={display} quoteKey={quoteKey.trim()} onClose={() => setEditor(null)}
      onSave={async (position, quote) => { await savePosition(position, editor !== 'new', quote); setMessage('Position enregistrée.') }} />}
    {tradeEditor !== null && <OperationForm current={tradeEditor === 'new' ? null : tradeEditor} data={data} platforms={platforms}
      onClose={() => setTradeEditor(null)} onSave={async operation => {
        await saveOperation(operation, tradeEditor !== 'new'); setMessage('Opération enregistrée.')
      }} />}
    {manualQuote && <ManualQuoteForm asset={manualQuote} onClose={() => setManualQuote(null)} onSave={() => setMessage('Cours enregistré.')} />}
    {toDelete && <ConfirmDialog title="Supprimer cette entrée ?" description={`L’entrée de ${toDelete.name} sera retirée du journal.`}
      confirm="Supprimer" busy={deleting} danger onClose={() => setToDelete(null)} onConfirm={() => void confirmDelete()} />}
  </>
}
