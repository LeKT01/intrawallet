import type { Category } from './portfolio.ts'

export interface CatalogAsset {
  category: Category
  name: string
  reference: string
  aliases?: string
  detail?: string
  listing?: string
  coinId?: string
  isin?: string
  market?: { code: string; currency: string }
}

function etf(name: string, reference: string, detail: string, aliases: string, listing?: string, currency?: string, isin = reference): CatalogAsset {
  const venue = listing?.startsWith('XSWX:') ? 'SW' : listing?.startsWith('XETR:') ? 'XETRA' : undefined
  const market = listing && venue && currency ? { code: listing.slice(5) + '.' + venue, currency } : undefined
  return { category: 'etf', name, reference, isin, aliases, detail, listing, market }
}

// Identifiers come from issuer factsheets or the Swiss justETF directory.
export const catalog: CatalogAsset[] = [
  etf('Vanguard S&P 500 UCITS ETF', 'IE00BFMXXD54', 'Capitalisant', 'VUAA VUAG', 'XETR:VUAA'),
  etf('Vanguard S&P 500 UCITS ETF', 'IE00B3XXRP09', 'Distribuant', 'VUSA VUSD', 'XSWX:VUSA', 'CHF'),
  { category: 'etf', name: 'Vanguard S&P 500 UCITS ETF', reference: 'TGAT:VUSA', isin: 'IE00B3XXRP09',
    aliases: 'VUSA', detail: 'Distribuant · Tradegate', listing: 'TGAT:VUSA', market: { code: 'VUSA.TGAT', currency: 'EUR' } },
  etf('Vanguard S&P 500 ETF', 'US9229083632', 'Distribuant · cotation américaine', 'VOO', 'ARCX:VOO'),
  etf('iShares Nasdaq 100 UCITS ETF', 'IE00B53SZB19', 'Capitalisant · SIX Swiss Exchange', 'CNDX CSNDX SXRV', 'XSWX:CSNDX', 'USD'),
  etf('iShares Core S&P 500 UCITS ETF', 'IE00B5BMR087', 'Capitalisant', 'CSPX SXR8 CSSPX', 'XSWX:CSSPX', 'USD'),
  etf('iShares Core S&P 500 UCITS ETF', 'IE0031442068', 'Distribuant', 'IUSA IDUS', 'XSWX:IUSA', 'USD'),
  etf('iShares Nasdaq 100 UCITS ETF EUR Hedged', 'IE00BYVQ9F29', 'Capitalisant · Couvert en euros · Xetra', 'NQSE', 'XETR:NQSE', 'EUR'),
  etf('Invesco EQQQ Nasdaq-100 UCITS ETF', 'IE0032077012', 'Distribuant', 'EQQQ', 'XSWX:EQQQ', 'USD'),
  etf('Invesco EQQQ Nasdaq-100 UCITS ETF', 'IE00BFZXGZ54', 'Capitalisant', 'EQAC', 'XSWX:EQAC', 'USD'),
  etf('Invesco EQQQ Nasdaq-100 UCITS ETF EUR Hedged', 'IE00BYVTMS52', 'Capitalisant · Couvert en euros', 'EQEU', 'XSWX:EQEU', 'EUR'),
  etf('Invesco EQQQ Nasdaq-100 UCITS ETF CHF Hedged', 'IE00BYVTMT69', 'Capitalisant · Couvert en francs suisses', 'EQCH', 'XSWX:EQCH', 'CHF'),
  etf('Invesco Nasdaq-100 Swap UCITS ETF', 'IE00BNRQM384', 'Capitalisant · Réplication synthétique', 'EQQS', 'XSWX:EQQS', 'USD'),
  etf('Xtrackers Nasdaq 100 UCITS ETF 1C', 'IE00BMFKG444', 'Capitalisant', 'XNAS', 'XSWX:XNAS', 'CHF'),
  etf('UBS Nasdaq-100 UCITS ETF', 'IE000SB4G4I4', 'Capitalisant', 'QQQA', 'XSWX:QQQA', 'USD'),
  etf('Invesco S&P 500 UCITS ETF', 'IE00B3YCGJ38', 'Capitalisant · Réplication synthétique', 'SPXS', 'XSWX:SPXS', 'USD'),
  etf('Xtrackers S&P 500 Swap UCITS ETF 1C', 'LU0490618542', 'Capitalisant · Réplication synthétique', 'XSPX', 'XSWX:XSPX', 'CHF'),
  etf('UBS Core S&P 500 UCITS ETF', 'IE00B7K93397', 'Distribuant', 'SP5USY', 'XSWX:SP5USY', 'USD'),
  etf('State Street SPDR S&P 500 UCITS ETF', 'IE000XZSV718', 'Capitalisant', 'SPYL', 'XSWX:SPYL', 'USD'),
  etf('Vanguard FTSE All-World UCITS ETF', 'IE00BK5BQT80', 'Capitalisant', 'VWCE VWRP', 'XETR:VWCE'),
  etf('Vanguard FTSE All-World UCITS ETF', 'XSWX:VWRA', 'Capitalisant · cotation suisse', 'VWRA', 'XSWX:VWRA', 'CHF', 'IE00BK5BQT80'),
  etf('Vanguard FTSE All-World UCITS ETF', 'IE00B3RBWM25', 'Distribuant', 'VWRL VWRD', 'XSWX:VWRL', 'CHF'),
  etf('iShares Core MSCI World UCITS ETF', 'IE00B4L5Y983', 'Capitalisant', 'SWDA IWDA EUNL', 'XSWX:SWDA', 'USD'),
  etf('iShares Core MSCI Emerging Markets IMI UCITS ETF', 'IE00BKM4GZ66', 'Capitalisant', 'EIMI IS3N EMIM', 'XSWX:EIMI', 'USD'),
  etf('Amundi Core S&P 500 Swap UCITS ETF', 'LU1135865084', 'Capitalisant', 'LYP5'),
  etf('Amundi MSCI Europe UCITS ETF', 'FR0010261198', 'Capitalisant', 'LYM5 LYY5'),
  etf('Amundi Core MSCI Emerging Markets Swap UCITS ETF', 'LU2573967036', 'Capitalisant', 'LEMA'),
  etf('Amundi Core STOXX Europe 600 UCITS ETF', 'LU0908500753', 'Capitalisant', 'LYP6 MEUD'),
  etf('Xtrackers MSCI World Industrials UCITS ETF 1C', 'IE00BM67HV82', 'Capitalisant', 'XDWI', 'XSWX:XDWI', 'CHF'),
  ...([
    ['Bitcoin', 'BTC', 'bitcoin'], ['Ethereum', 'ETH', 'ethereum'], ['Solana', 'SOL', 'solana'],
    ['XRP', 'XRP', 'ripple'], ['Cardano', 'ADA', 'cardano'], ['Dogecoin', 'DOGE', 'dogecoin'],
    ['BNB', 'BNB', 'binancecoin'], ['Avalanche', 'AVAX', 'avalanche-2'], ['Chainlink', 'LINK', 'chainlink'],
    ['Litecoin', 'LTC', 'litecoin'], ['Polkadot', 'DOT', 'polkadot'], ['USD Coin', 'USDC', 'usd-coin'],
    ['Tether', 'USDT', 'tether'], ['Bittensor', 'TAO', 'bittensor'], ['Render', 'RENDER', 'render-token'],
  ] as const).map(([name, reference, coinId]) => ({ category: 'crypto' as const, name, reference, coinId })),
  ...([
    ['Apple', 'XNAS:AAPL'], ['Microsoft', 'XNAS:MSFT'], ['NVIDIA', 'XNAS:NVDA'],
    ['Alphabet classe A', 'XNAS:GOOGL'], ['Amazon', 'XNAS:AMZN'], ['Tesla', 'XNAS:TSLA'],
    ['Nestlé', 'XSWX:NESN'], ['Novartis', 'XSWX:NOVN'], ['Roche (bon de jouissance)', 'XSWX:ROG'],
    ['UBS Group', 'XSWX:UBSG'],
  ] as const).map(([name, reference]) => ({ category: 'stock' as const, name, reference, listing: reference })),
]

