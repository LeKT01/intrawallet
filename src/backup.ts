import type { DailySeries } from './database.ts'
import { validateGroup, type InvestmentGroup } from './groups.ts'
import { Decimal } from 'decimal.js'
import { replay, type PortfolioData } from './ledger.ts'
import { categories, platformKey } from './portfolio.ts'

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function string(value: unknown, max = 160): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

function time(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= Date.now() + 300000
}

function decimal(value: unknown, minimum = 0, exclusive = false) {
  if (!string(value, 150) || !/^[+-]?\d+(?:\.\d+)?$/.test(value)) return false
  const amount = new Decimal(value)
  return exclusive ? amount.gt(minimum) : amount.gte(minimum)
}

function unitAmount(value: unknown, exclusive = false) {
  return typeof value === 'string' && /^\+?\d{1,18}(?:\.\d{1,18})?$/.test(value)
    && decimal(value, 0, exclusive)
}

function identity(value: Record<string, unknown>) {
  return string(value.id, 512) && typeof value.category === 'string' && Object.hasOwn(categories, value.category)
    && string(value.name, 100) && string(value.reference) && string(value.platform, 80)
    && (value.isin === undefined || (typeof value.isin === 'string' && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value.isin)))
    && (value.listing === undefined || string(value.listing, 50))
    && (value.market === undefined || (object(value.market) && typeof value.market.code === 'string'
      && /^[A-Z0-9][A-Z0-9._-]{0,30}\.(US|SW|XETRA|TGAT|PA|AS|BR|MI)$/.test(value.market.code)
      && typeof value.market.currency === 'string' && /^(CHF|EUR|USD)$/.test(value.market.currency)))
}

function opening(value: unknown) {
  if (!object(value) || !identity(value) || !time(value.createdAt) || !unitAmount(value.quantity, true)) return false
  if (value.initialValue !== undefined && value.initialValue !== null && !decimal(value.initialValue)) return false
  const isDate = (date: unknown) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  if (value.acquiredOn !== undefined && !isDate(value.acquiredOn)) return false
  if (value.purchase !== undefined && (!object(value.purchase) || !decimal(value.purchase.total)
    || !decimal(value.purchase.rate, 0, true) || !['CHF', 'EUR', 'USD'].includes(String(value.purchase.currency))
    || (value.purchase.unit !== undefined && !decimal(value.purchase.unit))
    || (value.purchase.fees !== undefined && !decimal(value.purchase.fees))
    || (value.purchase.date !== undefined && !isDate(value.purchase.date)))) return false
  const valuation = value.valuation
  if (valuation !== null && (!object(valuation) || !decimal(valuation.amount) || !time(valuation.updatedAt))) return false
  if (object(valuation) && valuation.manual !== undefined && (!object(valuation.manual)
    || !unitAmount(valuation.manual.amount, true) || !['CHF', 'EUR', 'USD'].includes(String(valuation.manual.currency)))) return false
  const cost = value.cost
  return cost === null || (object(cost) && decimal(cost.amount) && (cost.kind === 'exact'
    || (cost.kind === 'estimated' && decimal(cost.initialPercent, -100, true) && decimal(cost.initialValue, 0, true))))
}

function operation(value: unknown) {
  if (!object(value) || !identity(value) || !time(value.createdAt) || !time(value.at)
    || !unitAmount(value.quantity, true) || !decimal(value.fee)) return false
  if (value.original !== undefined && (!object(value.original) || !decimal(value.original.gross)
    || !decimal(value.original.fee) || !decimal(value.original.rate, 0, true)
    || !['CHF', 'EUR', 'USD'].includes(String(value.original.currency)))) return false
  if (value.kind === 'buy') return decimal(value.gross, 0, true)
  if (value.kind === 'sell') return decimal(value.gross)
  return value.kind === 'transfer' && decimal(value.gross) && string(value.destination, 80)
    && typeof value.platform === 'string' && value.destination.toLowerCase() !== value.platform.toLowerCase()
    && (value.feeUnits === undefined || unitAmount(value.feeUnits))
}

