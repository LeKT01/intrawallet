import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deleteOperation, deletePosition, loadPortfolio, saveMarks, saveOperation, savePosition } from './database'
import { consolidate, platformKey, type Position } from './portfolio'
import { dailyPortfolioHistory, firstTrackingDate, isMarketMark, quoteTarget, replay, type Mark, type Operation, type PortfolioData } from './ledger'
import PositionForm from './PositionForm'
import OperationForm from './OperationForm'
import DataSettings, { ConfirmDialog } from './DataSettings'
import { fetchQuotes, instrumentCode, quoteAccess, readSessionQuoteKey, saveSessionQuoteKey, type QuoteKeys } from './quotes'
import { currencies, type Currency } from './currency'
import useCurrency from './useCurrency'
import useDailyPrices from './useDailyPrices'
import { demoLink, demoMode } from './demo'
import Dashboard from './Dashboard'
import { AssetDetail, PortfolioView, type Asset } from './PortfolioViews'
import JournalView, { journalEntries, type JournalItem } from './JournalView'
import { AnalyticsView, PlatformsView } from './AnalysisViews'
import { Icon } from './ui'

const sections = { overview: 'Vue d’ensemble', positions: 'Portefeuille', journal: 'Transactions',
  analytics: 'Analyses', platforms: 'Plateformes', data: 'Paramètres' } as const
type Section = keyof typeof sections
const mobileLabels: Record<Section, string> = {
  overview: 'Vue', positions: 'Actifs', journal: 'Journal', analytics: 'Analyses', platforms: 'Comptes', data: 'Réglages',
}
const descriptions: Record<Section, string> = {
  overview: 'La valeur et les mouvements de tes investissements.',
  positions: 'Tes actions, ETF et cryptomonnaies, regroupés par actif.',
  journal: 'Retrouve et corrige les mouvements de ton portefeuille.',
  analytics: 'Explore le poids de tes positions et leurs gains ou pertes.',
  platforms: 'Consulte et organise tes investissements par établissement.',
  data: 'Gère l’affichage, les sources de marché et tes sauvegardes.',
}
const emptyData: PortfolioData = { positions: [], operations: [], marks: [] }
const quoteInterval = 60000
type Theme = 'light' | 'dark'
type Route = { section: Section; asset?: string }