const byReference = new Map<string, CatalogAsset>()
for (const asset of catalog) {
  const key = asset.category + '/' + asset.reference
  if (!byReference.has(key)) byReference.set(key, asset)
  if (asset.listing) byReference.set(asset.category + '/' + asset.listing, asset)
}

export function catalogEntry(category: Category, reference: string) {
  return byReference.get(category + '/' + reference)
}

const cryptoById = new Map(catalog.flatMap(asset => asset.coinId ? [[asset.coinId, asset] as const] : []))
const coinIdPattern = /^[a-z0-9][a-z0-9-]{0,99}$/

export function coinGeckoId(asset: Pick<CatalogAsset, 'category' | 'reference'>) {
  if (asset.category !== 'crypto') return undefined
  const id = asset.reference.startsWith('coingecko:') ? asset.reference.slice(10) : ''
  return catalogEntry(asset.category, asset.reference)?.coinId ?? (coinIdPattern.test(id) ? id : undefined)
}

export function coinGeckoAsset(id: unknown, name: unknown, symbol: unknown): CatalogAsset | null {
  if (typeof id !== 'string' || !coinIdPattern.test(id) || typeof name !== 'string' || !name.trim()
    || typeof symbol !== 'string' || !symbol.trim()) return null
  return {
    category: 'crypto', reference: cryptoById.get(id)?.reference ?? 'coingecko:' + id,
    name: name.trim().slice(0, 100), detail: symbol.trim().toUpperCase().slice(0, 30) + ' · CoinGecko',
  }
}

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function searchCatalog(category: Category, query: string) {
  const words = normalize(query).split(' ').filter(Boolean)
  const index = category === 'etf' ? query.match(/\b(?:s\s*&?\s*p\s*500|nasdaq[\s-]*100)\b/i)?.[0] : undefined
  const indexName = index && normalize(index).replaceAll(' ', '')
  return catalog.filter(asset => {
    if (asset.category !== category) return false
    if (indexName && !normalize(asset.name).replaceAll(' ', '').includes(indexName)) return false
    const searchable = normalize([asset.name, asset.reference, asset.isin, asset.aliases, asset.detail, asset.listing].join(' '))
    return words.every(word => searchable.includes(word))
      || searchable.replaceAll(' ', '').includes(words.join(''))
  })
}