function mark(value: unknown) {
  if (!object(value) || !string(value.id, 512) || !string(value.target, 512) || !string(value.source, 80)
    || !time(value.at) || !time(value.sourceAt)) return false
  if (value.kind === 'market') return decimal(value.price)
    && (value.originalPrice === undefined || decimal(value.originalPrice, 0, true))
    && (value.currency === undefined || ['CHF', 'EUR', 'USD'].includes(String(value.currency)))
    && (value.instrument === undefined || string(value.instrument, 64))
    && (value.receivedAt === undefined || time(value.receivedAt))
    && (value.timing === undefined || value.timing === 'close' || value.timing === 'reported')
  return value.kind === 'manual' && (value.price === null || decimal(value.price))
    && (value.originalPrice === undefined || decimal(value.originalPrice, 0, true))
    && (value.currency === undefined || ['CHF', 'EUR', 'USD'].includes(String(value.currency)))
    && (value.instrument === undefined || string(value.instrument))
}

function validList(value: unknown, validate: (entry: unknown) => boolean) {
  return Array.isArray(value) && value.every(validate) && new Set(value.map(entry => entry.id)).size === value.length
}

export type PortfolioBackup = PortfolioData & { dailyPrices?: DailySeries[] }

export function backupText(data: PortfolioBackup) {
  return JSON.stringify({ format: 'portefeuille-local', version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2)
}

export function readBackup(text: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Ce fichier ne contient pas une sauvegarde JSON valide.')
  }
  if (!object(parsed) || parsed.format !== 'portefeuille-local' || parsed.version !== 1
    || !validList(parsed.positions, opening) || !validList(parsed.operations, operation) || !validList(parsed.marks, mark)) {
    throw new Error('Format de sauvegarde inconnu ou données invalides.')
  }
  if (parsed.platforms !== undefined && (!Array.isArray(parsed.platforms) || !parsed.platforms.every(name => string(name, 80))
    || new Set(parsed.platforms.map(platformKey)).size !== parsed.platforms.length)) throw new Error('Liste de plateformes invalide.')
  const daily = parsed.dailyPrices
  if (daily !== undefined && (!Array.isArray(daily) || !daily.every(series => object(series)
    && string(series.target, 512) && time(series.fetchedAt)
    && (series.instrument === undefined || (object(series.instrument)
      && string(series.instrument.code, 64) && ['CHF', 'EUR', 'USD'].includes(String(series.instrument.currency))))
    && validList(series.marks, entry => mark(entry) && object(entry) && entry.kind === 'market'))
    || new Set(daily.map(series => series.target)).size !== daily.length)) {
    throw new Error('Historique des cotations invalide.')
  }
  if (parsed.groups !== undefined && !validList(parsed.groups, value => {
    if (!object(value) || !string(value.id, 512) || !string(value.name, 100) || !string(value.platform, 80)
      || !validList(value.positions, opening) || !validList(value.operations, operation)
      || !Array.isArray(value.allocations) || !value.allocations.every(snapshot => object(snapshot) && time(snapshot.at)
        && Array.isArray(snapshot.entries) && snapshot.entries.every(entry => object(entry) && object(entry.asset)
          && identity({ ...entry.asset, id: value.id, platform: value.platform })))
      || !validList(value.flows, entry => object(entry) && string(entry.id) && time(entry.at))
      || !validList(value.valuations, entry => object(entry) && string(entry.id) && time(entry.at))) return false
    try { validateGroup(value as unknown as InvestmentGroup); return true } catch { return false }
  })) throw new Error('Portefeuilles groupés invalides.')
  const data = { ...(parsed.groups === undefined ? {} : { groups: parsed.groups }), ...(parsed.platforms === undefined ? {} : { platforms: parsed.platforms }),
    ...(daily === undefined ? {} : { dailyPrices: daily }), positions: parsed.positions,
    operations: parsed.operations, marks: parsed.marks } as PortfolioBackup
  replay(data)
  return data
}
