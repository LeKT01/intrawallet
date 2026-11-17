import { flushSync } from 'react-dom'
import { closeAnimatedDialog, usePageReveal, useSlidingIndicator } from './motion'
import Appearance, { useAppearance } from './Appearance'
import { nativeApp } from './runtime'
import useAndroidUpdate from './useAndroidUpdate'
import InstallHelp from './InstallHelp'
import { Decimal } from 'decimal.js'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deleteInvestmentGroup, saveInvestmentGroup, deleteOperation, deletePosition, loadPortfolio, saveMarks, saveOperation, savePosition } from './database'
import { consolidate, platformKey, type Position } from './portfolio'
import { compareMarketMarks, dailyPortfolioHistory, firstTrackingDate, isMarketMark, quoteTarget, replay, type Mark, type Operation, type PortfolioData } from './ledger'
import PositionForm from './PositionForm'
import OperationForm from './OperationForm'
import DataSettings, { ConfirmDialog } from './DataSettings'
import { fetchQuotes, instrumentCode, quoteAccess, readSessionQuoteKey, saveSessionQuoteKey, type QuoteKeys } from './quotes'
import { currencies, type Currency } from './currency'
import useCurrency from './useCurrency'
import useDailyPrices from './useDailyPrices'
import { demoLink, demoMode } from './demo'
import { groupCapital, groupLedger, groupValue, type GroupAsset, type InvestmentGroup } from './groups'
import Dashboard from './Dashboard'
import { AssetDetail, PortfolioView, type Asset } from './PortfolioViews'
import JournalView, { journalEntries, type JournalItem } from './JournalView'
import { AnalyticsView, PlatformsView } from './AnalysisViews'
import { Icon, type IconName } from './ui'

const DiagnosticView = lazy(() => import('./DiagnosticView'))
const GroupDetail = lazy(() => import('./GroupViews').then(module => ({ default: module.GroupDetail })))
const GroupEditor = lazy(() => import('./GroupViews').then(module => ({ default: module.GroupEditor })))
const GroupList = lazy(() => import('./GroupViews').then(module => ({ default: module.GroupList })))

const sections = { overview: 'Vue d’ensemble', positions: 'Portefeuille', journal: 'Transactions',
  analytics: 'Analyses', platforms: 'Plateformes', data: 'Paramètres', space: 'Espace', diagnostic: 'Diagnostic' } as const
type Section = keyof typeof sections
const spaceSections: Section[] = ['space', 'journal', 'platforms', 'data', 'diagnostic']
const spaceGroups: { title: string; links: { label: string; description: string; section: Section; anchor?: string }[] }[] = [
  { title: 'Portefeuille', links: [
    { label: 'Transactions', description: 'Historique des achats, ventes et transferts', section: 'journal' },
    { label: 'Plateformes', description: 'Comptes et établissements', section: 'platforms' },
    { label: 'Sauvegarde locale', description: 'Exporter ou restaurer les données', section: 'data', anchor: 'backup' },
  ] },
  { title: 'Préférences', links: [
    { label: 'Paramètres', description: 'Devises et cotations', section: 'data' },
    { label: 'Installation', description: 'Installer IntraWallet sur iPhone ou Android', section: 'data', anchor: 'installation' },
    { label: 'Apparence', description: 'Thème clair, sombre ou système', section: 'data', anchor: 'appearance' },
    { label: 'Diagnostic', description: 'Vérifier le stockage, les cours et les calculs', section: 'diagnostic' },
  ] },
]
const descriptions: Record<Section, string> = {
  overview: 'La valeur et les mouvements de tes investissements.',
  positions: 'Tes actions, ETF et cryptomonnaies, regroupés par actif.',
  journal: 'Retrouve et corrige les mouvements de ton portefeuille.',
  analytics: 'Explore le poids de tes positions et leurs gains ou pertes.',
  platforms: 'Consulte et organise tes investissements par établissement.',
  data: 'Gère l’affichage, les sources de marché et tes sauvegardes.',
  space: 'Gère ton portefeuille et tes préférences.',
  diagnostic: 'Vérifie les composants d’IntraWallet à la demande.',
}
const emptyData: PortfolioData = { positions: [], operations: [], marks: [] }
const quoteInterval = 60000
type Route = { section: Section; asset?: string; anchor?: string }