function readRoute(): Route {
  const [path, key] = window.location.hash.slice(1).split('/')
  if (path === 'positions' && key) {
    try { return { section: 'positions', asset: decodeURIComponent(key) } } catch { /* Fall back to the list. */ }
  }
  return { section: Object.hasOwn(sections, path) ? path as Section : 'overview' }
}

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem('portefeuille.theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* Use system preference. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function initialAutoRefresh() {
  try { return localStorage.getItem('portefeuille.auto-refresh') !== 'off' }
  catch { return true }
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const { section } = route
  const [theme, setTheme] = useState(initialTheme)
  const [autoRefresh, setAutoRefresh] = useState(initialAutoRefresh)
  const [editor, setEditor] = useState<Position | 'new' | null>(null)
  const [tradeEditor, setTradeEditor] = useState<Operation | 'new' | null>(null)
  const [tradeAsset, setTradeAsset] = useState<Asset['entries'][number]>()
  const [toDelete, setToDelete] = useState<{ id: string; name: string; type: 'position' | 'operation' } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const [quoteKey, setQuoteKey] = useState<QuoteKeys>(() => ({ finnhub: demoMode ? '' : readSessionQuoteKey('finnhub'), eodhd: demoMode ? '' : readSessionQuoteKey('eodhd'), coingecko: demoMode ? '' : readSessionQuoteKey('coingecko') }))
  const [refreshing, setRefreshing] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState('')
  const [lastChecked, setLastChecked] = useState<number | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const quotePending = useRef(false)
  const lastAuto = useRef(0)

  const loaded = useLiveQuery(async () => {
    try {
      const data = await loadPortfolio()
      return { data, view: replay(data, [], undefined, true), failed: false } as const
    } catch (cause) {
      console.error(cause)
      return { data: emptyData, view: replay(emptyData), failed: true } as const
    }
  })
  const data = loaded?.data ?? emptyData
  const start = firstTrackingDate(data)
  const needsFx = useMemo(() => data.marks.some(mark => mark.currency === 'EUR' || mark.currency === 'USD')
    || data.positions.some(position => position.valuation?.manual && position.valuation.manual.currency !== 'CHF'), [data.marks, data.positions])
  const { display, loading: fxLoading, choose: chooseCurrency, rateToCHF } = useCurrency(start, needsFx || editor !== null)
  const holdings = useMemo(() => loaded
    ? (needsFx ? replay(loaded.data, [], rateToCHF, true).holdings : loaded.view.holdings) : [], [loaded, needsFx, rateToCHF])
  const assets = useMemo(() => consolidate(holdings), [holdings])
  const platforms = useMemo(() => [...new Map([...(data.platforms ?? []), ...[...data.positions, ...data.operations].flatMap(item => [
    item.platform, 'destination' in item ? item.destination : undefined,
  ])].filter((name): name is string => Boolean(name)).map(name => [platformKey(name), name])).values()]
    .sort((a, b) => a.localeCompare(b, 'fr')), [data])
  const activePlatforms = useMemo(() => [...new Map(holdings.map(item => [platformKey(item.platform), item.platform])).values()], [holdings])
  const marketByAsset = useMemo(() => {
    const result = new Map<string, Mark>()
    for (const mark of data.marks) {
      if (!isMarketMark(mark)) continue
      const previous = result.get(mark.target)
      if (!previous || previous.sourceAt < mark.sourceAt || (previous.sourceAt === mark.sourceAt && previous.at <= mark.at)) result.set(mark.target, mark)
    }
    return result
  }, [data.marks])
  const fx = display.reference()
  const symbols = useMemo(() => {
    const byAsset = new Map<string, (typeof data.positions)[number] | Operation>()
    for (const item of [...data.positions, ...data.operations]) {
      const key = quoteTarget(item)
      const old = byAsset.get(key)
      if (!old || (!old.market && item.market) || (!old.listing && item.listing)) byAsset.set(key, item)
    }
    return [...byAsset.values()].map(({ category, reference, name, listing, isin, market }) => ({ category, reference, name, listing, isin, market }))
  }, [loaded])
  const liveTargets = new Set(holdings.map(quoteTarget))
  const liveSymbols = symbols.filter(asset => liveTargets.has(quoteTarget(asset)))
  const dailyPrices = useDailyPrices(demoMode || !autoRefresh ? [] : symbols, quoteKey.coingecko)
  const historySources = useMemo(() => {
    const series = new Map(dailyPrices.map(item => [item.target, item]))
    return new Map(symbols.flatMap(asset => {
      const target = quoteTarget(asset)
      const code = instrumentCode(asset)
      const match = (code && series.get(target + '@' + code)) || series.get(target)
      return match ? [[target, match] as const] : []
    }))
  }, [dailyPrices, symbols])
  const history = useMemo(() => {
    if (!loaded) return []
    const recorded = loaded.view.history.filter(point => point.at >= start)
    return dailyPortfolioHistory(loaded.data, recorded, [...historySources.values()].flatMap(series => series.marks))
  }, [loaded, start, historySources])
  const latest = useRef({ liveSymbols, symbols, quoteKey, marketByAsset })
  latest.current = { liveSymbols, symbols, quoteKey, marketByAsset }
  const trackedAssets = symbols.map(asset => quoteTarget(asset) + '/' + (asset.listing ?? '') + '/' + (asset.market?.code ?? '')).sort().join('|')
  const activeTargets = liveSymbols.map(quoteTarget).sort().join('|')
  const previousTargets = useRef('')
  const firstCheck = useRef(true)

  function updateQuoteKey(key: QuoteKeys) {
    saveSessionQuoteKey('finnhub', key.finnhub)
    saveSessionQuoteKey('eodhd', key.eodhd)
    saveSessionQuoteKey('coingecko', key.coingecko)
    setQuoteKey(key)
    firstCheck.current = true
    lastAuto.current = 0
  }

  async function refreshQuotes(userInitiated: boolean) {
    if (demoMode || quotePending.current) return
    const { liveSymbols, symbols, quoteKey, marketByAsset } = latest.current
    if (!symbols.length) {
      if (userInitiated) setRefreshStatus('Ajoute une position pour récupérer son cours.')
      return
    }
    const assets = [...liveSymbols, ...symbols.filter(asset => asset.category !== 'crypto' && quoteKey.eodhd
      && !liveSymbols.some(item => quoteTarget(item) === quoteTarget(asset)))]
    const eligible = assets.filter(asset => quoteAccess(asset, quoteKey) === 'available')
    if (!eligible.length) {
      if (userInitiated) setRefreshStatus('Active une source de cotation dans Données pour les titres compatibles.')
      return
    }
    lastAuto.current = Date.now()
    quotePending.current = true
    setRefreshing(true)
    try {
      const result = await fetchQuotes(eligible, quoteKey, { force: userInitiated, opening: firstCheck.current, stale: marketByAsset })
      firstCheck.current = false
      if (!result.checked) return
      if (result.marks.length) await saveMarks(result.marks)
      const count = new Set(result.marks.map(mark => mark.target)).size
      if (count || result.issues.length || userInitiated) {
        setRefreshStatus([
          count ? count + ' actif(s) avec un cours disponible.' : 'Aucun nouveau cours reçu. Les valeurs connues sont conservées.',
          result.issues[0],
        ].filter(Boolean).join(' '))
      }
      setLastChecked(Date.now())
    } catch {
      setRefreshStatus('Les cours n’ont pas pu être enregistrés. Les dernières valeurs connues sont conservées.')
    } finally {
      quotePending.current = false
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (demoMode || !trackedAssets || !autoRefresh) return
    const auto = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastAuto.current >= quoteInterval) void refreshQuotes(false)
    }
    if (activeTargets !== previousTargets.current && liveSymbols.some(asset => !marketByAsset.has(quoteTarget(asset)))) {
      lastAuto.current = 0
    }
    previousTargets.current = activeTargets
    auto()
    const interval = window.setInterval(auto, 15000)
    document.addEventListener('visibilitychange', auto)
    window.addEventListener('focus', auto)
    window.addEventListener('online', auto)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', auto)
      window.removeEventListener('focus', auto)
      window.removeEventListener('online', auto)
    }
  }, [trackedAssets, activeTargets, quoteKey.eodhd, quoteKey.finnhub, quoteKey.coingecko, autoRefresh])

  useEffect(() => {
    const sync = () => {
      setRoute(readRoute())
      window.scrollTo({ top: 0 })
      requestAnimationFrame(() => heading.current?.focus())
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 4500)
    return () => window.clearTimeout(timer)
  }, [message])

  function chooseTheme(next: Theme) {
    setTheme(next)
    try { localStorage.setItem('portefeuille.theme', next) } catch { /* Use in-memory preference. */ }
  }

  function navigate(destination: Section, asset?: string) {
    const hash = '#' + destination + (asset ? '/' + encodeURIComponent(asset) : '')
    if (location.hash !== hash) location.hash = hash
    setActionError('')
  }

  const openAsset = (key: string) => navigate('positions', key)
  const openTrade = (asset?: Asset['entries'][number]) => { setTradeAsset(asset); setTradeEditor('new') }

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

  const journal = useMemo(() => journalEntries(data), [data])
  const selectedAsset = route.asset ? assets.find(asset => asset.key === route.asset) : undefined
  const title = selectedAsset ? 'Fiche de l’actif' : sections[section]
  const ready = Boolean(loaded && !loaded.failed)
  const journalProps = {
    platforms, display, sales: loaded?.view.sales ?? new Map(),
    onEdit: (item: JournalItem) => {
      if (item.type === 'position') setEditor(item.value)
      else { setTradeAsset(undefined); setTradeEditor(item.value) }
    },
    onDelete: (item: JournalItem) => setToDelete({ id: item.value.id, name: item.value.name, type: item.type }),
  }

  return <div className="app-layout">
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('overview')} aria-label="Portefeuille Local, accueil">
        <span className="brand-mark"><Icon name="analytics" /></span><span>Portefeuille<small>LOCAL</small></span>
      </button>
      <p className="sidebar-label">ESPACE INVESTISSEMENTS</p>
      <nav aria-label="Navigation principale">
        {(Object.keys(sections) as Section[]).map(item => <button type="button" key={item} className={section === item ? 'selected' : ''}
          aria-current={section === item ? 'page' : undefined} aria-label={sections[item]} onClick={() => navigate(item)}><Icon name={item} />
          <span className="desktop-nav-label">{sections[item]}</span><span className="mobile-nav-label">{mobileLabels[item]}</span></button>)}
      </nav>
      <div className="sidebar-footer"><Icon name="lock" /><div><strong>Stockage local</strong><small>Sur cet appareil</small></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button className="brand mobile-brand" onClick={() => navigate('overview')} aria-label="Portefeuille Local, accueil">
          <span className="brand-mark"><Icon name="analytics" /></span><span>Portefeuille</span>
        </button>
        <span className="topbar-location"><Icon name={section} /><span>Espace privé</span><Icon name="next" />{sections[section]}</span>
        <div className="topbar-actions">
          <label className="currency-picker"><span className="sr-only">Devise d’affichage</span><select aria-label="Devise d’affichage" value={display.currency}
            onChange={event => chooseCurrency(event.target.value as Currency)}>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select></label>
          <button className="icon-button theme-button" onClick={() => chooseTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          <button className="primary header-add" aria-label="Ajouter un investissement" disabled={!ready} onClick={() => setEditor('new')}><Icon name="plus" />
            <span className="wide-label">Ajouter un investissement</span><span className="short-label">Ajouter</span></button>
        </div>
      </header>

      <main className="workspace-content">
        {demoMode && <aside className="demo-banner" aria-label="Mode démo">
          <div><strong>Mode démo</strong><p>Portefeuille fictif · les cours de cet espace sont simulés.</p></div>
          <a className="secondary" href={demoLink(false)}>Revenir à mon portefeuille</a>
        </aside>}
        <div className="page-title"><div><p className="page-kicker">{section === 'overview' ? 'Suivi des investissements' : 'Portefeuille Local'}</p>
          <h1 ref={heading} tabIndex={-1}>{title}</h1>
          <p>{selectedAsset ? 'Cours de marché, positions détenues et transactions.' : descriptions[section]}</p></div></div>
        {display.currency !== 'CHF' && <p className="hint fx-note" role="status">{fxLoading && !fx ? 'Chargement des taux de change…'
          : fx ? `Taux ${demoMode ? 'simulé' : 'de référence BCE'} CHF → ${display.currency} du ${fx.date}`
            : 'Taux de change indisponible. Tu peux revenir au CHF.'}</p>}
        <div role="status" className={message ? 'status-message toast' : 'sr-only'}>{message}</div>
        {actionError && <p className="error" role="alert">{actionError}</p>}

        {!loaded ? <div className="panel blank loading-panel" role="status" aria-busy="true">
          <span className="loading-line" aria-hidden="true" /><p>Ouverture du portefeuille…</p>
        </div>
          : loaded.failed ? <div className="panel blank"><h2>Stockage local indisponible</h2><p>Autorise le stockage du site dans ton navigateur, puis recharge la page.</p></div>
          : section === 'data' ? <>
            <section className="panel preference-panel">
              <h2>Préférences</h2><div className="filter-bar">
                <label>Thème<select value={theme} onChange={event => chooseTheme(event.target.value as Theme)}><option value="light">Clair</option><option value="dark">Sombre</option></select></label>
                <label>Devise du portefeuille<select value={display.currency} onChange={event => chooseCurrency(event.target.value as Currency)}>
                  {currencies.map(currency => <option key={currency}>{currency}</option>)}</select></label>
                <label>Actualisation des cours<select value={autoRefresh ? 'auto' : 'manual'} disabled={demoMode} onChange={event => {
                  const enabled = event.target.value === 'auto'
                  setAutoRefresh(enabled)
                  try { localStorage.setItem('portefeuille.auto-refresh', enabled ? 'on' : 'off') } catch { /* Use in-memory preference. */ }
                }}><option value="auto">Automatique</option><option value="manual">À la demande</option></select></label>
              </div>
              <button className="text-button" onClick={() => navigate('platforms')}>Gérer mes plateformes <Icon name="next" /></button>
            </section>
            <DataSettings quoteKey={quoteKey} onKey={updateQuoteKey} onRefresh={() => void refreshQuotes(true)} refreshing={refreshing}
              refreshStatus={refreshStatus} lastChecked={lastChecked} onRestored={() => {
                setRefreshStatus(''); setMessage('Portefeuille restauré.'); lastAuto.current = 0; firstCheck.current = true
              }} />
          </>
          : section === 'journal' ? <JournalView {...journalProps} items={journal} onAdd={() => openTrade()} />
          : section === 'platforms' ? <PlatformsView holdings={holdings} platforms={platforms} quotes={marketByAsset}
            display={display} onOpen={openAsset} onSaved={() => setMessage('Plateforme enregistrée.')} />
          : section === 'analytics' ? <AnalyticsView holdings={holdings} history={history} display={display} />
          : selectedAsset ? <AssetDetail key={selectedAsset.key} asset={selectedAsset} data={data}
            series={historySources.get(selectedAsset.key)} quote={marketByAsset.get(selectedAsset.key)}
            display={display} cryptoKey={quoteKey.coingecko} onBack={() => navigate('positions')}
            onTrade={() => openTrade(selectedAsset.entries[0])}
            journal={<JournalView {...journalProps} items={journal.filter(item => quoteTarget(item.value) === selectedAsset.key)} filters={false} />} />
          : !journal.length ? <section className="panel empty start-card"><span className="empty-icon"><Icon name="positions" /></span>
            <h2>Ajoute ton premier investissement</h2><p>Rassemble les actifs que tu détiens déjà pour suivre leur valeur et tes performances.</p>
            <div className="empty-actions"><button className="primary" onClick={() => setEditor('new')}><Icon name="plus" /> Ajouter une position</button>
              {!demoMode && <a className="secondary" href={demoLink(true)}>Ouvrir la démo</a>}</div>
          </section>
          : section === 'positions' ? <PortfolioView holdings={holdings} platforms={platforms} display={display} quotes={marketByAsset} onOpen={openAsset} />
          : <Dashboard assets={assets} holdings={holdings} platforms={activePlatforms} history={history}
            intraday={loaded.view.intraday} display={display} quotes={marketByAsset} realized={loaded.view.realized} unknownSales={loaded.view.unknownSales}
            lastChecked={lastChecked} refreshing={refreshing} refreshStatus={refreshStatus} demo={demoMode}
            onRefresh={() => void refreshQuotes(true)} onOpen={openAsset} onPortfolio={() => navigate('positions')} onAnalytics={() => navigate('analytics')} />}
      </main>
    </div>
    {editor !== null && <PositionForm current={editor === 'new' ? null : editor} positions={data.positions}
      platforms={platforms} marks={data.marks} display={display} currentRate={rateToCHF} quoteKey={quoteKey}
      onConfigure={() => { setEditor(null); navigate('data') }} onClose={() => setEditor(null)}
      onSave={async (position, quote) => { await savePosition(position, editor !== 'new', quote); setMessage('Position enregistrée.') }} />}
    {tradeEditor !== null && <OperationForm current={tradeEditor === 'new' ? null : tradeEditor} initialAsset={tradeAsset}
      data={data} platforms={platforms} marketKey={demoMode ? undefined : quoteKey.eodhd} onClose={() => setTradeEditor(null)}
      onSave={async operation => { await saveOperation(operation, tradeEditor !== 'new'); setMessage('Transaction enregistrée.') }} />}
    {toDelete && <ConfirmDialog title="Supprimer cette entrée ?" description={`L’entrée de ${toDelete.name} sera retirée du journal.`}
      confirm="Supprimer" busy={deleting} danger onClose={() => setToDelete(null)} onConfirm={() => void confirmDelete()} />}
  </div>
}
