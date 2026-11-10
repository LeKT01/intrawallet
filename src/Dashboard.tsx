import { useState } from 'react'
import type { Decimal } from 'decimal.js'
import type { CurrencyDisplay } from './currency'
import HistoryChart from './HistoryChart'
import type { HistoryPoint, Holding, Mark } from './ledger'
import { categories, platformKey, summarize } from './portfolio'
import { Allocation, AssetTable, type Asset } from './PortfolioViews'
import { Change, Icon, Metric, PanelHeading, percentLabel, timestamp } from './ui'
import { quoteIsStale } from './quotes'

export default function Dashboard({ assets, holdings, display, quotes, history, intraday, platforms, realized, unknownSales,
  lastChecked, refreshing, refreshStatus, demo, onRefresh, onOpen, onPortfolio, onAnalytics }: {
  assets: Asset[]; holdings: Holding[]; display: CurrencyDisplay; quotes: Map<string, Mark>; history: HistoryPoint[]; intraday: HistoryPoint[]
  platforms: string[]; realized: Decimal; unknownSales: number; lastChecked: number | null; refreshing: boolean; refreshStatus: string
  demo: boolean; onRefresh: () => void; onOpen: (key: string) => void; onPortfolio: () => void; onAnalytics: () => void
}) {
  const [range, setRange] = useState(30)
  const [allocation, setAllocation] = useState<'category' | 'platform' | 'asset'>('category')
  const total = summarize(holdings)
  const unknown = assets.filter(asset => asset.entries.some(entry => entry.partiallyValued)).length
  const manual = assets.filter(asset => asset.entries.some(entry => entry.usesManualValuation)).length
  const stale = assets.filter(asset => { const mark = quotes.get(asset.key); return mark && quoteIsStale(mark) }).length
  const latest = assets.reduce<Mark | undefined>((previous, asset) => {
    const mark = quotes.get(asset.key)
    return mark && (!previous || mark.sourceAt > previous.sourceAt) ? mark : previous
  }, undefined)
  const ranked = assets.filter(asset => asset.returnRate !== null).sort((a, b) => b.returnRate!.cmp(a.returnRate!))
  const rows = allocation === 'asset' ? assets.map(asset => ({ label: asset.name + ' · ' + asset.reference, amount: asset.amount }))
    : allocation === 'platform' ? platforms.map(label => ({ label, amount: summarize(holdings.filter(item => platformKey(item.platform) === platformKey(label))).amount }))
      : Object.entries(categories).map(([key, label]) => ({ label, amount: summarize(holdings.filter(item => item.category === key)).amount }))

  return <div className="dashboard-stack">
    <div className="dashboard-grid">
      <section className="panel valuation-panel" aria-label="Valorisation et historique">
        <header className="valuation-hero">
          <div><p className="valuation-label">{unknown ? 'Valeur connue du portefeuille' : 'Valeur du portefeuille'}</p>
            <h2>{total.priced || !holdings.length ? display.format(total.amount) : '—'}</h2>
            <p className="hero-performance">
              <Change value={total.gain}>{total.gain === null ? 'Gain latent indéterminé' : display.format(total.gain, { signed: true })}</Change>
              {total.returnRate !== null && <span>{percentLabel(total.returnRate)} <small>latent</small></span>}
            </p>
          </div>
          <div className="market-status">
            {!demo && <button type="button" className="secondary" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />
              {refreshing ? 'Actualisation…' : 'Actualiser les cours'}</button>}
            {lastChecked !== null && <small>Vérifié le {timestamp.format(lastChecked)}</small>}
            {latest && !demo && <small>Cours le plus récent · {timestamp.format(latest.sourceAt)}</small>}
          </div>
        </header>
        {(unknown > 0 || manual > 0 || stale > 0 || refreshStatus) && <div className="valuation-status" role="status">
          {unknown > 0 && <span>{unknown} actif{unknown > 1 ? 's' : ''} sans cours</span>}
          {manual > 0 && <span>{manual} actif{manual > 1 ? 's' : ''} avec une valeur manuelle</span>}
          {stale > 0 && <span className="stale-label">{stale} cours ancien{stale > 1 ? 's' : ''}</span>}
          {refreshStatus && <span>{refreshStatus}</span>}
        </div>}
        <HistoryChart history={history} intraday={intraday} display={display} range={range} chooseRange={setRange} embedded />
      </section>
      <section className="panel allocation-panel">
        <PanelHeading title="Répartition" description={unknown ? 'Sur les valeurs connues.' : 'Poids dans le portefeuille.'} />
        <label className="allocation-select"><span className="sr-only">Répartition par</span>
          <select value={allocation} onChange={event => setAllocation(event.target.value as typeof allocation)}>
            <option value="category">Par catégorie</option><option value="platform">Par plateforme</option><option value="asset">Par actif</option>
          </select></label>
        <Allocation rows={rows} display={display} />
        <button className="text-button" onClick={onAnalytics}>Ouvrir les analyses <Icon name="next" /></button>
      </section>
    </div>
    <div className="metric-grid">
      <Metric label="Capital investi" note={total.costCount < holdings.length ? 'Coûts connus des positions ouvertes'
        : total.estimated ? 'Positions ouvertes · estimation incluse' : 'Coût des positions ouvertes'}>{total.costCount ? display.format(total.cost) : '—'}</Metric>
      <Metric label="Gain réalisé connu" note={unknownSales ? unknownSales + ' vente(s) au coût inconnu' : 'Ventes enregistrées'}><Change value={realized}>{display.format(realized, { signed: true })}</Change></Metric>
      <Metric label="Actifs détenus" note={platforms.length + ' plateforme(s) active(s)'}>{assets.length}</Metric>
      {ranked.length > 0 && <Metric label={ranked.length > 1 ? 'Meilleure performance' : 'Performance calculable'} note={ranked[0].name}>
        <Change value={ranked[0].returnRate}>{percentLabel(ranked[0].returnRate)}</Change></Metric>}
      {ranked.length > 1 && <Metric label="Plus faible performance" note={ranked.at(-1)!.name}>
        <Change value={ranked.at(-1)!.returnRate}>{percentLabel(ranked.at(-1)!.returnRate)}</Change></Metric>}
    </div>
    <section className="panel table-panel"><PanelHeading title="Positions principales" description="Cours, valeur détenue et gains latents.">
      <button className="secondary" onClick={onPortfolio}>Tout le portefeuille <Icon name="next" /></button></PanelHeading>
      <AssetTable assets={assets} display={display} quotes={quotes} onOpen={onOpen} limit={6} />
    </section>
  </div>
}
