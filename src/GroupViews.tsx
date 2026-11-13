import { useRef, useState, type FormEvent } from 'react'
import { Decimal } from 'decimal.js'
import DailyChart from './DailyChart'
import AssetPicker from './AssetPicker'
import { AssetBadge, assetSymbol } from './PortfolioViews'
import { currencies, dayKey, type Currency, type CurrencyDisplay } from './currency'
import { allocationAmounts, allocationTotal, currentAllocation, groupCapital, groupLedger, groupTypes, groupValue,
  type Allocation, type GroupAsset, type InvestmentGroup } from './groups'
import { dailyPortfolioHistory, firstTrackingDate, quoteTarget, replay, type Mark } from './ledger'
import { money, parseAmount, quantity, summarize } from './portfolio'
import { newId, platformName, useModal } from './PositionForm'
import { Change, Icon, Metric, PanelHeading, percentLabel } from './ui'
import { quoteIsStale } from './quotes'

type GroupDisplay = {
  marks: Mark[]; display: CurrencyDisplay; rate: (currency: string) => Decimal | null
}
const dateLabel = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeZone: 'Europe/Zurich' })
const dateInput = (at: number) => dayKey(at)
const parseDay = (day: string) => day === dayKey(Date.now()) ? Date.now() : Date.parse(day + 'T12:00:00Z')

