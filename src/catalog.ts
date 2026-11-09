import type { Category } from './portfolio.ts'

export interface CatalogAsset {
  category: Category
  name: string
  reference: string
  aliases?: string
  detail?: string
  listing?: string
  coinId?: string
}

function etf(name: string, reference: string, detail: string, aliases: string, listing?: string): CatalogAsset {
  return { category: 'etf', name, reference, aliases, detail, listing }
}

// Identifiers come from issuer factsheets or the Swiss justETF directory.
export const catalog: CatalogAsset[] = [
  etf('Vanguard S&P 500 UCITS ETF', 'IE00BFMXXD54', 'Capitalisant', 'VUAA VUAG', 'XETR:VUAA'),
  etf('Vanguard S&P 500 UCITS ETF', 'IE00B3XXRP09', 'Distribuant', 'VUSA VUSD', 'XSWX:VUSA'),
  etf('Vanguard S&P 500 ETF', 'US9229083632', 'Distribuant · cotation américaine', 'VOO', 'ARCX:VOO'),
  etf('iShares Nasdaq 100 UCITS ETF', 'IE00B53SZB19', 'Capitalisant', 'CNDX CSNDX SXRV', 'XSWX:CSNDX'),
  etf('iShares Core S&P 500 UCITS ETF', 'IE00B5BMR087', 'Capitalisant', 'CSPX SXR8 CSSPX', 'XSWX:CSSPX'),
  etf('iShares Core S&P 500 UCITS ETF', 'IE0031442068', 'Distribuant', 'IUSA IDUS'),
  etf('Vanguard FTSE All-World UCITS ETF', 'IE00BK5BQT80', 'Capitalisant', 'VWCE VWRP VWRA', 'XETR:VWCE'),
  etf('Vanguard FTSE All-World UCITS ETF', 'IE00B3RBWM25', 'Distribuant', 'VWRL VWRD', 'XSWX:VWRL'),
  etf('iShares Core MSCI World UCITS ETF', 'IE00B4L5Y983', 'Capitalisant', 'SWDA IWDA EUNL', 'XSWX:SWDA'),
  etf('iShares Core MSCI Emerging Markets IMI UCITS ETF', 'IE00BKM4GZ66', 'Capitalisant', 'EIMI IS3N EMIM'),
  etf('Amundi Core S&P 500 Swap UCITS ETF', 'LU1135865084', 'Capitalisant', 'LYP5'),
  etf('Amundi MSCI Europe UCITS ETF', 'FR0010261198', 'Capitalisant', 'LYM5 LYY5'),
  etf('Amundi Core MSCI Emerging Markets Swap UCITS ETF', 'LU2573967036', 'Capitalisant', 'LEMA'),
  etf('Amundi Core STOXX Europe 600 UCITS ETF', 'LU0908500753', 'Capitalisant', 'LYP6 MEUD'),
  etf('Xtrackers MSCI World Industrials UCITS ETF 1C', 'IE00BM67HV82', 'Capitalisant', 'XDWI'),
  ...([
    ['Bitcoin', 'BTC', 'bitcoin'], ['Ethereum', 'ETH', 'ethereum'], ['Solana', 'SOL', 'solana'],
    ['XRP', 'XRP', 'ripple'], ['Cardano', 'ADA', 'cardano'], ['Dogecoin', 'DOGE', 'dogecoin'],
    ['BNB', 'BNB', 'binancecoin'], ['Avalanche', 'AVAX', 'avalanche-2'], ['Chainlink', 'LINK', 'chainlink'],
    ['Litecoin', 'LTC', 'litecoin'], ['Polkadot', 'DOT', 'polkadot'], ['USD Coin', 'USDC', 'usd-coin'],
    ['Tether', 'USDT', 'tether'],
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
  byReference.set(asset.category + '/' + asset.reference, asset)
  if (asset.listing) byReference.set(asset.category + '/' + asset.listing, asset)
}

export function catalogEntry(category: Category, reference: string) {
  return byReference.get(category + '/' + reference)
}

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function searchCatalog(category: Category, query: string) {
  const words = normalize(query).split(' ').filter(Boolean)
  return catalog.filter(asset => {
    if (asset.category !== category) return false
    const searchable = normalize([asset.name, asset.reference, asset.aliases, asset.detail, asset.listing].join(' '))
    return words.every(word => searchable.includes(word))
      || searchable.replaceAll(' ', '').includes(words.join(''))
  })
}
