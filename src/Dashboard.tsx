import { useState } from 'react'
import type { Decimal } from 'decimal.js'
import type { CurrencyDisplay } from './currency'
import HistoryChart, { portfolioPeriod } from './HistoryChart'
import { periods } from './DailyChart'
import { hasUnknownQuoteTime, type HistoryPoint, type Holding, type Mark } from './ledger'
import { platformKey, summarize, type Category } from './portfolio'
import { Allocation, AssetTable, type Asset } from './PortfolioViews'
import { Change, Icon, Metric, PanelHeading, percentLabel, timestamp } from './ui'
import { quoteIsStale } from './quotes'

const allocationCategories: [Category, string][] = [['stock', 'Actions'], ['etf', 'ETF'], ['crypto', 'Cryptos']]

const marketTime = new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })

export default function Dashboard({ assets, holdings, display, quotes, history, intraday, platforms, realized, unknownSales,
  lastChecked, refreshing, refreshStatus, demo, onRefresh, onOpen, onPortfolio }: {
  assets: Asset[]; holdings: Holding[]; display: CurrencyDisplay; quotes: Map<string, Mark>; history: HistoryPoint[]; intraday: HistoryPoint[]
  platforms: string[]; realized: Decimal; unknownSales: number; lastChecked: number | null; refreshing: boolean; refreshStatus: string
  demo: boolean; onRefresh: () => void; onOpen: (key: string) => void; onPortfolio: () => void
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
    return mark && !hasUnknownQuoteTime(mark) && (!previous || mark.sourceAt > previous.sourceAt) ? mark : previous
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
      <div className="valuation-art" aria-hidden="true"><span /><span /><span><Icon name="wallet" /></span></div>
      <div className="valuation-content">
        <h2 className="valuation-label" id="valuation-title">{unknown ? 'Valeur connue du portefeuille' : 'Valeur totale du portefeuille'}</h2>
        <p className="valuation-amount" key={valuationAmount}>{valuationAmount}</p>
        <p className="hero-performance">
          <span>{total.gain === null ? 'Gain latent indéterminé' : display.format(total.gain, { signed: true }) + (total.gain.lt(0) ? ' de perte latente' : ' de gain latent')}</span>
          {total.returnRate !== null && <strong className={total.returnRate.gt(0) ? 'hero-up' : total.returnRate.lt(0) ? 'hero-down' : undefined}>{percentLabel(total.returnRate)}</strong>}
        </p>
        <div className="market-status">
          {!demo && <button type="button" className="secondary" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />
            {refreshing ? 'Actualisation…' : 'Actualiser les cours'}</button>}
          {demo ? <small>Cotations simulées</small> : lastChecked !== null && <small>Vérifiés à {marketTime.format(lastChecked)}{stale > 0 ? ' · ' + stale + (stale === 1 ? ' cours ancien' : ' cours anciens') : ''}</small>}
          {(!demo && latest || unknown > 0 || manual > 0 || stale > 0 || refreshStatus) && <details className="market-details">
            <summary>Détails des cours</summary>
            <ul>
              {lastChecked !== null && <li>Dernière vérification · {timestamp.format(lastChecked)}</li>}
              {latest && !demo && <li>Dernier cours · {timestamp.format(latest.sourceAt)} · {latest.source}</li>}
              {unknown > 0 && <li>{unknown} actif(s) sans valorisation complète</li>}
              {manual > 0 && <li>{manual} actif(s) avec une valeur manuelle</li>}
              {stale > 0 && <li>{stale} cours ancien(s)</li>}
              {refreshStatus && <li>{refreshStatus}</li>}
            </ul>
          </details>}
        </div>
        <span className="sr-only" role="status">{refreshStatus}</span>
      </div>
    </section>

    <div className="metric-grid dashboard-metrics" aria-label="Indicateurs du portefeuille">
      <Metric label="Capital investi" icon="wallet" note={total.costCount < holdings.length ? 'Coûts connus des positions ouvertes'
        : total.estimated ? 'Estimation incluse' : 'Coût des positions ouvertes'}>{total.costCount ? display.format(total.cost) : '—'}</Metric>
      <Metric label="Actifs détenus" icon="positions" note={platforms.length + (platforms.length === 1 ? ' plateforme' : ' plateformes')}>{assets.length}</Metric>
      <Metric label="Résultat sur la période" icon="clock" note={(period ?? '') + (periodChange === null ? ' · Relevés insuffisants' : ' · Hors flux')}>
        <Change value={periodChange}>{periodChange === null ? '—' : display.format(periodChange, { day: last?.date, signed: true })}</Change>
      </Metric>
    </div>

    <HistoryChart history={history} selection={selection} display={display} range={range} chooseRange={setRange} />

    <section className="panel table-panel dashboard-positions"><PanelHeading title="Positions principales">
      <button className="secondary" aria-label="Voir tout le portefeuille" onClick={onPortfolio}>Tout voir <Icon name="next" /></button></PanelHeading>
      <AssetTable assets={assets} display={display} quotes={quotes} onOpen={onOpen} limit={6} compact />
    </section>

    <section className="panel allocation-panel">
      <PanelHeading title="Répartition" description={unknown ? 'Sur les valeurs connues.' : undefined}>
        <label className="allocation-select"><span className="sr-only">Répartition par</span>
          <select value={allocation} onChange={event => setAllocation(event.target.value as typeof allocation)}>
            <option value="category">Par catégorie</option><option value="platform">Par plateforme</option><option value="asset">Par actif</option>
          </select>
        </label>
      </PanelHeading>
      <Allocation rows={rows} display={display} ring />
    </section>

    <details className="panel dashboard-insights"><summary>Résultats et classement</summary>
      <div className="metric-grid embedded">
        <Metric label="Gain réalisé connu" note={unknownSales ? unknownSales + ' vente(s) au coût inconnu' : 'Ventes enregistrées'}><Change value={realized}>{display.format(realized, { signed: true })}</Change></Metric>
        {ranked.length > 0 && <Metric label={ranked.length > 1 ? 'Meilleure performance' : 'Performance calculable'} note={ranked[0].name}>
          <Change value={ranked[0].returnRate}>{percentLabel(ranked[0].returnRate)}</Change></Metric>}
        {ranked.length > 1 && <Metric label="Plus faible performance" note={ranked.at(-1)!.name}>
          <Change value={ranked.at(-1)!.returnRate}>{percentLabel(ranked.at(-1)!.returnRate)}</Change></Metric>}
      </div>
    </details>
  </div>
}
