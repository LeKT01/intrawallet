import { Decimal } from 'decimal.js'
import { replay, type PortfolioData } from './ledger.ts'
import { categories } from './portfolio.ts'

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
    && (value.listing === undefined || string(value.listing, 50))
    && (value.market === undefined || (object(value.market) && typeof value.market.code === 'string'
      && /^[A-Z0-9][A-Z0-9._-]{0,30}\.(US|SW|XETRA|PA|AS|BR|MI)$/.test(value.market.code)
      && typeof value.market.currency === 'string' && /^(CHF|EUR|USD)$/.test(value.market.currency)))
}

function opening(value: unknown) {
  if (!object(value) || !identity(value) || !time(value.createdAt) || !unitAmount(value.quantity, true)) return false
  if (value.initialValue !== undefined && value.initialValue !== null && !decimal(value.initialValue)) return false
  const isDate = (date: unknown) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  if (value.acquiredOn !== undefined && !isDate(value.acquiredOn)) return false
  if (value.purchase !== undefined && (!object(value.purchase) || !decimal(value.purchase.total)
    || !decimal(value.purchase.rate, 0, true) || !['CHF', 'EUR', 'USD'].includes(String(value.purchase.currency))
    || (value.purchase.date !== undefined && !isDate(value.purchase.date)))) return false
  const valuation = value.valuation
  if (valuation !== null && (!object(valuation) || !decimal(valuation.amount) || !time(valuation.updatedAt))) return false
  const cost = value.cost
  return cost === null || (object(cost) && decimal(cost.amount) && (cost.kind === 'exact'
    || (cost.kind === 'estimated' && decimal(cost.initialPercent, -100, true) && decimal(cost.initialValue, 0, true))))
}

function operation(value: unknown) {
  if (!object(value) || !identity(value) || !time(value.createdAt) || !time(value.at)
    || !unitAmount(value.quantity, true) || !decimal(value.fee)) return false
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
    && (value.timing === undefined || value.timing === 'close' || value.timing === 'reported')
  return value.kind === 'manual' && (value.price === null || decimal(value.price))
}

function validList(value: unknown, validate: (entry: unknown) => boolean) {
  return Array.isArray(value) && value.every(validate) && new Set(value.map(entry => entry.id)).size === value.length
}

export function backupText(data: PortfolioData) {
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
  const data = { positions: parsed.positions, operations: parsed.operations, marks: parsed.marks } as PortfolioData
  replay(data)
  return data
}
