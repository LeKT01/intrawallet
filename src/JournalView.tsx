import { useMemo, useState } from 'react'
import { dayKey, type CurrencyDisplay } from './currency'
import { operationNames, quoteTarget, type Operation, type PortfolioData } from './ledger'
import { platformKey, quantity, unitPrice } from './portfolio'
import { Icon, PanelHeading, timestamp } from './ui'
import type { Decimal } from 'decimal.js'

export function journalEntries(data: PortfolioData) {
  return [...data.positions.map(value => ({ type: 'position' as const, value, at: value.createdAt })),
    ...data.operations.map(value => ({ type: 'operation' as const, value, at: value.at }))]
    .sort((a, b) => b.at - a.at)
}
export type JournalItem = ReturnType<typeof journalEntries>[number]

export default function JournalView({ items, platforms, display, sales, onEdit, onDelete, onAdd, filters = true }: {
  items: JournalItem[]; platforms: string[]; display: CurrencyDisplay; sales: Map<string, Decimal | null>
  onEdit: (item: JournalItem) => void; onDelete: (item: JournalItem) => void; onAdd?: () => void; filters?: boolean
}) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [platform, setPlatform] = useState('')
  const [asset, setAsset] = useState('')
  const [page, setPage] = useState(0)
  const instruments = useMemo(() => [...new Map(items.map(item => [quoteTarget(item.value), item.value.name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'fr')), [items])
  const filtered = items.filter(({ type: entryType, value }) => {
    const operation = entryType === 'operation' ? value as Operation : null
    return (!type || type === (operation?.kind ?? 'position')) && (!asset || asset === quoteTarget(value))
      && (!platform || [value.platform, operation?.destination].some(name => name && platformKey(name) === platform))
      && [value.name, value.reference, value.platform, operation?.destination].join(' ').toLowerCase().includes(query.trim().toLowerCase())
  })
  const pageSize = 20
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const index = Math.min(page, pages - 1)
  return <section className="panel table-panel journal-panel">
    <PanelHeading title={filters ? 'Journal des investissements' : 'Historique des transactions'} description={filters ? 'Acquisitions, achats, ventes et transferts.' : undefined}>
      {onAdd && <button className="primary" onClick={onAdd}><Icon name="plus" /> Ajouter une transaction</button>}
    </PanelHeading>
    {filters && <div className="filter-bar">
      <label>Recherche<input type="search" placeholder="Actif ou plateforme" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /></label>
      <label>Type<select value={type} onChange={event => { setType(event.target.value); setPage(0) }}>
        <option value="">Tous</option><option value="position">Acquisition initiale</option>
        {Object.entries(operationNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Actif<select value={asset} onChange={event => { setAsset(event.target.value); setPage(0) }}>
        <option value="">Tous</option>{instruments.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Plateforme<select value={platform} onChange={event => { setPlatform(event.target.value); setPage(0) }}>
        <option value="">Toutes</option>{platforms.map(name => <option key={name} value={platformKey(name)}>{name}</option>)}
      </select></label>
    </div>}
    {!filtered.length && <p className="inline-empty">Aucune transaction pour cette sélection.</p>}
    <ul className="journal-list">
      {filtered.slice(index * pageSize, (index + 1) * pageSize).map(item => {
        const value = item.value
        const operation = item.type === 'operation' ? item.value : null
        const position = item.type === 'position' ? item.value : null
        const gain = operation?.kind === 'sell' ? sales.get(operation.id) : undefined
        const day = dayKey(item.at)
        return <li key={item.type + '/' + value.id}>
          <span><strong>{value.name}</strong><small>{operation ? operationNames[operation.kind] : 'Acquisition initiale'} · {position?.acquiredOn ?? timestamp.format(item.at)}</small></span>
          <span><strong>{value.platform}{operation?.destination ? ' → ' + operation.destination : ''}</strong><small>{quantity(value.quantity)} unité(s)</small></span>
          <span>
            {operation && operation.kind !== 'transfer' && <strong>{operation.original ? unitPrice(operation.original.gross, operation.original.currency)
              : display.format(operation.gross, { day })}</strong>}
            {position?.purchase && <strong>{unitPrice(position.purchase.total, position.purchase.currency)}</strong>}
            {position?.purchase?.fees && position.purchase.fees !== '0' && <small>Frais {unitPrice(position.purchase.fees, position.purchase.currency)}</small>}
            {operation && operation.fee !== '0' && <small>Frais {operation.original ? unitPrice(operation.original.fee, operation.original.currency) : display.format(operation.fee, { day })}</small>}
            {operation?.feeUnits && operation.feeUnits !== '0' && <small>Frais {quantity(operation.feeUnits)} unité(s)</small>}
            {gain !== undefined && <small>Gain réalisé {gain === null ? 'indéterminé' : display.format(gain, { day, signed: true })}</small>}
          </span>
          <span className="entry-actions"><button className="text-button" onClick={() => onEdit(item)}>Modifier</button>
            <button className="text-button danger" onClick={() => onDelete(item)}>Supprimer</button></span>
        </li>
      })}
    </ul>
    {pages > 1 && <div className="pagination"><button className="secondary" disabled={!index} onClick={() => setPage(index - 1)}>Précédent</button>
      <span>Page {index + 1} sur {pages}</span><button className="secondary" disabled={index + 1 === pages} onClick={() => setPage(index + 1)}>Suivant</button></div>}
  </section>
}
