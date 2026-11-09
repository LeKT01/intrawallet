import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deletePosition, loadPositions, savePosition } from './database'
import {
  categories, consolidate, money, platformKey, quantity, signedMoney, summarize, type Position,
} from './portfolio'
import PositionForm from './PositionForm'

type Section = 'overview' | 'positions' | 'journal'
type IconName = 'overview' | 'positions' | 'journal' | 'plus' | 'lock' | 'chevron'
const sections = { overview: 'Vue d’ensemble', positions: 'Positions', journal: 'Journal' } as const

function Icon({ name }: { name: IconName }) {
  const paths = {
    overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    positions: 'M3 7h18v13H3z M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M3 12h18 M10 12v2h4v-2',
    journal: 'M5 3h14v18H5z M9 8h6 M9 12h6 M9 16h4',
    plus: 'M12 5v14 M5 12h14',
    lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
    chevron: 'm9 6 6 6-6 6',
  }
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

const timestamp = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeStyle: 'short' })

function ReadableValue({ position }: { position: Position }) {
  if (!position.valuation) return <span className="muted">Non valorisée</span>
  return <><strong>{money(position.valuation.amount)}</strong><small>Saisie manuelle · {timestamp.format(position.valuation.updatedAt)}</small></>
}

export default function App() {
  const [section, setSection] = useState<Section>('overview')
  const [editor, setEditor] = useState<Position | 'new' | null>(null)
  const [toDelete, setToDelete] = useState<Position | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)

  const loaded = useLiveQuery(async () => {
    try {
      return { positions: await loadPositions(), failed: false }
    } catch (cause) {
      console.error(cause)
      return { positions: [], failed: true }
    }
  })
  const positions = loaded?.positions ?? []
  const total = summarize(positions)
  const assets = consolidate(positions)
  const platformCount = new Set(positions.map(item => platformKey(item.platform))).size
  const unpriced = positions.length - total.priced

  function navigate(destination: Section) {
    setSection(destination)
    setMessage('')
    setActionError('')
    requestAnimationFrame(() => heading.current?.focus())
    window.scrollTo({ top: 0 })
  }

  async function confirmDelete() {
    if (!toDelete || deleting) return
    setDeleting(true)
    setActionError('')
    try {
      await deletePosition(toDelete.id)
      setToDelete(null)
      setMessage('Position supprimée.')
    } catch (cause) {
      console.error(cause)
      setActionError('La suppression a échoué. Réessaie depuis le journal.')
      setToDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const assetList = (
    <div className="asset-list">
      {assets.map(asset => (
        <details className="asset" key={asset.key}>
          <summary>
            <span className="asset-mark" aria-hidden="true">{asset.reference.slice(0, 2)}</span>
            <span className="asset-title"><strong>{asset.name}</strong><small>{categories[asset.category]} · {asset.reference}</small></span>
            <span className="asset-platforms">{asset.platformCount} plateforme{asset.platformCount !== 1 ? 's' : ''}</span>
            <span className="asset-value"><strong>{asset.priced > 0 ? money(asset.amount) : '—'}</strong>
              <small>{asset.priced < asset.entries.length ? 'Valorisation incomplète' : 'Valeur saisie'}</small>
            </span>
            <span className="disclosure"><Icon name="chevron" /></span>
          </summary>
          <div className="asset-body">
            <div className="asset-rollup">
              <span>Quantité totale <strong>{quantity(asset.quantity)}</strong></span>
              <span>Gain latent <strong>{asset.gain === null ? 'Indéterminé' : signedMoney(asset.gain)}</strong>
                {asset.gain !== null && asset.estimated && <small> Coût estimé</small>}
              </span>
            </div>
            {asset.entries.map(position => {
              const result = summarize([position])
              return (
                <div className="entry" key={position.id}>
                  <span><strong>{position.platform}</strong><small>{quantity(position.quantity)} unité(s)</small></span>
                  <span><ReadableValue position={position} />
                    {result.gain !== null && <small>Gain latent {signedMoney(result.gain)}{result.estimated ? ' · estimé' : ''}</small>}
                  </span>
                  <button className="text-button" onClick={() => setEditor(position)}>Modifier</button>
                </div>
              )
            })}
          </div>
        </details>
      ))}
    </div>
  )

  return (
    <>
      <header className="site-header">
        <div className="shell header-content">
          <button className="brand" onClick={() => navigate('overview')}><span aria-hidden="true">P</span>Portefeuille</button>
          <nav aria-label="Navigation principale">
            {(Object.keys(sections) as Section[]).map(item => (
              <button key={item} className={section === item ? 'selected' : ''}
                aria-current={section === item ? 'page' : undefined} onClick={() => navigate(item)}>
                <Icon name={item} /><span>{sections[item]}</span>
              </button>
            ))}
          </nav>
          <button className="primary header-add" disabled={!loaded || loaded.failed} onClick={() => setEditor('new')}>
            <Icon name="plus" /><span className="wide-label">Ajouter une position</span><span className="short-label">Ajouter</span>
          </button>
        </div>
      </header>

      <main className="shell main">
        <div className="page-title">
          <div><p className="eyebrow">SUIVI DES INVESTISSEMENTS</p><h1 ref={heading} tabIndex={-1}>{sections[section]}</h1></div>
          <span className="local-badge"><Icon name="lock" /> Stockage local</span>
        </div>
        <div role="status" className={message ? 'status-message' : 'sr-only'}>{message}</div>
        {actionError && <p className="error" role="alert">{actionError}</p>}
        {!loaded ? <p className="panel blank" role="status">Ouverture du portefeuille…</p> : loaded.failed ? (
          <div className="panel blank"><h2>Stockage local indisponible</h2><p>Vérifie que ce navigateur autorise le stockage du site, puis recharge la page.</p></div>
        ) : positions.length === 0 ? (
          <section className="panel empty">
            <span className="empty-icon"><Icon name={section} /></span>
            <h2>{section === 'journal' ? 'Aucune entrée dans le journal' : 'Ajoute ta première position'}</h2>
            <p>Rassemble ici tes actions, ETF et cryptos. Choisis un actif, une plateforme et une quantité pour commencer.</p>
            <button className="primary" onClick={() => setEditor('new')}><Icon name="plus" /> Ajouter une position</button>
          </section>
        ) : section === 'journal' ? (
          <section className="panel">
            <header className="panel-header"><h2>Positions ajoutées</h2><p>Les saisies de positions existantes, dans l’ordre d’ajout.</p></header>
            {[...positions].reverse().map(position => (
              <div className="entry journal-entry" key={position.id}>
                <span><strong>{position.name}</strong><small>{position.platform} · {timestamp.format(position.createdAt)}</small></span>
                <span><ReadableValue position={position} /></span>
                <span className="entry-actions">
                  <button className="text-button" onClick={() => setEditor(position)}>Modifier</button>
                  <button className="text-button danger" onClick={() => setToDelete(position)}>Supprimer</button>
                </span>
              </div>
            ))}
          </section>
        ) : (
          <>
            {section === 'overview' && (
              <section className="overview-grid" aria-label="Synthèse du portefeuille">
                <div className="panel total-panel">
                  <div className="total-header"><h2>Valeur {unpriced && total.priced ? 'connue' : 'totale'}</h2><span className="chip">CHF</span></div>
                  <p className="total-number">{total.priced ? money(total.amount) : '—'}</p>
                  <p className="muted counts">{assets.length} actif{assets.length !== 1 ? 's' : ''} · {platformCount} plateforme{platformCount !== 1 ? 's' : ''}</p>
                  {unpriced > 0 && <p className="notice">{unpriced === 1 ? 'Une position est sans valeur saisie.' : `${unpriced} positions sont sans valeur saisie.`}</p>}
                  {total.priced > 0 && unpriced === 0 && <p className="hint">Valeurs saisies manuellement.</p>}
                </div>
                <div className="panel allocation">
                  <h2>Répartition</h2><p className="hint">Par catégorie, sur la valeur connue.</p>
                  {total.amount.lte(0) ? <p className="muted">Disponible avec une valorisation positive.</p> : (
                    <ul>
                      {Object.entries(categories).map(([key, label]) => {
                        const categoryTotal = summarize(positions.filter(item => item.category === key)).amount
                        if (categoryTotal.lte(0)) return null
                        const weight = categoryTotal.div(total.amount).times(100).toNumber()
                        return <li key={key}><div><span>{label}</span><strong>{weight.toLocaleString('fr-CH', { maximumFractionDigits: 1 })} %</strong></div>
                          <div className="bar" aria-hidden="true"><span style={{ width: `${weight}%` }} /></div></li>
                      })}
                    </ul>
                  )}
                </div>
              </section>
            )}
            <section className="panel positions-panel">
              <header className="panel-header"><h2>Positions consolidées</h2><p>Ouvre un actif pour voir son détail par plateforme.</p></header>
              {assetList}
            </section>
          </>
        )}
      </main>
      {editor !== null && <PositionForm current={editor === 'new' ? null : editor} positions={positions}
        onClose={() => setEditor(null)} onSave={async position => {
          await savePosition(position, editor !== 'new')
          setMessage(editor === 'new' ? 'Position ajoutée au portefeuille.' : 'Position mise à jour.')
        }} />}
      {toDelete && <DeleteDialog position={toDelete} busy={deleting} onClose={() => setToDelete(null)} onDelete={confirmDelete} />}
    </>
  )
}

function DeleteDialog({ position, busy, onClose, onDelete }: {
  position: Position
  busy: boolean
  onClose: () => void
  onDelete: () => void
}) {
  const open = useRef(false)
  return <dialog className="delete-dialog" aria-labelledby="delete-title" ref={element => {
    if (!element) { open.current = false; return }
    if (!open.current) { element.showModal(); open.current = true }
  }} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <h2 id="delete-title">Supprimer cette position ?</h2>
    <p>{position.name} sur {position.platform} sera retiré du portefeuille.</p>
    <div className="dialog-actions">
      <button className="secondary" onClick={onClose} disabled={busy} autoFocus>Annuler</button>
      <button className="primary danger-button" onClick={onDelete} disabled={busy}>Supprimer</button>
    </div>
  </dialog>
}
