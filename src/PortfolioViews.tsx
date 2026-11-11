import { useId, useMemo, useState } from 'react'
import type { Decimal } from 'decimal.js'
import AssetHistory from './AssetHistory'
import { assetDescription } from './AssetPicker'
import type { DailySeries } from './database'
import { catalogEntry } from './catalog'
import { currencies, type Currency, type CurrencyDisplay } from './currency'
import { assetChartMarks, type Holding, type Mark, type PortfolioData } from './ledger'
import { categories, consolidate, platformKey, quantity, summarize, unitPrice, type Category } from './portfolio'
import { quoteIsStale, quoteTiming } from './quotes'
import { Change, Icon, Metric, PanelHeading, percentLabel, timestamp } from './ui'

export type Asset = ReturnType<typeof consolidate<Holding>>[number]
type Sort = 'value' | 'performance' | 'name'
const categoryEntries = Object.entries(categories) as [Category, string][]
const categoryLabels = { stock: 'Actions', etf: 'ETF', crypto: 'Cryptomonnaies' }

export function assetSymbol(asset: Pick<Asset, 'category' | 'reference'>, listing?: string) {
  const catalog = catalogEntry(asset.category, asset.reference)
  return (listing || catalog?.listing)?.split(':').at(-1) || catalog?.aliases?.split(' ')[0]
    || (asset.reference.startsWith('MANUAL:') ? '' : asset.reference)
}

function matchesAsset(asset: Asset, query: string) {
  const candidate = catalogEntry(asset.category, asset.reference)
  return [asset.name, asset.reference, assetSymbol(asset, asset.entries[0].listing), candidate?.aliases]
    .join(' ').toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr'))
}

function sortAssets(assets: Asset[], sort: Sort) {
  if (sort === 'value') return assets
  return [...assets].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'fr')
    if (a.returnRate === null) return b.returnRate === null ? 0 : 1
    return b.returnRate === null ? -1 : b.returnRate.cmp(a.returnRate)
  })
}

export function AssetBadge({ asset }: { asset: Pick<Asset, 'name' | 'category' | 'reference'> }) {
  const symbol = assetSymbol(asset)
  return <span className={'ticker-badge ' + asset.category} aria-hidden="true">
    {asset.category === 'crypto' && symbol === 'BTC' ? '₿' : (symbol && symbol.length < 7 ? symbol : asset.name.split(' ').map(word => word[0]).join('').slice(0, 3)).slice(0, 4)}
  </span>
}

export function AssetTable({ assets, display, quotes, onOpen, limit, order, compact = false }: {
  assets: Asset[]; display: CurrencyDisplay; quotes: Map<string, Mark>; onOpen: (key: string) => void; limit?: number; order?: Sort; compact?: boolean
}) {
  const [sort, setSort] = useState<Sort>('value')
  const sorted = sortAssets(assets, order ?? sort).slice(0, limit)
  return <>
    {!order && !limit && <div className="table-tools">
      <span className="muted">{assets.length} actif{assets.length !== 1 ? 's' : ''}</span>
      <label>Trier par <select value={sort} onChange={event => setSort(event.target.value as Sort)}>
        <option value="value">Valeur</option><option value="performance">Performance</option><option value="name">Nom</option>
      </select></label>
    </div>}
    {sorted.length ? <><ul className={compact ? "position-list compact-positions" : "position-list mobile-positions"}>{sorted.map(asset => <li key={asset.key}>
      <button type="button" onClick={() => onOpen(asset.key)}>
        <AssetBadge asset={asset} />
        <span className="mobile-position-name"><strong>{asset.name}</strong><small>{[assetSymbol(asset, asset.entries[0].listing), categories[asset.category]].filter(Boolean).join(' · ')}</small>
          {!limit && <small className="mobile-quantity">{quantity(asset.quantity)} unité(s)</small>}</span>
        <span className="mobile-position-value"><strong>{asset.priced ? display.format(asset.amount) : '—'}</strong>
          <small><span className="sr-only">Rendement latent </span><Change value={asset.returnRate}>{percentLabel(asset.returnRate)}</Change></small>
          {asset.entries.some(entry => entry.partiallyValued) && <small>{asset.priced ? 'Valeur partielle' : 'Cours manquant'}</small>}</span>
      </button></li>)}</ul>
    {!compact && <table className="financial-table">
      <thead><tr><th>Actif</th><th>Quantité</th><th>Cours</th><th>Valeur</th><th>Gain latent</th><th><span className="sr-only">Fiche</span></th></tr></thead>
      <tbody>{sorted.map(asset => {
        const quote = quotes.get(asset.key)
        const price = asset.entries[0].unitPrice
        const quoteCurrency = currencies.find(code => code === quote?.currency)
        return <tr key={asset.key}>
          <th scope="row"><button type="button" className="asset-link" onClick={() => onOpen(asset.key)}>
            <AssetBadge asset={asset} /><span><strong>{asset.name}</strong>
              <small>{[assetSymbol(asset, asset.entries[0].listing), categories[asset.category]].filter(Boolean).join(' · ')}</small></span>
          </button></th>
          <td data-label="Quantité">{quantity(asset.quantity)}</td>
          <td data-label="Cours">{price === null ? '—' : display.format(price, { unit: true })}
            {quote && <small>{[quote.instrument, quote.originalPrice && quoteCurrency && quoteCurrency !== display.currency
              ? unitPrice(quote.originalPrice, quoteCurrency) : null, quote.source].filter(Boolean).join(' · ')}</small>}
            {asset.entries[0].usesManualValuation && <small>Prix unitaire estimé</small>}
            {quote && quoteIsStale(quote) && <small className="stale-label">Cours ancien</small>}</td>
          <td data-label="Valeur"><strong>{asset.priced ? display.format(asset.amount) : '—'}</strong>
            {asset.entries.some(entry => entry.usesManualValuation) && <small>Saisie manuelle incluse</small>}
            {asset.entries.some(entry => entry.partiallyValued) && <small>{asset.priced ? 'Partielle' : 'En attente de cours'}</small>}</td>
          <td data-label="Gain latent"><Change value={asset.gain}>{asset.gain === null ? '—' : display.format(asset.gain, { signed: true })}
            {asset.returnRate !== null && <small>{percentLabel(asset.returnRate)}</small>}</Change>
            {asset.estimated && <small>Coût estimé</small>}</td>
          <td className="open-asset"><button className="icon-button" type="button" onClick={() => onOpen(asset.key)} aria-label={'Voir ' + asset.name}><Icon name="next" /></button></td>
        </tr>
      })}</tbody>
    </table>}</> : <p className="inline-empty">Aucun actif pour cette sélection.</p>}
  </>
}

