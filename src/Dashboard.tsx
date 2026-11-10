import { useState } from 'react'
import type { Decimal } from 'decimal.js'
import type { CurrencyDisplay } from './currency'
import HistoryChart, { portfolioPeriod } from './HistoryChart'
import { periods } from './DailyChart'
import type { HistoryPoint, Holding, Mark } from './ledger'
import { platformKey, summarize, type Category } from './portfolio'
import { Allocation, AssetTable, type AllocationRow, type Asset } from './PortfolioViews'
import { Change, Icon, Metric, PanelHeading, percentLabel, timestamp } from './ui'
import { quoteIsStale } from './quotes'

const allocationCategories: [Category, string][] = [['stock', 'Actions'], ['etf', 'ETF'], ['crypto', 'Cryptos']]

function PortfolioRing({ rows, total }: { rows: AllocationRow[]; total: Decimal }) {
  if (!total.gt(0)) return null
  const shares = rows.map(row => ({ label: row.label, share: row.amount.div(total).times(100).toNumber() }))
  const largest = shares.reduce((best, item) => item.share > best.share ? item : best)
  return <div className="portfolio-ring" role="img" aria-label={shares.filter(item => item.share > 0)
    .map(item => item.label + ' ' + item.share.toFixed(1).replace('.', ',') + ' %').join(', ')}>
    <svg viewBox="0 0 140 140" aria-hidden="true">
      <circle className="ring-track" cx="70" cy="70" r="60" />
      {shares.map((item, index) => {
        if (!item.share) return null
        const offset = shares.slice(0, index).reduce((sum, row) => sum + row.share, 0)
        return <circle className={'ring-part ring-part-' + index} key={item.label} cx="70" cy="70" r="60" pathLength="100"
          strokeDasharray={item.share + ' 100'} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
      })}
    </svg>
    <div aria-hidden="true"><strong>{Math.round(largest.share)} %</strong><small>{largest.label}</small></div>
  </div>
}