function readRoute(): Route {
  const [path, key] = window.location.hash.slice(1).split('/')
  if (path === 'positions' && key) {
    try { return { section: 'positions', asset: decodeURIComponent(key) } } catch { /* Fall back to the list. */ }
  }
  if (path === 'data' && (key === 'appearance' || key === 'backup' || key === 'installation')) return { section: path, anchor: key }
  if (path === 'platforms' && key === 'new') return { section: path, anchor: key }
  return { section: Object.hasOwn(sections, path) ? path as Section : 'overview' }
}

function initialAutoRefresh() {
  try { return localStorage.getItem('portefeuille.auto-refresh') !== 'off' }
  catch { return true }
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const { section } = route
  const appearance = useAppearance()
  const [autoRefresh, setAutoRefresh] = useState(initialAutoRefresh)
  const [consolidatedView, setConsolidatedView] = useState(false)
  const [groupEditor, setGroupEditor] = useState<InvestmentGroup | 'new' | null>(null)
  const [groupPosition, setGroupPosition] = useState<{ group: InvestmentGroup; position: Position | null } | null>(null)
  const [groupTrade, setGroupTrade] = useState<{ group: InvestmentGroup; operation: Operation | null; asset?: GroupAsset } | null>(null)
  const [groupDelete, setGroupDelete] = useState<InvestmentGroup | null>(null)
  const [editor, setEditor] = useState<Position | 'new' | null>(null)
  const [tradeEditor, setTradeEditor] = useState<Operation | 'new' | null>(null)
  const [tradeAsset, setTradeAsset] = useState<Asset['entries'][number]>()
  const [toDelete, setToDelete] = useState<{ id: string; name: string; type: 'position' | 'operation' } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const [quoteKey, setQuoteKey] = useState<QuoteKeys>(() => ({ finnhub: demoMode ? '' : readSessionQuoteKey('finnhub'), eodhd: demoMode ? '' : readSessionQuoteKey('eodhd'), coingecko: demoMode ? '' : readSessionQuoteKey('coingecko') }))
  const [online, setOnline] = useState(() => navigator.onLine)
  const androidUpdate = useAndroidUpdate(nativeApp && !demoMode, online)
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])
  const [refreshing, setRefreshing] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState('')
  const [lastChecked, setLastChecked] = useState<number | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const actionSheet = useRef<HTMLDialogElement>(null)
  const railIndicator = useSlidingIndicator(section)
  const bottomIndicator = useSlidingIndicator(section)

  function openAddActions(trigger: HTMLButtonElement) {
    const dialog = actionSheet.current
    if (!dialog || dialog.open) return
    const bounds = trigger.getBoundingClientRect()
    dialog.style.setProperty('--add-top', Math.ceil(bounds.bottom + 8) + 'px')
    dialog.style.setProperty('--add-right', Math.max(12, Math.round(window.innerWidth - bounds.right)) + 'px')
    trigger.focus({ preventScroll: true })
    dialog.showModal()
  }
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
  const groups = useMemo(() => data.groups ?? [], [data.groups])
  const groupAssets = useMemo(() => groups.flatMap(group => [...group.positions, ...group.operations]), [groups])
  const start = useMemo(() => firstTrackingDate(data), [data])
  const needsFx = useMemo(() => data.marks.some(mark => mark.currency === 'EUR' || mark.currency === 'USD')
    || data.positions.some(position => position.valuation?.manual && position.valuation.manual.currency !== 'CHF'), [data.marks, data.positions])
  const { display, loading: fxLoading, choose: chooseCurrency, rateToCHF } = useCurrency(start, needsFx || editor !== null || groupPosition !== null || groups.some(group => group.currency !== 'CHF'))
  const holdings = useMemo(() => loaded
    ? (needsFx ? replay(loaded.data, [], rateToCHF, true).holdings : loaded.view.holdings) : [], [loaded, needsFx, rateToCHF])
  const groupStats = useMemo(() => groups.map(group => groupValue(group, data.marks, rateToCHF)), [groups, data.marks, rateToCHF])
  const allHoldings = useMemo(() => [...holdings, ...groupStats.flatMap(stats => stats.holdings)], [holdings, groupStats])
  const declaredGroups = groupStats.flatMap((stats, index) => groups[index].mode === 'estimate'
    ? [{ name: groups[index].name, platform: groups[index].platform, value: stats.value }] : [])
  const declaredCapital = groups.reduce((sum, group) => {
    if (sum === null || group.mode !== 'estimate') return sum
    const rate = rateToCHF(group.currency)
    return rate ? sum.plus(groupCapital(group).times(rate)) : null
  }, new Decimal(0) as Decimal | null)
  const emptyExactGroups = groups.filter((group, index) => group.mode === 'exact' && !groupStats[index].holdings.length).length
  const consolidatedAssets = useMemo(() => consolidate(allHoldings), [allHoldings])
  const assets = useMemo(() => consolidate(holdings), [holdings])
  const platforms = useMemo(() => [...new Map([...(data.platforms ?? []), ...[...data.positions, ...data.operations, ...groups].flatMap(item => [
    item.platform, 'destination' in item ? item.destination : undefined,
  ])].filter((name): name is string => Boolean(name)).map(name => [platformKey(name), name])).values()]
    .sort((a, b) => a.localeCompare(b, 'fr')), [data, groups])
  const activePlatforms = useMemo(() => [...new Map([...allHoldings, ...groups].map(item => [platformKey(item.platform), item.platform])).values()], [allHoldings, groups])
  const marketByAsset = useMemo(() => {
    const result = new Map<string, Mark>()
    for (const mark of data.marks) {
      if (!isMarketMark(mark)) continue
      const previous = result.get(mark.target)
      if (!previous || compareMarketMarks(mark, previous) >= 0) result.set(mark.target, mark)
    }
    return result
  }, [data.marks])
  const fx = display.reference()
  const symbols = useMemo(() => {
    const byAsset = new Map<string, (typeof data.positions)[number] | Operation>()
    for (const item of [...data.positions, ...data.operations, ...groupAssets]) {
      const key = quoteTarget(item)
      const old = byAsset.get(key)
      if (!old || (!old.market && item.market) || (!old.listing && item.listing)) byAsset.set(key, item)
    }
    return [...byAsset.values()].map(({ category, reference, name, listing, isin, market }) => ({ category, reference, name, listing, isin, market }))
  }, [loaded, groupAssets])
  const liveSymbols = useMemo(() => {
    const liveTargets = new Set(allHoldings.map(quoteTarget))
    return symbols.filter(asset => liveTargets.has(quoteTarget(asset)))
  }, [allHoldings, symbols])
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
  const trackedAssets = useMemo(() => symbols.map(asset => quoteTarget(asset) + '/' + (asset.listing ?? '') + '/' + (asset.market?.code ?? '')).sort().join('|'), [symbols])
  const activeTargets = useMemo(() => liveSymbols.map(quoteTarget).sort().join('|'), [liveSymbols])
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
    if (!navigator.onLine) {
      if (userInitiated) setRefreshStatus('Hors ligne. Les derniers cours enregistrés sont conservés.')
      return
    }
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
      const added = result.marks.length ? await saveMarks(result.marks) : 0
      const count = new Set(result.marks.map(mark => mark.target)).size
      if (count || result.issues.length || userInitiated) {
        setRefreshStatus([
          count && added ? count + ' actif(s) avec un cours disponible.' : 'Aucun nouveau cours reçu. Les valeurs connues sont conservées.',
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
    let transition: ViewTransition | undefined
    let request = 0
    const sync = () => {
      transition?.skipTransition()
      const version = ++request
      const next = readRoute()
      const mobile = window.matchMedia('(max-width: 900px)').matches
      const apply = () => {
        if (version !== request) return
        actionSheet.current?.close()
        setEditor(null); setTradeEditor(null); setToDelete(null)
        setRoute(next)
        if (!mobile) window.scrollTo({ top: 0 })
        if (!next.anchor) requestAnimationFrame(() => {
          if (version === request) heading.current?.focus({ preventScroll: mobile })
        })
      }
      if (!mobile && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        transition = document.startViewTransition(() => flushSync(apply))
        void transition.ready.catch(() => undefined)
      } else apply()
    }
    window.addEventListener('hashchange', sync)
    return () => {
      request++
      transition?.skipTransition()
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  const ready = Boolean(loaded && !loaded.failed)
  const page = usePageReveal(route.section + '/' + (route.asset ?? ''), ready)
  useEffect(() => {
    document.querySelector('.workspace')?.scrollTo({ top: 0 })
    if (route.section !== 'data' || !route.anchor || !ready) return
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(route.anchor!)
      target?.scrollIntoView({ block: 'start' })
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [route, ready])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 4500)
    return () => window.clearTimeout(timer)
  }, [message])

  function navigate(destination: Section, detail?: string) {
    actionSheet.current?.close()
    const hash = '#' + destination + (detail ? '/' + encodeURIComponent(detail) : '')
    if (location.hash !== hash) location.hash = hash
    setActionError('')
  }

  const openAsset = (key: string) => {
    const groupIndex = assets.some(asset => asset.key === key) ? -1
      : groupStats.findIndex(stats => stats.holdings.some(holding => quoteTarget(holding) === key))
    navigate('positions', groupIndex < 0 ? key : 'group/' + groups[groupIndex].id)
  }
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
  const selectedGroup = route.asset?.startsWith('group/') ? groups.find(group => 'group/' + group.id === route.asset) : undefined
  const groupDisplay = { marks: data.marks, display, rate: rateToCHF }
  const openGroup = (id: string) => navigate('positions', 'group/' + id)
  const createGroup = () => setGroupEditor('new')
  const selectedAsset = route.asset ? assets.find(asset => asset.key === route.asset) : undefined
  const title = selectedGroup ? 'Portefeuille groupé' : selectedAsset ? 'Fiche de l’actif' : sections[section]
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
      <button className="brand" onClick={() => navigate('overview')} aria-label="IntraWallet, accueil">
        <img className="brand-mark" src={import.meta.env.BASE_URL + 'app-icons/intrawallet-wallet-192.png'} alt="" />
      </button>
      <nav aria-label="Navigation principale" className="sliding-nav" ref={railIndicator}>
        {(Object.keys(sections) as Section[]).map(item => <button type="button" key={item} className={section === item ? 'selected' : ''}
          aria-current={section === item ? 'page' : undefined} aria-label={sections[item]} onClick={() => navigate(item)}><Icon name={item} />
          <span className="rail-tooltip" aria-hidden="true">{sections[item]}</span></button>)}
      </nav>
      <button type="button" className="sidebar-footer" aria-label="Sauvegarde locale" onClick={() => navigate('data', 'backup')}><Icon name="lock" /><span className="rail-tooltip" aria-hidden="true">Sauvegarde locale</span></button>
    </aside>
    <nav className="mobile-nav sliding-nav" aria-label="Navigation mobile" ref={bottomIndicator}>
      <button type="button" aria-current={section === 'overview' ? 'page' : undefined} onClick={() => navigate('overview')}><Icon name="overview" /><span>Accueil</span></button>
      <button type="button" aria-current={section === 'positions' ? 'page' : undefined} onClick={() => navigate('positions')}><Icon name="positions" /><span>Portefeuille</span></button>
      <button type="button" className="mobile-add" aria-label="Ouvrir les actions d’ajout" aria-haspopup="dialog"
        aria-controls="action-sheet" disabled={!ready} onClick={event => openAddActions(event.currentTarget)}><Icon name="plus" /></button>
      <button type="button" aria-current={section === 'analytics' ? 'page' : undefined} onClick={() => navigate('analytics')}><Icon name="analytics" /><span>Analyses</span></button>
      <button type="button" aria-current={section === 'space' ? 'page' : undefined} className={spaceSections.includes(section) ? 'selected' : undefined}
        onClick={() => navigate('space')}><Icon name="space" /><span>Espace</span></button>
    </nav>
    <dialog id="action-sheet" className="add-actions-dialog" ref={actionSheet} aria-labelledby="action-title"
      onCancel={event => { event.preventDefault(); void closeAnimatedDialog(event.currentTarget) }}
      onClick={event => {
        if (event.target !== event.currentTarget) return
        const { left, top, right, bottom } = event.currentTarget.getBoundingClientRect()
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) void closeAnimatedDialog(event.currentTarget)
      }}>
      <div className="sheet-content">
        <div className="section-heading"><h2 id="action-title">Ajouter</h2><button className="icon-button" aria-label="Fermer les actions"
          onClick={() => { if (actionSheet.current) void closeAnimatedDialog(actionSheet.current) }}><Icon name="close" /></button></div>
        {([
          ['positions', 'Ajouter un investissement', () => setEditor('new')],
          ['group', 'Créer un portefeuille groupé', createGroup],
          ['journal', 'Enregistrer une transaction', () => openTrade()],
          ['platforms', 'Ajouter une plateforme', () => navigate('platforms', 'new')],
        ] as const).map(([icon, label, action]) => <button type="button" key={icon} className="sheet-link"
          onClick={() => { actionSheet.current?.close(); action() }}><Icon name={icon} /><span>{label}</span><Icon name="next" /></button>)}
      </div>
    </dialog>
    <div className="workspace">
      <header className="topbar">
        <button className="brand mobile-brand" onClick={() => navigate('overview')} aria-label="IntraWallet, accueil">
          <img className="brand-mark" src={import.meta.env.BASE_URL + 'app-icons/intrawallet-wallet-192.png'} alt="" /><span>IntraWallet</span>
        </button>
        <span className="topbar-location"><strong>IntraWallet</strong><span>Portefeuille local</span></span>
        <div className="topbar-actions">
          <label className="currency-picker"><span className="sr-only">Devise d’affichage</span><select aria-label="Devise d’affichage" value={display.currency}
            onChange={event => chooseCurrency(event.target.value as Currency)}>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select></label>
          <button className="primary header-add" aria-haspopup="dialog" aria-controls="action-sheet" disabled={!ready}
            onClick={event => openAddActions(event.currentTarget)}><Icon name="plus" /> Ajouter un investissement</button>
        </div>
      </header>

      <main className="workspace-content" ref={page}>
        {androidUpdate.update && <section className="panel preference-panel" aria-label="Mise à jour Android">
          <p role="status">IntraWallet {androidUpdate.update.version} est disponible.</p>
          <a className="secondary" href={androidUpdate.update.url}>Ouvrir la release GitHub</a>
        </section>}
        {!online && <p className="panel preference-panel" role="status">Hors ligne · données locales et derniers cours enregistrés.</p>}
        {demoMode && <aside className="demo-banner" aria-label="Mode démo">
          <div><strong>Mode démo</strong><p>Portefeuille fictif · les cours de cet espace sont simulés.</p></div>
          <a className="secondary" href={demoLink(false)}>Revenir à mon portefeuille</a>
        </aside>}
        <div className="page-title"><div>
          <h1 ref={heading} tabIndex={-1}>{title}</h1>
          {section !== 'overview' && <p>{selectedAsset ? 'Cours de marché, positions détenues et transactions.' : descriptions[section]}</p>}</div></div>
        {display.currency !== 'CHF' && <p className="hint fx-note" role="status">{fxLoading && !fx ? 'Chargement des taux de change…'
          : fx ? `Taux ${demoMode ? 'simulé' : 'de référence BCE'} CHF → ${display.currency} du ${fx.date}`
            : 'Taux de change indisponible. Tu peux revenir au CHF.'}</p>}
        <div role="status" className={message ? 'status-message toast' : 'sr-only'}>{message}</div>
        {actionError && <p className="error" role="alert">{actionError}</p>}

        {section === 'diagnostic' ? <Suspense fallback={<p role="status">Chargement du diagnostic…</p>}><DiagnosticView quoteKeys={quoteKey} /></Suspense>
          : section === 'space' ? <div className="space-grid">{spaceGroups.map(group => <section className="panel space-panel" key={group.title}>
            <h2>{group.title}</h2>{group.links.map(link => <a className="space-link" key={link.label}
              href={'#' + link.section + (link.anchor ? '/' + link.anchor : '')}>
              <span className="platform-icon"><Icon name={(link.anchor === 'backup' ? 'lock' : link.section) as IconName} /></span>
              <span><strong>{link.label}</strong><small>{link.description}</small></span><Icon name="next" />
            </a>)}</section>)}</div>
          : !loaded ? <div className="panel blank loading-panel" role="status" aria-busy="true">
          <span className="loading-line" aria-hidden="true" /><p>Ouverture du portefeuille…</p>
        </div>
          : loaded.failed ? <div className="panel blank"><h2>Stockage local indisponible</h2><p>Autorise le stockage du site dans ton navigateur, puis recharge la page.</p></div>
          : section === 'data' ? <>
            <Appearance appearance={appearance} />
            <section className="panel preference-panel">
              <h2>Devise et cotations</h2><div className="filter-bar">
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
            <InstallHelp androidUpdate={androidUpdate} online={online} />
            <DataSettings quoteKey={quoteKey} onKey={updateQuoteKey} onRefresh={() => void refreshQuotes(true)} refreshing={refreshing}
              refreshStatus={refreshStatus} lastChecked={lastChecked} onRestored={() => {
                setRefreshStatus(''); setMessage('Portefeuille restauré.'); lastAuto.current = 0; firstCheck.current = true
              }} />
          </>
          : section === 'journal' ? <JournalView {...journalProps} items={journal} onAdd={() => openTrade()} />
          : section === 'platforms' ? <PlatformsView key={route.anchor ?? 'list'} startCreating={route.anchor === 'new'}
            onCreateClosed={() => {
              if (route.anchor !== 'new') return
              window.history.replaceState(null, '', '#platforms')
              setRoute({ section: 'platforms' })
              requestAnimationFrame(() => heading.current?.focus())
            }} holdings={allHoldings} declaredGroups={declaredGroups} platforms={platforms} quotes={marketByAsset}
            display={display} onOpen={openAsset} onSaved={() => setMessage('Plateforme enregistrée.')} />
          : section === 'analytics' ? <AnalyticsView holdings={allHoldings} history={history} display={display} individualHistory={groups.length > 0} />
          : selectedGroup ? <Suspense fallback={<p role="status">Chargement du groupe…</p>}><GroupDetail key={selectedGroup.id} group={selectedGroup} {...groupDisplay}
            historical={[...new Set([...selectedGroup.positions, ...selectedGroup.operations].map(quoteTarget))]
              .flatMap(target => historySources.get(target)?.marks ?? [])}
            onBack={() => navigate('positions')} onEdit={() => setGroupEditor(selectedGroup)} onRemove={() => setGroupDelete(selectedGroup)}
            onSave={next => saveInvestmentGroup(next, selectedGroup)}
            onPosition={id => setGroupPosition({ group: selectedGroup, position: selectedGroup.positions.find(item => item.id === id) ?? null })}
            onTrade={(asset, id) => setGroupTrade({ group: selectedGroup, asset, operation: selectedGroup.operations.find(item => item.id === id) ?? null })} /></Suspense>
          : selectedAsset ? <AssetDetail key={selectedAsset.key} asset={selectedAsset} data={data}
            series={historySources.get(selectedAsset.key)} quote={marketByAsset.get(selectedAsset.key)}
            display={display} cryptoKey={quoteKey.coingecko} onBack={() => navigate('positions')}
            onTrade={() => openTrade(selectedAsset.entries[0])}
            journal={<JournalView {...journalProps} items={journal.filter(item => quoteTarget(item.value) === selectedAsset.key)} filters={false} />} />
          : section === 'positions' ? <div className="detail-stack">
            <Suspense fallback={null}><GroupList groups={groups} {...groupDisplay} onCreate={createGroup} onOpen={openGroup} /></Suspense>
            {groups.length > 0 && <div className="segments" role="group" aria-label="Périmètre des positions">
              <button type="button" className="secondary segment-button" aria-pressed={!consolidatedView} onClick={() => setConsolidatedView(false)}>Positions individuelles</button>
              <button type="button" className="secondary segment-button" aria-pressed={consolidatedView} onClick={() => setConsolidatedView(true)}>Toutes les positions exactes</button>
            </div>}
            <PortfolioView holdings={consolidatedView ? allHoldings : holdings} platforms={platforms} display={display} quotes={marketByAsset} onOpen={openAsset} onAdd={() => setEditor('new')} />
          </div>
          : !journal.length && !groups.length ? <section className="panel empty start-card"><span className="empty-icon"><Icon name="positions" /></span>
            <h2>Ajoute ton premier investissement</h2><p>Rassemble les actifs que tu détiens déjà pour suivre leur valeur et tes performances.</p>
            <div className="empty-actions"><button className="primary" onClick={() => setEditor('new')}><Icon name="plus" /> Ajouter un investissement</button>
              <button className="secondary" onClick={createGroup}>Créer un portefeuille groupé</button>
              {!demoMode && <a className="secondary" href={demoLink(true)}>Ouvrir la démo</a>}</div>
          </section>
          : <><Dashboard assets={consolidatedAssets} holdings={allHoldings} platforms={activePlatforms} history={history} groupCount={groups.length} declaredCapital={declaredCapital}
            recent={journal.slice(0, 5)} onJournal={() => navigate('journal')}
            declaredGroups={declaredGroups} emptyExactGroups={emptyExactGroups}
            intraday={loaded.view.intraday} display={display} quotes={marketByAsset} realized={loaded.view.realized} unknownSales={loaded.view.unknownSales}
            lastChecked={lastChecked} refreshing={refreshing} refreshStatus={refreshStatus} demo={demoMode}
            onRefresh={() => void refreshQuotes(true)} onOpen={openAsset} onPortfolio={() => navigate('positions')}
            groupsContent={groups.length > 0 ? <Suspense fallback={null}><GroupList groups={groups} {...groupDisplay} onCreate={createGroup} onOpen={openGroup} /></Suspense> : undefined} /></>}
      </main>
    </div>
    {groupEditor !== null && <Suspense fallback={null}><GroupEditor current={groupEditor === 'new' ? undefined : groupEditor} platforms={platforms}
      marketKey={demoMode ? undefined : quoteKey.eodhd} onClose={() => setGroupEditor(null)}
      onSave={async group => {
        await saveInvestmentGroup(group, groupEditor === 'new' ? undefined : groupEditor)
        setMessage('Portefeuille groupé enregistré.')
        openGroup(group.id)
      }} /></Suspense>}
    {groupPosition && <PositionForm current={groupPosition.position} fixedCategory="etf" fixedPlatform={groupPosition.group.platform}
      positions={groupPosition.group.positions} platforms={platforms} marks={data.marks} display={display} currentRate={rateToCHF} quoteKey={quoteKey}
      onConfigure={() => { setGroupPosition(null); navigate('data') }} onClose={() => setGroupPosition(null)}
      onSave={async (position, quote) => {
        const { group } = groupPosition
        await saveInvestmentGroup({ ...group, positions: [...group.positions.filter(item => item.id !== position.id), position] }, group, quote)
      }} />}
    {groupTrade && <OperationForm current={groupTrade.operation} initialAsset={groupTrade.asset} fixedPlatform={groupTrade.group.platform}
      data={groupLedger(groupTrade.group, data.marks)} platforms={platforms} marketKey={demoMode ? undefined : quoteKey.eodhd}
      onClose={() => setGroupTrade(null)} onSave={async operation => {
        const { group } = groupTrade
        await saveInvestmentGroup({ ...group, operations: [...group.operations.filter(item => item.id !== operation.id), operation] }, group)
      }} />}
    {groupDelete && <ConfirmDialog title="Supprimer le portefeuille groupé ?" description="Ses positions, transactions et relevés seront supprimés."
      confirm="Supprimer" busy={deleting} danger onClose={() => setGroupDelete(null)} onConfirm={() => {
        setDeleting(true)
        void deleteInvestmentGroup(groupDelete).then(() => { setGroupDelete(null); navigate('positions'); setMessage('Portefeuille groupé supprimé.') })
          .catch(cause => setMessage(cause instanceof Error ? cause.message : 'Suppression impossible.')).finally(() => setDeleting(false))
      }} />}
    {editor !== null && <PositionForm current={editor === 'new' ? null : editor} positions={data.positions}
      platforms={platforms} marks={data.marks} display={display} currentRate={rateToCHF} quoteKey={quoteKey}
      onConfigure={() => { setEditor(null); navigate('data') }} onClose={() => setEditor(null)}
      onSave={async (position, quote) => { await savePosition(position, editor !== 'new', quote); setMessage('Position enregistrée.') }} />}
    {tradeEditor !== null && <OperationForm current={tradeEditor === 'new' ? null : tradeEditor} initialAsset={tradeAsset}
      data={data} platforms={platforms} marketKey={demoMode ? undefined : quoteKey.eodhd} cryptoKey={demoMode ? undefined : quoteKey.coingecko} onClose={() => setTradeEditor(null)}
      onSave={async operation => { await saveOperation(operation, tradeEditor !== 'new'); setMessage('Transaction enregistrée.') }} />}
    {toDelete && <ConfirmDialog title="Supprimer cette entrée ?" description={`L’entrée de ${toDelete.name} sera retirée du journal.`}
      confirm="Supprimer" busy={deleting} danger onClose={() => setToDelete(null)} onConfirm={() => void confirmDelete()} />}
  </div>
}
