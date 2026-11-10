import { useMemo, useState } from 'react'
import type { Decimal } from 'decimal.js'
import AssetHistory from './AssetHistory'
import { assetDescription } from './AssetPicker'
import type { DailySeries } from './database'
import { catalogEntry } from './catalog'
import type { Currency, CurrencyDisplay } from './currency'
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

export function AssetTable({ assets, display, quotes, onOpen, limit }: {
  assets: Asset[]; display: CurrencyDisplay; quotes: Map<string, Mark>; onOpen: (key: string) => void; limit?: number
}) {
  const [sort, setSort] = useState<Sort>('value')
  const sorted = sortAssets(assets, sort).slice(0, limit)
  return <>
    <div className="table-tools">
      <span className="muted">{limit && assets.length > limit ? sorted.length + ' sur ' : ''}{assets.length} actif{assets.length !== 1 ? 's' : ''}</span>
      <label>Trier par <select value={sort} onChange={event => setSort(event.target.value as Sort)}>
        <option value="value">Valeur</option><option value="performance">Performance</option><option value="name">Nom</option>
      </select></label>
    </div>
    {sorted.length ? <table className="financial-table">
      <thead><tr><th>Actif</th><th>Quantité</th><th>Cours</th><th>Valeur</th><th>Gain latent</th><th><span className="sr-only">Fiche</span></th></tr></thead>
      <tbody>{sorted.map(asset => {
        const quote = quotes.get(asset.key)
        const price = asset.entries[0].unitPrice
        return <tr key={asset.key}>
          <th scope="row"><button type="button" className="asset-link" onClick={() => onOpen(asset.key)}>
            <AssetBadge asset={asset} /><span><strong>{asset.name}</strong>
              <small>{[assetSymbol(asset, asset.entries[0].listing), categories[asset.category]].filter(Boolean).join(' · ')}</small></span>
          </button></th>
          <td data-label="Quantité">{quantity(asset.quantity)}</td>
          <td data-label="Cours">{price === null ? '—' : display.format(price, { unit: true })}
            {quote && quoteIsStale(quote) && <small className="stale-label">Cours ancien</small>}</td>
          <td data-label="Valeur"><strong>{asset.priced ? display.format(asset.amount) : '—'}</strong>
            {asset.entries.some(entry => entry.partiallyValued) && <small>{asset.priced ? 'Partielle' : 'En attente de cours'}</small>}</td>
          <td data-label="Gain latent"><Change value={asset.gain}>{asset.gain === null ? '—' : display.format(asset.gain, { signed: true })}
            {asset.returnRate !== null && <small>{percentLabel(asset.returnRate)}</small>}</Change></td>
          <td className="open-asset"><button className="icon-button" type="button" onClick={() => onOpen(asset.key)} aria-label={'Voir ' + asset.name}><Icon name="next" /></button></td>
        </tr>
      })}</tbody>
    </table> : <p className="inline-empty">Aucun actif pour cette sélection.</p>}
  </>
}

export function PortfolioView({ holdings, platforms, display, quotes, onOpen }: {
  holdings: Holding[]; platforms: string[]; display: CurrencyDisplay; quotes: Map<string, Mark>; onOpen: (key: string) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | ''>('')
  const [platform, setPlatform] = useState('')
  const assets = useMemo(() => consolidate(holdings.filter(holding =>
    (!category || holding.category === category) && (!platform || platformKey(holding.platform) === platform))), [holdings, category, platform])
  return <section className="panel table-panel">
    <PanelHeading title="Positions consolidées" description="Les quantités et les montants suivent les filtres. La fiche de l’actif présente toutes ses plateformes." />
    <div className="filter-bar">
      <label>Rechercher un actif<input type="search" placeholder="Nom, symbole ou ISIN" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label>Catégorie<select value={category} onChange={event => setCategory(event.target.value as Category | '')}>
        <option value="">Toutes les catégories</option>{categoryEntries.map(([key]) => <option key={key} value={key}>{categoryLabels[key]}</option>)}
      </select></label>
      <label>Plateforme<select value={platform} onChange={event => setPlatform(event.target.value)}>
        <option value="">Toutes les plateformes</option>{platforms.map(name => <option key={name} value={platformKey(name)}>{name}</option>)}
      </select></label>
    </div>
    <AssetTable assets={assets.filter(asset => matchesAsset(asset, query))} display={display} quotes={quotes} onOpen={onOpen} />
  </section>
}

export type AllocationRow = { label: string; amount: Decimal }
export function Allocation({ rows, display }: { rows: AllocationRow[]; display: CurrencyDisplay }) {
  const valued = rows.filter(row => row.amount.gt(0)).sort((a, b) => b.amount.cmp(a.amount))
  if (!valued.length) return <p className="inline-empty">Répartition disponible dès qu’une valeur de marché est connue.</p>
  const total = valued.reduce((sum, row) => sum.plus(row.amount), valued[0].amount.times(0))
  return <ul className="allocation-list">{valued.map((row, index) => {
    const fraction = row.amount.div(total)
    return <li key={row.label}><div><span><i className={'allocation-color color-' + index % 5} />{row.label}</span>
      <strong>{display.format(row.amount)}</strong><small>{fraction.times(100).toFixed(1).replace('.', ',')} %</small></div>
      <span className="allocation-track" aria-hidden="true"><i className={'allocation-color color-' + index % 5} style={{ width: fraction.times(100).toFixed(3) + '%' }} /></span>
    </li>
  })}</ul>
}

export function AssetDetail({ asset, data, series, quote, display, cryptoKey, onBack, onTrade, journal }: {
  asset: Asset; data: PortfolioData; series?: DailySeries; quote?: Mark; display: CurrencyDisplay; cryptoKey: string
  onBack: () => void; onTrade: () => void; journal: React.ReactNode
}) {
  const chart = assetChartMarks(data, asset.key, series?.marks ?? [])
  const entry = asset.entries[0]
  const native = quote?.originalPrice && quote.currency ? unitPrice(quote.originalPrice, quote.currency as Currency) : null
  return <div className="detail-stack">
    <div className="detail-actions"><button className="secondary" onClick={onBack}><Icon name="back" /> Portefeuille</button>
      <button className="primary" onClick={onTrade}><Icon name="plus" /> Ajouter une transaction</button></div>
    <section className="panel asset-detail-hero">
      <div className="asset-detail-identity"><AssetBadge asset={asset} /><div><h2>{asset.name}</h2><p>{assetDescription(entry) || categories[asset.category]}</p></div></div>
      <div className="asset-detail-price"><small>Dernier cours de marché</small>
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
        <Metric label="Valeur de marché">{asset.priced ? display.format(asset.amount) : '—'}</Metric>
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
          <span><strong>{position.valuation ? display.format(position.valuation.amount) : '—'}</strong><small>Valeur détenue</small></span>
          <span><Change value={totals.gain}>{totals.gain === null ? '—' : display.format(totals.gain, { signed: true })}</Change><small>Gain latent</small></span>
        </div>
      })}</div>
    </section>
    {journal}
  </div>
}