export default function Dashboard({ assets, holdings, display, quotes, history, intraday, platforms, realized, unknownSales,
  lastChecked, refreshing, refreshStatus, demo, onRefresh, onOpen, onPortfolio, onAnalytics }: {
  assets: Asset[]; holdings: Holding[]; display: CurrencyDisplay; quotes: Map<string, Mark>; history: HistoryPoint[]; intraday: HistoryPoint[]
  platforms: string[]; realized: Decimal; unknownSales: number; lastChecked: number | null; refreshing: boolean; refreshStatus: string
  demo: boolean; onRefresh: () => void; onOpen: (key: string) => void; onPortfolio: () => void; onAnalytics: () => void
}) {
  const [range, setRange] = useState(30)
  const [allocation, setAllocation] = useState<'category' | 'platform' | 'asset'>('category')
  const total = summarize(holdings)
  const valuationAmount = total.priced || !holdings.length ? display.format(total.amount) : '—'
  const period = periods.find(item => item.days === range)?.label
  const selection = portfolioPeriod(history, intraday, range)
  const { last, change: periodChange } = selection
  const unknown = assets.filter(asset => asset.entries.some(entry => entry.partiallyValued)).length
  const manual = assets.filter(asset => asset.entries.some(entry => entry.usesManualValuation)).length
  const stale = assets.filter(asset => { const mark = quotes.get(asset.key); return mark && quoteIsStale(mark) }).length
  const latest = assets.reduce<Mark | undefined>((previous, asset) => {
    const mark = quotes.get(asset.key)
    return mark && (!previous || mark.sourceAt > previous.sourceAt) ? mark : previous
  }, undefined)
  const ranked = assets.filter(asset => asset.returnRate !== null).sort((a, b) => b.returnRate!.cmp(a.returnRate!))
  const categoryRows = allocationCategories.map(([key, label]) => ({
    label, amount: summarize(holdings.filter(item => item.category === key)).amount,
  }))
  const rows = allocation === 'asset' ? assets.map(asset => ({ label: asset.name + ' · ' + asset.reference, amount: asset.amount }))
    : allocation === 'platform' ? platforms.map(label => ({ label, amount: summarize(holdings.filter(item => platformKey(item.platform) === platformKey(label))).amount }))
      : categoryRows

  return <div className="dashboard-grid">
    <section className="panel valuation-panel" aria-labelledby="valuation-title">
      <div className="valuation-hero">
        <div className="valuation-main">
          <p className="hero-period"><Icon name="clock" />{period}</p>
          <h2 className="valuation-label" id="valuation-title">{unknown ? 'Valeur connue du portefeuille' : 'Valeur du portefeuille'}</h2>
          <p className="valuation-amount" key={valuationAmount}>{valuationAmount}</p>
          <p className="hero-performance">
            <Change value={total.gain}>{total.gain === null ? 'Gain latent indéterminé' : display.format(total.gain, { signed: true }) + ' latent'}</Change>
            {total.returnRate !== null && <span>{percentLabel(total.returnRate)}</span>}
          </p>
        </div>
        <PortfolioRing rows={categoryRows} total={total.amount} />
      </div>
      <div className="market-status">
        {!demo && <button type="button" className="secondary" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />
          {refreshing ? 'Actualisation…' : 'Actualiser les cours'}</button>}
        {lastChecked !== null && <small>Vérifié le {timestamp.format(lastChecked)}</small>}
        {latest && !demo && <small>Cours le plus récent · {timestamp.format(latest.sourceAt)}</small>}
        {demo && <small>Cotations simulées · mode démo</small>}
      </div>
      {(unknown > 0 || manual > 0 || stale > 0 || refreshStatus) && <div className="valuation-status" role="status">
        {unknown > 0 && <span>{unknown} actif{unknown > 1 ? 's' : ''} sans cours</span>}
        {manual > 0 && <span>{manual} actif{manual > 1 ? 's' : ''} avec une valeur manuelle</span>}
        {stale > 0 && <span>{stale} cours ancien{stale > 1 ? 's' : ''}</span>}
        {refreshStatus && <span>{refreshStatus}</span>}
      </div>}
    </section>

    <section className="panel allocation-panel">
      <PanelHeading title="Répartition" description={unknown ? 'Sur les valeurs connues.' : 'Poids dans le portefeuille.'} />
      <label className="allocation-select"><span className="sr-only">Répartition par</span>
        <select value={allocation} onChange={event => setAllocation(event.target.value as typeof allocation)}>
          <option value="category">Par catégorie</option><option value="platform">Par plateforme</option><option value="asset">Par actif</option>
        </select>
      </label>
      <Allocation rows={rows} display={display} />
      <button className="text-button" onClick={onAnalytics}>Ouvrir les analyses <Icon name="next" /></button>
    </section>

    <div className="metric-grid dashboard-metrics" aria-label="Indicateurs du portefeuille">
      <Metric label="Capital investi" icon="wallet" note={total.costCount < holdings.length ? 'Coûts connus des positions ouvertes'
        : total.estimated ? 'Estimation incluse' : 'Coût des positions ouvertes'}>{total.costCount ? display.format(total.cost) : '—'}</Metric>
      <Metric label="Gain ou perte latente" icon="analytics" note={total.returnRate === null ? 'Rendement indéterminé' : percentLabel(total.returnRate)}>
        <Change value={total.gain}>{total.gain === null ? '—' : display.format(total.gain, { signed: true })}</Change>
      </Metric>
      <Metric label="Actifs détenus" icon="positions" note={platforms.length + ' plateforme(s) active(s)'} emphasis>{assets.length}</Metric>
      <Metric label="Performance sur la période" icon="clock" note={(period ?? '') + (periodChange === null ? ' · Relevés insuffisants' : ' · Hors flux')}>
        <Change value={periodChange}>{periodChange === null ? '—' : display.format(periodChange, { day: last?.date, signed: true })}</Change>
      </Metric>
    </div>

    <HistoryChart history={history} selection={selection} display={display} range={range} chooseRange={setRange} />

    <section className="panel table-panel dashboard-positions"><PanelHeading title="Positions principales" description="Cours, valeur détenue et gains latents.">
      <button className="secondary" onClick={onPortfolio}>Tout le portefeuille <Icon name="next" /></button></PanelHeading>
      <AssetTable assets={assets} display={display} quotes={quotes} onOpen={onOpen} limit={6} />
    </section>

    <section className="panel dashboard-insights"><PanelHeading title="Résultats et classement" />
      <div className="metric-grid embedded">
        <Metric label="Gain réalisé connu" note={unknownSales ? unknownSales + ' vente(s) au coût inconnu' : 'Ventes enregistrées'}><Change value={realized}>{display.format(realized, { signed: true })}</Change></Metric>
        {ranked.length > 0 && <Metric label={ranked.length > 1 ? 'Meilleure performance' : 'Performance calculable'} note={ranked[0].name}>
          <Change value={ranked[0].returnRate}>{percentLabel(ranked[0].returnRate)}</Change></Metric>}
        {ranked.length > 1 && <Metric label="Plus faible performance" note={ranked.at(-1)!.name}>
          <Change value={ranked.at(-1)!.returnRate}>{percentLabel(ranked.at(-1)!.returnRate)}</Change></Metric>}
      </div>
    </section>
  </div>
}