export function GroupEditor({ current, platforms, marketKey, onSave, onClose }: {
  current?: InvestmentGroup; platforms: string[]; marketKey?: string
  onSave: (group: InvestmentGroup) => Promise<void>; onClose: () => void
}) {
  const { dialog, close } = useModal(onClose)
  const [name, setName] = useState(current?.name ?? '')
  const [platform, setPlatform] = useState(current?.platform ?? '')
  const [type, setType] = useState<InvestmentGroup['type']>(current?.type ?? 'managed')
  const [mode, setMode] = useState<InvestmentGroup['mode']>(current?.mode ?? 'estimate')
  const [currency, setCurrency] = useState<Currency>(current?.currency ?? 'CHF')
  const [initial, setInitial] = useState(current?.initial ?? '')
  const [date, setDate] = useState(dateInput(current?.createdAt ?? Date.now()))
  const [effective, setEffective] = useState(dateInput(Date.now()))
  const [description, setDescription] = useState(current?.description ?? '')
  const [entries, setEntries] = useState<Allocation[]>(current ? currentAllocation(current) : [])
  const [picker, setPicker] = useState(false)
  const [keepCash, setKeepCash] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const normalized = entries.map(entry => ({ ...entry, percent: entry.percent.trim().replace(',', '.') }))
  const total = normalized.reduce((sum, row) => sum.plus(parseAmount(row.percent) ?? 0), new Decimal(0))
  const allocationsChanged = !current || JSON.stringify(normalized) !== JSON.stringify(currentAllocation(current))

  function choose(asset: GroupAsset | null) {
    if (!asset || asset.category !== 'etf') return
    if (entries.some(entry => quoteTarget(entry.asset) === quoteTarget(asset))) {
      setError('Cette ligne de cotation est déjà dans le groupe.')
      return
    }
    setEntries([...entries, { asset, percent: '0' }])
    setError('')
    setPicker(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const allocated = allocationTotal(normalized)
      if (allocated.lt(100) && !keepCash) throw new Error('Complète l’allocation ou accepte le solde non alloué.')
      const createdAt = current?.createdAt ?? parseDay(date)
      const parsedEffective = parseDay(effective)
      const lastAllocation = current?.allocations.at(-1)
      const allocationAt = !current ? createdAt : lastAllocation && effective === dateInput(lastAllocation.at)
        ? Math.max(parsedEffective, lastAllocation.at + 1) : parsedEffective
      const platformValue = platformName(platform, platforms)
      await onSave({
        id: current?.id ?? newId(), name: name.trim(), platform: platformValue, type, mode, currency,
        initial: parseAmount(initial)?.toFixed() ?? '', createdAt, description: description.trim(),
        allocations: [...(current?.allocations ?? []), ...(allocationsChanged ? [{ at: allocationAt, entries: normalized }] : [])],
        flows: current?.flows ?? [], valuations: current?.valuations ?? [],
        positions: (current?.positions ?? []).map(position => ({ ...position, platform: platformValue })),
        operations: (current?.operations ?? []).map(operation => ({ ...operation, platform: platformValue })),
      })
      close()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Le groupe n’a pas pu être enregistré.')
    } finally { pending.current = false; setBusy(false) }
  }

  return <dialog className="form-dialog group-dialog" ref={dialog} aria-label={current ? "Modifier le portefeuille groupé" : "Créer un portefeuille groupé"}
    onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <form className="group-form" onSubmit={submit}>
      <header className="dialog-header">
        <h2>{current ? 'Modifier le portefeuille groupé' : 'Créer un portefeuille groupé'}</h2>
        <button type="button" className="icon-button" aria-label="Fermer" onClick={close} disabled={busy}><Icon name="close" /></button>
      </header>
      <div className="dialog-body"><fieldset disabled={busy} aria-busy={busy}>
        <section className="group-editor-section" aria-labelledby="group-info">
          <h3 id="group-info">Informations générales</h3>
          <div className="form-grid">
            <label>Nom du groupe<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
            <label>Plateforme<input required list="group-platforms" maxLength={80} value={platform} onChange={event => setPlatform(event.target.value)} /></label>
            <datalist id="group-platforms">{platforms.map(item => <option key={item} value={item} />)}</datalist>
            <label>Type<select value={type} onChange={event => setType(event.target.value as InvestmentGroup['type'])}>
              {Object.entries(groupTypes).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
            </select></label>
            <label>Date du premier investissement<input required type="date" max={dateInput(Date.now())} disabled={Boolean(current)} value={date} onChange={event => setDate(event.target.value)} /></label>
            <label>Capital initial<input required inputMode="decimal" value={initial} onChange={event => setInitial(event.target.value)} /></label>
            <label>Devise de référence<select value={currency} disabled={Boolean(current?.flows.length || current?.valuations.length)}
              onChange={event => setCurrency(event.target.value as Currency)}>{currencies.map(code => <option key={code}>{code}</option>)}</select></label>
          </div>
          <label className="cost-input">Description facultative<textarea maxLength={500} value={description} onChange={event => setDescription(event.target.value)} /></label>
        </section>
        <section className="group-editor-section" aria-labelledby="group-composition">
          <h3 id="group-composition">Composition</h3>
          <p className="hint" role="status">{total.toFixed()} % alloué</p>
          {entries.map(({ asset, percent }, index) => <div className="group-editor-line" key={quoteTarget(asset)}>
            <label className="cost-input">{asset.name} · {asset.listing ?? asset.reference}
              <input value={percent} inputMode="decimal" aria-label={'Allocation de ' + (asset.listing ?? asset.name)}
                onChange={event => setEntries(entries.map((entry, i) => i === index ? { ...entry, percent: event.target.value } : entry))} /></label>
            <button type="button" className="secondary" aria-label={'Retirer ' + (asset.listing ?? asset.name)}
              onClick={() => setEntries(entries.filter((_, i) => i !== index))}>Retirer</button>
          </div>)}
          {picker ? <AssetPicker category="etf" selected={null} onCategory={() => {}} onChoose={choose}
            onCustom={() => {}} marketKey={marketKey} fixedCategory disableManual />
            : <button type="button" className="secondary" onClick={() => setPicker(true)}><Icon name="plus" /> Ajouter un ETF</button>}
          {total.lt(100) && <label className="check-row"><input type="checkbox" checked={keepCash}
            onChange={event => setKeepCash(event.target.checked)} /> Conserver {new Decimal(100).minus(total).toFixed()} % non alloués</label>}
          {current && allocationsChanged && <label className="cost-input">Date d’effet de l’allocation<input type="date" required
            value={effective} min={date} max={dateInput(Date.now())} onChange={event => setEffective(event.target.value)} /></label>}
        </section>
        <section className="group-editor-section" aria-labelledby="group-tracking">
          <h3 id="group-tracking">Suivi</h3>
          <label className="cost-input">Mode de suivi<select value={mode} onChange={event => setMode(event.target.value as InvestmentGroup['mode'])}>
            <option value="estimate">Allocation estimative</option><option value="exact">Positions exactes</option></select></label>
          <p className="hint">{mode === 'estimate' ? 'Tu peux ajouter des relevés de valeur totale après la création.'
            : 'Tu pourras enregistrer les quantités réelles, les achats et les ventes depuis la fiche du groupe.'}</p>
        </section>
      </fieldset></div>
      <footer className="dialog-actions">
        {error && <p role="alert" className="error dialog-error">{error}</p>}
        <button type="button" className="secondary" disabled={busy} onClick={close}>Annuler</button>
        <button type="submit" className="primary" disabled={busy}>Enregistrer le groupe</button>
      </footer>
    </form>
  </dialog>
}

export function GroupList({ groups, marks, rate, display, onCreate, onOpen }: GroupDisplay & {
  groups: InvestmentGroup[]; onCreate: () => void; onOpen: (id: string) => void
}) {
  return <section className="panel group-list">
    <PanelHeading title="Portefeuilles groupés"><button className="secondary" onClick={onCreate}><Icon name="plus" /> Créer un portefeuille groupé</button></PanelHeading>
    {groups.length > 0 && <ul className="position-list compact-positions">{groups.map(group => {
      const { value, summary } = groupValue(group, marks, rate)
      const entries = currentAllocation(group)
      return <li key={group.id}><button onClick={() => onOpen(group.id)}>
        <span className="ticker-badge etf"><Icon name="group" /></span>
        <span className="mobile-position-name"><strong>{group.name}</strong>
          <small>{group.platform} · {groupTypes[group.type]} · {entries.length} ETF</small>
          <small>{entries.slice(0, 4).map(({ asset }) => assetSymbol(asset, asset.listing)).join(' · ')}</small></span>
        <span className="mobile-position-value"><strong>{value === null ? '—' : display.format(value)}</strong>
          <small>{group.mode === 'estimate' ? value === null ? 'Valeur à renseigner' : 'Valeur déclarée' : percentLabel(summary.returnRate)}</small>
          <small>Capital net · {money(groupCapital(group), 2, group.currency)}</small></span>
      </button></li>
    })}</ul>}
  </section>
}

export function GroupDetail({ group, marks, rate, display, historical, onBack, onEdit, onRemove, onSave, onPosition, onTrade }: GroupDisplay & {
  group: InvestmentGroup; historical: Mark[]; onBack: () => void; onEdit: () => void; onRemove: () => void
  onSave: (next: InvestmentGroup) => Promise<void>; onPosition: (id?: string) => void; onTrade: (asset?: GroupAsset, id?: string) => void
}) {
  const [kind, setKind] = useState<'deposit' | 'withdrawal' | 'valuation'>('valuation')
  const [date, setDate] = useState(dateInput(Date.now()))
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const { holdings, summary, value, declared } = groupValue(group, marks, rate)
  const { entries, remaining } = allocationAmounts(group)
  const ledger = groupLedger(group, marks)
  const exact = group.mode === 'exact'
  const observed = exact ? replay({ ...ledger, marks: ledger.marks.filter(mark => mark.source !== 'Tradegate · relevé') }).history.filter(point => point.at >= firstTrackingDate(ledger)) : []
  const graph = exact ? dailyPortfolioHistory(ledger, observed, historical).map(point => ({
    date: point.date, value: point.value === null ? null : display.convert(point.value, point.date),
  })) : [...new Map([...group.valuations].sort((a, b) => a.at - b.at).map(point =>
    [dayKey(point.at), { date: dayKey(point.at), value: new Decimal(point.amount) }])).values()]
  const graphCurrency = exact ? display.currency : group.currency
  const assets = new Map(entries.map(row => [quoteTarget(row.asset), row]))
  for (const holding of holdings) if (!assets.has(quoteTarget(holding))) {
    assets.set(quoteTarget(holding), { asset: holding, amount: new Decimal(0), percent: '0' })
  }

  async function record(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const entry = { id: newId(), at: parseDay(date), amount: parseAmount(amount)?.toFixed() ?? '' }
      await onSave(kind === 'valuation' ? { ...group, valuations: [...group.valuations, entry] }
        : { ...group, flows: [...group.flows, { ...entry, kind }] })
      setAmount('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <div className="detail-stack">
    <section className="panel group-list">
      <button className="secondary" onClick={onBack}><Icon name="back" /> Portefeuille</button>
      <PanelHeading title={group.name} description={group.platform + ' · ' + groupTypes[group.type] + ' · ' + group.currency}>
        <button className="secondary" onClick={onEdit}>Modifier</button>
      </PanelHeading>
      {group.description && <p>{group.description}</p>}
      <div className="metric-grid">
        <Metric label="Capital net confié">{money(groupCapital(group), 2, group.currency)}</Metric>
        <Metric label={group.mode === 'estimate' ? 'Valeur déclarée' : 'Valeur de marché'}
          note={group.mode === 'estimate' && declared ? dateLabel.format(declared.at) : group.mode === 'exact' && holdings.some(item => item.partiallyValued || !item.valuation) ? 'Valorisation partielle' : undefined}>
          {group.mode === 'estimate' && declared ? money(declared.amount, 2, group.currency) : value === null ? '—' : display.format(value)}
        </Metric>
        <Metric label="Gain latent" note={group.mode === 'estimate' ? 'Allocation estimative' : 'Positions exactes'}>
          <Change value={summary.gain}>{summary.gain === null ? '—' : display.format(summary.gain, { signed: true })}</Change>
        </Metric>
      </div>
    </section>
    <section className="panel group-list"><PanelHeading title="Composition" description="Les montants cibles sont calculés sur le capital net confié." />
      {group.mode === 'exact' && <div className="group-actions">
        <button className="secondary" onClick={() => onPosition()}>Ajouter une position exacte</button>
        <button className="secondary" onClick={() => onTrade()}>Enregistrer un achat ou une vente</button>
      </div>}
      <ul className="group-allocation">{[...assets].map(([key, row]) => {
        const matched = holdings.filter(holding => quoteTarget(holding) === key)
        const stats = summarize(matched)
        const weight = holdings.every(item => item.valuation && !item.partiallyValued) && value?.gt(0) && stats.priced ? stats.amount.div(value) : null
        const mark = matched[0]?.source
        return <li key={key}>
          <div className="group-allocation-label"><AssetBadge asset={row.asset} /><div><strong>{row.asset.name}</strong>
            <small>{row.asset.listing ?? row.asset.reference}</small></div><strong>{row.percent} %</strong></div>
          <progress max={100} value={row.percent} aria-label={'Allocation de ' + row.asset.name} />
          <small>Cible · {money(row.amount, 2, group.currency)}
            {matched.length > 0 && (' · ' + quantity(matched.reduce((sum, item) => sum.plus(item.quantity), new Decimal(0))) + ' parts')}
            {stats.priced ? ' · Valeur connue ' + display.format(stats.amount) : matched.length ? ' · Cours indisponible' : ''}
            {weight !== null && ' · Poids réel ' + percentLabel(weight).replace(/^\+/, '')}
            {stats.returnRate !== null && ' · Gain latent ' + percentLabel(stats.returnRate)}
            {mark && ' · ' + (mark.originalPrice ?? mark.price) + ' ' + (mark.currency ?? 'CHF') + (quoteIsStale(mark) ? ' (cours ancien)' : '')}</small>
          {group.mode === 'exact' && <div className="group-actions">
            {group.positions.filter(position => quoteTarget(position) === key).map(position => <button key={position.id}
              className="text-button" onClick={() => onPosition(position.id)}>Modifier le lot de {quantity(position.quantity)} parts</button>)}
            <button className="text-button" onClick={() => onTrade(row.asset)}>Achat ou vente</button>
          </div>}
        </li>
      })}</ul>
      <p className="hint">Capital cible non alloué · {money(remaining, 2, group.currency)}</p>
    </section>
    <section className="panel group-list"><PanelHeading title={exact ? 'Évolution des positions du groupe' : 'Historique des valeurs déclarées'} />
      <DailyChart points={graph} label={'Valeur du groupe en ' + graphCurrency}
        format={point => money(point, 2, graphCurrency)} empty="Aucun relevé valorisable pour le moment." />
    </section>
    <section className="panel group-list"><PanelHeading title="Mouvements et relevés" />
      <form onSubmit={record} className="group-form">
        <div className="form-grid">
          <label>Événement<select value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
            <option value="valuation">Relevé de valeur totale</option><option value="deposit">Versement</option><option value="withdrawal">Retrait</option></select></label>
          <label>Date<input required type="date" min={dateInput(group.createdAt)} max={dateInput(Date.now())} value={date} onChange={event => setDate(event.target.value)} /></label>
          <label>Montant en {group.currency}<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
        </div>
        {error && <p role="alert">{error}</p>}
        <button className="secondary" disabled={busy}>Enregistrer l’événement</button>
      </form>
      <ul>{[...group.flows, ...group.valuations].sort((a, b) => b.at - a.at).map(item => <li key={item.id}>{dateLabel.format(item.at)} · {
        'kind' in item ? item.kind === 'deposit' ? 'Versement' : 'Retrait' : 'Valeur déclarée'} · {money(item.amount, 2, group.currency)}</li>)}</ul>
      {!!group.operations.length && <ul>{[...group.operations].sort((a, b) => b.at - a.at).map(item => <li key={item.id}>
        {dateLabel.format(item.at)} · {item.kind === 'buy' ? 'Achat' : 'Vente'} · {item.name} · {quantity(item.quantity)} parts{' '}
        <button className="text-button" onClick={() => onTrade(undefined, item.id)}>Modifier</button></li>)}</ul>}
      {group.allocations.length > 1 && <details><summary>Historique des allocations</summary>
        {[...group.allocations].reverse().map(snapshot => <div key={snapshot.at}><strong>{dateLabel.format(snapshot.at)}</strong>
          <ul>{snapshot.entries.map(row => <li key={quoteTarget(row.asset)}>{row.asset.listing ?? row.asset.name} · {row.percent} %</li>)}</ul></div>)}</details>}
    </section>
    <div><button className="secondary danger-text" onClick={onRemove}>Supprimer le groupe</button></div>
  </div>
}