export function PortfolioView({ holdings, platforms, display, quotes, onOpen, onAdd }: {
  holdings: Holding[]; platforms: string[]; display: CurrencyDisplay; quotes: Map<string, Mark>; onOpen: (key: string) => void; onAdd: () => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | ''>('')
  const [platform, setPlatform] = useState('')
  const [sort, setSort] = useState<Sort>('value')
  const [showFilters, setShowFilters] = useState(false)
  const filtersId = useId()
  const assets = useMemo(() => consolidate(holdings.filter(holding =>
    (!category || holding.category === category) && (!platform || platformKey(holding.platform) === platform))), [holdings, category, platform])
  return <section className="panel table-panel portfolio-panel">
    <PanelHeading title="Positions consolidées">
      <button className="primary portfolio-add" onClick={onAdd}><Icon name="plus" /> Ajouter un investissement</button>
    </PanelHeading>
    <div className="portfolio-filters">
      <label className="portfolio-search"><span className="sr-only">Rechercher un actif</span>
        <input type="search" placeholder="Nom, symbole ou ISIN" value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <div className="category-chips" role="group" aria-label="Catégorie">
        <button className="secondary" type="button" aria-pressed={!category} onClick={() => setCategory('')}>Tous</button>
        {categoryEntries.map(([key]) => <button className="secondary" type="button" key={key} aria-pressed={category === key}
          onClick={() => setCategory(key)}>{categoryLabels[key]}</button>)}
      </div>
      <button type="button" className="secondary portfolio-filter-button" aria-expanded={showFilters} aria-controls={filtersId}
        onClick={() => setShowFilters(value => !value)}><Icon name="data" /> Filtrer{(platform || sort !== 'value') && <>
          <span className="filter-active" aria-hidden="true" /><span className="sr-only">Options actives</span>
        </>}</button>
      <div id={filtersId} hidden={!showFilters} className="portfolio-filter-options">
        <div className="filter-bar">
          <label>Plateforme<select value={platform} onChange={event => setPlatform(event.target.value)}>
            <option value="">Toutes</option>{platforms.map(name => <option key={name} value={platformKey(name)}>{name}</option>)}
          </select></label>
          <label>Trier par<select value={sort} onChange={event => setSort(event.target.value as Sort)}>
            <option value="value">Valeur</option><option value="performance">Performance</option><option value="name">Nom</option>
          </select></label>
        </div>
      </div>
    </div>
    <AssetTable assets={assets.filter(asset => matchesAsset(asset, query))} display={display} quotes={quotes} onOpen={onOpen} order={sort} />
  </section>
}

export type AllocationRow = { label: string; amount: Decimal }
export function Allocation({ rows, display, ring = false }: { rows: AllocationRow[]; display: CurrencyDisplay; ring?: boolean }) {
  const valued = rows.filter(row => row.amount.gt(0)).sort((a, b) => b.amount.cmp(a.amount))
  if (!valued.length) return <p className="inline-empty">Répartition disponible dès qu’une position est valorisée.</p>
  const total = valued.reduce((sum, row) => sum.plus(row.amount), valued[0].amount.times(0))
  const legend = <ul className="allocation-list">{valued.map((row, index) => {
    const fraction = row.amount.div(total)
    return <li key={row.label}><div><span><i className={'allocation-color color-' + index % 5} />{row.label}</span>
      <strong>{display.format(row.amount)}</strong><small>{fraction.times(100).toFixed(1).replace('.', ',')} %</small></div>
      {!ring && <span className="allocation-track" aria-hidden="true"><i className={'allocation-color color-' + index % 5} style={{ width: fraction.times(100).toFixed(3) + '%' }} /></span>}
    </li>
  })}</ul>
  if (!ring) return legend
  let offset = 0
  const segments = valued.map((row, index) => {
    const start = offset
    offset += row.amount.div(total).times(100).toNumber()
    const end = index === valued.length - 1 ? 100 : offset
    return `var(--series-${index % 5}) ${start}% ${end}%`
  })
  return <div className="allocation-composition">
    <span className="allocation-ring" aria-hidden="true" style={{ backgroundImage: `conic-gradient(from -90deg, ${segments.join(', ')})` }}><Icon name="analytics" /></span>
    {legend}
  </div>
}

export function AssetDetail({ asset, data, series, quote, display, cryptoKey, onBack, onTrade, journal }: {
  asset: Asset; data: PortfolioData; series?: DailySeries; quote?: Mark; display: CurrencyDisplay; cryptoKey: string
  onBack: () => void; onTrade: () => void; journal: React.ReactNode
}) {
  const chart = assetChartMarks(data, asset.key, series?.marks ?? [])
  const entry = asset.entries[0]
  const usesManualValuation = asset.entries.some(position => position.usesManualValuation)
  const native = quote?.originalPrice && quote.currency ? unitPrice(quote.originalPrice, quote.currency as Currency) : null
  return <div className="detail-stack">
    <div className="detail-actions"><button className="secondary" onClick={onBack}><Icon name="back" /> Portefeuille</button>
      <button className="primary" onClick={onTrade}><Icon name="plus" /> Ajouter une transaction</button></div>
    <section className="panel asset-detail-hero">
      <div className="asset-detail-identity"><AssetBadge asset={asset} /><div><h2>{asset.name}</h2><p>{assetDescription(entry) || categories[asset.category]}</p></div></div>
      <div className="asset-detail-price"><small>{!quote && entry.usesManualValuation ? 'Prix unitaire estimé' : 'Dernier cours de marché'}</small>
        <strong>{native ?? (entry.unitPrice === null ? 'Indisponible' : display.format(entry.unitPrice, { unit: true }))}</strong>
        {quote && <p className={quoteIsStale(quote) ? 'stale-label' : 'muted'}>
          {quoteIsStale(quote) && 'Cours ancien · '}{quoteTiming(quote)} · {quote.instrument ? quote.instrument + ' · ' : ''}{quote.source} · {timestamp.format(quote.sourceAt)}
          {quote.receivedAt && <><br />Reçu le {timestamp.format(quote.receivedAt)}</>}</p>}</div>
    </section>
    <section className="panel chart-panel"><AssetHistory {...chart} asset={entry} cryptoKey={cryptoKey} name={asset.name} display={display} /></section>
    <section className="panel">
      <PanelHeading title="Ma position" description={asset.estimated ? 'Le coût inclut une estimation.' : 'Le coût moyen tient compte des frais enregistrés.'} />
      <div className="metric-grid embedded">
        <Metric label="Quantité">{quantity(asset.quantity)}</Metric>
        <Metric label={usesManualValuation ? 'Valeur détenue' : 'Valeur de marché'} note={usesManualValuation ? 'Saisie manuelle incluse' : undefined}>
          {asset.priced ? display.format(asset.amount) : '—'}</Metric>
        <Metric label="Coût connu" note={asset.costCount < asset.entries.length ? 'Coût incomplet' : undefined}>{asset.costCount ? display.format(asset.cost) : '—'}</Metric>
        <Metric label="Prix moyen d’acquisition">{asset.costCount === asset.entries.length ? display.format(asset.cost.div(asset.quantity), { unit: true }) : '—'}</Metric>
        <Metric label="Gain latent" note={percentLabel(asset.returnRate)}><Change value={asset.gain}>{asset.gain === null ? '—' : display.format(asset.gain, { signed: true })}</Change></Metric>
      </div>
    </section>
    <section className="panel table-panel">
      <PanelHeading title="Par plateforme" />
      <div className="platform-holdings">{asset.entries.map(position => {
        const totals = summarize([position])
        return <div className="entry" key={position.id}>
          <span><strong>{position.platform}</strong><small>{quantity(position.quantity)} unité(s)</small></span>
          <span><strong>{position.valuation ? display.format(position.valuation.amount) : '—'}</strong>
            <small>{position.usesManualValuation ? 'Valeur saisie manuellement' : 'Valeur détenue'}</small></span>
          <span><Change value={totals.gain}>{totals.gain === null ? '—' : display.format(totals.gain, { signed: true })}</Change><small>Gain latent</small></span>
        </div>
      })}</div>
    </section>
    {journal}
  </div>
}
