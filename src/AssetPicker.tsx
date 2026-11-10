import { useRef, useState } from 'react'
import { catalogEntry, searchCatalog, type CatalogAsset } from './catalog'
import { searchMarket } from './quotes'
import { categories, type Category } from './portfolio'

export type AssetInput = Pick<CatalogAsset, 'category' | 'reference' | 'name' | 'listing' | 'detail' | 'aliases' | 'isin' | 'market'>
export type ChosenAsset = Pick<CatalogAsset, 'category' | 'reference' | 'name' | 'listing' | 'isin' | 'market'>

export function assetDescription(asset: AssetInput) {
  const metadata = catalogEntry(asset.category, asset.reference) ?? asset
  const listing = asset.listing ?? metadata.listing
  const isin = asset.isin ?? metadata.isin
  const reference = !listing && !isin && !asset.reference.startsWith('MANUAL:') ? asset.reference : null
  return [asset.detail ?? metadata.detail, listing, asset.market?.currency, isin, reference]
    .filter(Boolean).join(' · ')
}

export function customAsset(category: Category, name: string, identifier: string): ChosenAsset | null {
  const cleanedName = name.trim()
  const code = identifier.trim().toUpperCase()
  if (!cleanedName) return null
  const normalized = cleanedName.normalize('NFKC').toLocaleUpperCase('fr-CH').replace(/\s+/g, ' ')
  return {
    category, name: cleanedName,
    reference: code || 'MANUAL:' + normalized,
    listing: /^[A-Z0-9]{4}:[A-Z0-9._-]+$/.test(code) ? code : undefined,
  }
}

interface Props {
  category: Category
  selected: AssetInput | null
  onCategory: (category: Category) => void
  onChoose: (asset: AssetInput | null) => void
  marketKey?: string
  onCustom: (asset: ChosenAsset | null) => void
}

export default function AssetPicker({ category, selected, onCategory, onChoose, onCustom, marketKey }: Props) {
  const [query, setQuery] = useState('')
  const [manual, setManual] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [marketResults, setMarketResults] = useState<AssetInput[]>([])
  const [marketStatus, setMarketStatus] = useState('')
  const [searching, setSearching] = useState(false)
  const searchId = useRef(0)
  function resetMarket() {
    searchId.current += 1
    setMarketResults([])
    setMarketStatus('')
    setSearching(false)
  }
  async function lookup() {
    if (!marketKey || category === 'crypto' || query.trim().length < 2 || searching) return
    const id = ++searchId.current
    setSearching(true)
    setMarketStatus('')
    try {
      const items = await searchMarket(category, query, marketKey)
      if (id !== searchId.current) return
      setMarketResults(items)
      setMarketStatus(items.length ? '' : 'Aucun titre compatible trouvé. Essaie un symbole ou un ISIN.')
    } catch (cause) {
      if (id === searchId.current) setMarketStatus(cause instanceof Error ? cause.message : 'Recherche indisponible.')
    } finally {
      if (id === searchId.current) setSearching(false)
    }
  }

  const results = searchCatalog(category, query)
  const limit = query.trim() ? 14 : 6

  function resetCustom() {
    setManual(false)
    setName('')
    setCode('')
    onCustom(null)
  }

  if (selected) return (
    <div className="asset-selection">
      <div><span className="eyebrow">{categories[selected.category].toUpperCase()}</span>
        <strong>{selected.name}</strong><small>{assetDescription(selected)}</small></div>
      <button type="button" className="text-button" onClick={() => { onChoose(null); setQuery(''); resetMarket() }}>Changer d’actif</button>
    </div>
  )

  return (
    <div className="picker">
      <div className="segments" role="group" aria-label="Catégorie d’actif">
        {(Object.keys(categories) as Category[]).map(key => <button className="secondary segment-button"
          aria-pressed={category === key} type="button" key={key}
          onClick={() => { onCategory(key); resetCustom(); setQuery(''); resetMarket() }}>{categories[key]}</button>)}
      </div>
      {manual ? (
        <div className="form-grid manual-asset">
          <label className="full">Nom de l’actif
            <input value={name} maxLength={100} placeholder="Ex. Vanguard Global Aggregate Bond"
              onChange={event => { setName(event.target.value); onCustom(customAsset(category, event.target.value, code)) }} />
          </label>
          <label className="full">Symbole ou ISIN <small>facultatif</small>
            <input value={code} maxLength={50} placeholder="Laisse vide si tu ne le connais pas"
              onChange={event => { setCode(event.target.value); onCustom(customAsset(category, name, event.target.value)) }} />
          </label>
          <p className="hint full">Pour regrouper un actif ajouté à la main, utilise le même identifiant ou le même nom sur chaque plateforme.</p>
          <button type="button" className="text-button picker-link full" onClick={resetCustom}>Revenir à la recherche</button>
        </div>
      ) : (
        <>
          <label className="search-label">Rechercher {category === 'etf' ? 'un ETF' : category === 'stock' ? 'une action' : 'une crypto'}
            <input type="search" value={query} maxLength={100}
              placeholder={category === 'etf' ? 'Ex. S&P 500, Vanguard, Nasdaq ou VUAA' : category === 'stock' ? 'Ex. Apple ou Nestlé' : 'Ex. Bitcoin ou ETH'}
              onChange={event => { setQuery(event.target.value); resetMarket() }}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void lookup() } }} />
          </label>
          <ul className="picker-list" aria-label="Actifs proposés">
            {results.slice(0, limit).map(asset => <li key={asset.reference}>
              <button type="button" onClick={() => { resetCustom(); onChoose(asset) }}>
                <strong>{asset.name}</strong><small>{assetDescription(asset)}</small>
              </button>
            </li>)}
          </ul>
          {marketKey && category !== 'crypto' && query.trim().length >= 2 && <div className="market-search">
            <button type="button" className="secondary" disabled={searching} onClick={() => void lookup()}>
              {searching ? 'Recherche…' : 'Rechercher sur les marchés'}
            </button>
            {marketStatus && <p className="hint" role="status">{marketStatus}</p>}
            {marketResults.length > 0 && <ul className="picker-list" aria-label="Résultats EODHD">
              {marketResults.map(asset => <li key={asset.market?.code}><button type="button" onClick={() => { resetCustom(); onChoose(asset) }}>
                <strong>{asset.name}</strong><small>{assetDescription(asset)}</small>
              </button></li>)}
            </ul>}
          </div>}
          {results.length === 0 && <p className="hint">Aucun résultat dans le catalogue.</p>}
          {results.length > limit && <p className="hint">Tape un nom ou un symbole pour affiner la liste.</p>}
          <button type="button" className="text-button picker-link" onClick={() => setManual(true)}>Ajouter un actif manuellement</button>
        </>
      )}
    </div>
  )
}
