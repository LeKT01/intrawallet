import { useMemo, useState, type FormEvent } from 'react'
import { Decimal } from 'decimal.js'
import DailyChart, { inPeriod, PeriodButtons } from './DailyChart'
import { savePlatform } from './database'
import type { CurrencyDisplay } from './currency'
import type { HistoryPoint, Holding, Mark } from './ledger'
import { categories, consolidate, platformKey, summarize, type Category } from './portfolio'
import { Allocation, AssetTable, assetSymbol, type AllocationRow } from './PortfolioViews'
import { Change, Icon, Metric, PanelHeading, percentLabel } from './ui'

const categoryEntries = Object.entries(categories) as [Category, string][]

function grouped<T>(items: T[], group: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = group(item)
    const current = groups.get(key)
    if (current) current.push(item)
    else groups.set(key, [item])
  }
  return [...groups].map(([label, entries]) => ({ label, entries }))
}

function platformGroups(holdings: Holding[]) {
  return grouped(holdings, item => platformKey(item.platform)).map(group => ({ ...group, label: group.entries[0].platform }))
}

export function AnalyticsView({ holdings, history, display }: {
  holdings: Holding[]; history: HistoryPoint[]; display: CurrencyDisplay
}) {
  const [category, setCategory] = useState<Category | ''>('')
  const [platform, setPlatform] = useState('')
  const [range, setRange] = useState(90)
  const [historyCategory, setHistoryCategory] = useState<Category>('crypto')
  const platforms = platformGroups(holdings)
  const filtered = holdings.filter(item => (!category || item.category === category) && (!platform || platformKey(item.platform) === platform))
  const assets = consolidate(filtered)
  const total = summarize(filtered)
  const top = assets.slice(0, 3).reduce((amount, item) => amount.plus(item.amount), new Decimal(0))
  const groups = [
    { title: 'Catégorie', rows: grouped(filtered, item => categories[item.category]) },
    { title: 'Plateforme', rows: platformGroups(filtered) },
  ]
  const exposure: AllocationRow[] = grouped(filtered, item => item.source?.currency ?? 'Devise inconnue')
    .map(({ label, entries }) => ({ label, amount: summarize(entries).amount }))
  const series = inPeriod(history, range).map(point => ({
    date: point.date, value: point.allocation && point.value?.gt(0)
      ? (point.allocation[historyCategory] ?? new Decimal(0)).div(point.value) : null,
    detail: point.reconstructed ? 'Reconstitution' : point.usedOlderPrices ? 'Cours antérieurs inclus' : undefined,
  }))
  return <div className="detail-stack">
    <section className="panel table-panel"><PanelHeading title="Composition et concentration" description="Analyse des positions ouvertes sur la part valorisée du portefeuille." />
      <div className="filter-bar">
        <label>Catégorie<select value={category} onChange={event => setCategory(event.target.value as Category | '')}>
          <option value="">Toutes</option>{categoryEntries.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Plateforme<select value={platform} onChange={event => setPlatform(event.target.value)}>
          <option value="">Toutes</option>{platforms.map(item => <option key={item.label} value={platformKey(item.label)}>{item.label}</option>)}</select></label>
      </div>
      <div className="metric-grid embedded">
        <Metric label="Concentration des 3 premiers actifs">{total.amount.gt(0) ? percentLabel(top.div(total.amount)) : '—'}</Metric>
        <Metric label="Valeur de la sélection">{total.priced ? display.format(total.amount) : '—'}</Metric>
        <Metric label="Gain latent de la sélection"><Change value={total.gain}>{total.gain === null ? '—' : display.format(total.gain, { signed: true })}</Change></Metric>
      </div>
    </section>
    <div className="analysis-grid">
      {groups.map(group => <section className="panel analysis-panel" key={group.title}><PanelHeading title={'Par ' + group.title.toLowerCase()} />
        <Allocation rows={group.rows.map(({ label, entries }) => ({ label, amount: summarize(entries).amount }))} display={display} ring={group.title === 'Catégorie'} />
        {group.rows.length > 0 && <ul className="analysis-results">{group.rows.map(({ label, entries }) => {
          const sum = summarize(entries)
          return <li key={label}><span>{label}</span><Change value={sum.gain}>{sum.gain === null ? 'Gain latent indéterminé' : display.format(sum.gain, { signed: true }) + ' · ' + percentLabel(sum.returnRate)}</Change></li>
        })}</ul>}
      </section>)}
      <section className="panel analysis-panel"><PanelHeading title="Devises de cotation" description="Répartition par devise du cours observé. L’exposition économique des fonds peut différer." />
        <Allocation rows={exposure} display={display} /></section>
      <section className="panel analysis-panel"><PanelHeading title="Contributions latentes" description="Gains et pertes des positions ouvertes au coût connu." />
        {assets.every(item => item.gain === null) && <p className="inline-empty">Aucune position avec un coût et un cours connus.</p>}
        <ul className="analysis-results">{assets.filter(item => item.gain !== null).sort((a, b) => b.gain!.abs().cmp(a.gain!.abs()))
          .slice(0, 10).map(item => <li key={item.key}><span>{item.name}</span><Change value={item.gain}>{display.format(item.gain!, { signed: true })}</Change></li>)}</ul>
      </section>
    </div>
    <section className="panel chart-panel"><PanelHeading title="Évolution de la répartition" description="Poids historique dans l’ensemble du portefeuille, sur les dates valorisables." />
      <div className="filter-bar"><label>Catégorie historique<select value={historyCategory} onChange={event => setHistoryCategory(event.target.value as Category)}>
        {categoryEntries.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <PeriodButtons range={range} choose={setRange} minimumDays={7} /></div>
      <DailyChart points={series} label="Évolution du poids de la catégorie" format={value => value.times(100).toFixed(1) + ' %'}
        empty="Des relevés complets sont nécessaires pour calculer le poids historique." />
    </section>
  </div>
}

export function PlatformsView({ holdings, platforms, quotes, display, onOpen, onSaved }: {
  holdings: Holding[]; platforms: string[]; quotes: Map<string, Mark>; display: CurrencyDisplay; onOpen: (key: string) => void; onSaved: () => void
}) {
  const [editor, setEditor] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const groups = useMemo(() => platforms.map(label => {
    const entries = holdings.filter(item => platformKey(item.platform) === platformKey(label))
    return { label, assets: consolidate(entries), entries, totals: summarize(entries) }
  }).sort((a, b) => b.totals.amount.cmp(a.totals.amount) || a.label.localeCompare(b.label, 'fr')), [holdings, platforms])

  function edit(label: string) { setError(''); setName(label); setEditor(label) }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || editor === null) return
    setBusy(true)
    try {
      await savePlatform(name, editor || undefined)
      setEditor(null)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La plateforme n’a pas pu être enregistrée.')
    } finally { setBusy(false) }
  }

  return <div className="detail-stack">
    <section className="panel table-panel"><PanelHeading title="Mes plateformes" description="Banques, courtiers et plateformes d’échange.">
      <button className="primary" onClick={() => edit('')}><Icon name="plus" /> Créer une plateforme</button>
    </PanelHeading>
    {editor !== null && <form className="platform-editor" onSubmit={submit}>
      <label>Nom de la plateforme<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required autoFocus /></label>
      <button className="primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      <button type="button" className="secondary" onClick={() => setEditor(null)} disabled={busy}>Annuler</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>}
    {!groups.length && <p className="inline-empty">Crée une plateforme ou saisis son nom lors d’un premier investissement.</p>}</section>
    {groups.map(({ label, assets, entries, totals }) => <details className="panel platform-panel" key={label}>
      <summary><span className="platform-icon"><Icon name="platforms" /></span><span><strong>{label}</strong><small>{assets.length} {assets.length === 1 ? 'actif' : 'actifs'}{assets.length > 0 && ' · ' + assets.slice(0, 3)
          .map(asset => assetSymbol(asset, asset.entries[0].listing) || asset.name).join(' · ')}</small></span>
        <span><strong>{totals.priced ? display.format(totals.amount) : '—'}</strong><small>{totals.gain === null ? 'Gain latent indéterminé' : display.format(totals.gain, { signed: true })}</small></span><Icon name="next" /></summary>
      <div className="platform-detail">
        <button className="secondary" onClick={() => edit(label)}>Renommer la plateforme</button>
        <Allocation rows={grouped(entries, item => categories[item.category]).map(group => ({ label: group.label, amount: summarize(group.entries).amount }))} display={display} />
        <AssetTable assets={assets} display={display} quotes={quotes} onOpen={onOpen} />
      </div>
    </details>)}
  </div>
}
