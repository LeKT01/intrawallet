import { validateGroup, type InvestmentGroup } from './groups.ts'
import type { PortfolioBackup } from './backup.ts'
import { Dexie, type EntityTable } from 'dexie'
import { assetKey, platformKey, type Position } from './portfolio.ts'
import { dayKey } from './currency.ts'
import { demoMode, makeDemo } from './demo.ts'
import { firstTrackingDate, replay, unitMark, type Mark, type Operation, type PortfolioData } from './ledger.ts'

export interface DailySeries { target: string; fetchedAt: number; marks: Mark[]; instrument?: Position['market'] }

const db = new Dexie(demoMode ? 'portefeuille-local-demo' : 'portefeuille-local') as Dexie & {
  positions: EntityTable<Position, 'id'>
  operations: EntityTable<Operation, 'id'>
  marks: EntityTable<Mark, 'id'>
  dailyPrices: EntityTable<DailySeries, 'target'>
  groups: EntityTable<InvestmentGroup, 'id'>
  platforms: EntityTable<{ id: string; name: string }, 'id'>
}

db.version(1).stores({ positions: 'id,createdAt' })
db.version(2).stores({ positions: 'id,createdAt', operations: 'id,at', marks: 'id,[kind+target]' })
db.version(3).stores({ dailyPrices: 'target' })
db.version(4).stores({ platforms: 'id' })
db.version(5).stores({ groups: 'id' })

if (demoMode) db.on('populate', transaction => {
  const { positions, operations, marks } = makeDemo()
  return Promise.all([
    transaction.table<Position, string>('positions').bulkAdd(positions),
    transaction.table<Operation, string>('operations').bulkAdd(operations),
    transaction.table<Mark, string>('marks').bulkAdd(marks),
  ])
})

export const loadDailyPrices = () => db.dailyPrices.toArray()
export const loadDailySeries = (target: string) => db.dailyPrices.get(target)
export function saveDailyPrices(series: DailySeries) {
  return db.transaction('rw', db.dailyPrices, async () => {
    const existing = await db.dailyPrices.get(series.target)
    const sameInstrument = !series.instrument || !existing?.instrument || existing.instrument.code === series.instrument.code
    const byDay = new Map(sameInstrument ? existing?.marks.map(mark => [dayKey(mark.at), mark]) : undefined)
    for (const mark of series.marks) {
      const day = dayKey(mark.at)
      const previous = byDay.get(day)
      if (!previous || previous.sourceAt <= mark.sourceAt) byDay.set(day, mark)
    }
    return db.dailyPrices.put({ target: series.target, fetchedAt: Math.max(series.fetchedAt, existing?.fetchedAt ?? 0),
      marks: [...byDay.values()], instrument: series.instrument ?? existing?.instrument })
  })
}

export function onPortfolioOpenBlocked(listener: () => void) {
  db.on('blocked', listener)
  return () => { db.on('blocked').unsubscribe(listener) }
}

export async function loadPortfolio(): Promise<PortfolioData> {
  return db.transaction('r', [db.positions, db.operations, db.marks, db.platforms, db.groups], async () => {
    const [positions, operations, marks, platforms, groups] = await Promise.all([
      db.positions.orderBy('createdAt').toArray(),
      db.operations.orderBy('at').toArray(),
      db.marks.toArray(),
      db.platforms.toArray(),
      db.groups.toArray(),
    ])
    return { positions, operations, marks, groups, platforms: platforms.map(platform => platform.name) }
  })
}

const write = <T,>(callback: () => Promise<T>) =>
  db.transaction('rw', [db.positions, db.operations, db.marks, db.platforms, db.groups], callback)

export function savePosition(position: Position, editing: boolean, quote?: Mark) {
  return write(async () => {
    const data = await loadPortfolio()
    const previous = data.positions.find(item => item.id === position.id)
    if (editing && !previous) throw new Error('Cette position a été supprimée dans un autre onglet.')
    const positions = previous ? data.positions.map(item => item.id === position.id ? position : item)
      : [...data.positions, position]
    const marks = [...data.marks]
    const oldMark = previous && unitMark(previous)
    if (oldMark && !marks.some(item => item.id === oldMark.id)) {
      marks.push(oldMark)
      await db.marks.add(oldMark)
    }
    const manual = previous?.valuation?.updatedAt === position.valuation?.updatedAt ? null : unitMark(position)
    if (manual) {
      await db.marks.put(manual)
      marks.push(manual)
    } else if (previous?.valuation && !position.valuation) {
      const now = Date.now()
      const removed: Mark = { id: 'manual/' + position.id + '/' + now, kind: 'manual', target: position.id,
        price: null, at: now, sourceAt: now, source: 'Saisie manuelle' }
      await db.marks.put(removed)
      marks.push(removed)
    }
    if (quote && !marks.some(mark => mark.id === quote.id)) {
      await db.marks.add(quote)
      marks.push(quote)
    }
    replay({ ...data, positions, marks })
    if (editing) await db.positions.put(position)
    else await db.positions.add(position)
  })
}

export function deletePosition(id: string) {
  return write(async () => {
    const data = await loadPortfolio()
    replay({ ...data, positions: data.positions.filter(position => position.id !== id) })
    await db.positions.delete(id)
    await db.marks.where('[kind+target]').equals(['manual', id]).delete()
  })
}

export function saveOperation(operation: Operation, editing: boolean) {
  return write(async () => {
    const data = await loadPortfolio()
    if (editing && !data.operations.some(item => item.id === operation.id)) {
      throw new Error('Cette opération a été supprimée dans un autre onglet.')
    }
    const operations = data.operations.filter(item => item.id !== operation.id)
    const start = firstTrackingDate(data)
    if (Number.isFinite(start) && operation.at < start) {
      throw new Error('La date doit être comprise dans la période de suivi.')
    }
    replay({ ...data, operations: [...operations, operation] })
    if (editing) await db.operations.put(operation)
    else await db.operations.add(operation)
  })
}

export function deleteOperation(id: string) {
  return write(async () => {
    const data = await loadPortfolio()
    replay({ ...data, operations: data.operations.filter(operation => operation.id !== id) })
    await db.operations.delete(id)
  })
}

export function saveMarks(marks: Mark[]) {
  return write(async () => {
    const { positions, operations, groups } = await loadPortfolio()
    const targets = new Set([...positions, ...operations, ...(groups ?? []).flatMap(group => [...group.positions, ...group.operations])].map(assetKey))
    const existing = await db.marks.bulkGet(marks.map(mark => mark.id))
    const fresh = marks.filter((mark, index) => !existing[index] && targets.has(mark.target))
    await db.marks.bulkAdd(fresh)
    return fresh.length
  })
}

export function savePlatform(name: string, previous?: string) {
  const clean = name.trim().replace(/\s+/g, ' ')
  const id = platformKey(clean)
  const old = previous ? platformKey(previous) : null
  if (!clean || clean.length > 80) throw new Error('Indique un nom de plateforme valide.')
  return write(async () => {
    const data = await loadPortfolio()
    const names = [...(data.platforms ?? []), ...data.positions.map(item => item.platform), ...(data.groups ?? []).map(group => group.platform),
      ...data.operations.flatMap(item => [item.platform, item.destination ?? ''])]
    if (id !== old && names.some(item => platformKey(item) === id)) throw new Error('Cette plateforme existe déjà.')
    if (old) {
      if (!names.some(item => platformKey(item) === old)) throw new Error('Cette plateforme a été renommée dans un autre onglet.')
      const rename = (value: string) => platformKey(value) === old ? clean : value
      const positions = data.positions.filter(item => platformKey(item.platform) === old)
        .map(item => ({ ...item, platform: clean }))
      const operations = data.operations.filter(item => platformKey(item.platform) === old || platformKey(item.destination ?? '') === old)
        .map(item => ({ ...item, platform: rename(item.platform), destination: item.destination && rename(item.destination) }))
      const groups = (data.groups ?? []).filter(group => platformKey(group.platform) === old).map(group => ({
        ...group, platform: clean, positions: group.positions.map(item => ({ ...item, platform: clean })),
        operations: group.operations.map(item => ({ ...item, platform: clean })),
      }))
      await db.groups.bulkPut(groups)
      await db.positions.bulkPut(positions)
      await db.operations.bulkPut(operations)
      if (old !== id) await db.platforms.delete(old)
    }
    await db.platforms.put({ id, name: clean })
  })
}

export function loadPortfolioBackup(): Promise<PortfolioBackup> {
  return db.transaction('r', [db.positions, db.operations, db.marks, db.platforms, db.dailyPrices, db.groups], async () => {
    const [data, dailyPrices] = await Promise.all([loadPortfolio(), loadDailyPrices()])
    return { ...data, dailyPrices }
  })
}

export function restorePortfolio(data: PortfolioBackup) {
  replay(data)
  data.groups?.forEach(validateGroup)
  return db.transaction('rw', [db.positions, db.operations, db.marks, db.platforms, db.dailyPrices, db.groups], async () => {
    await Promise.all([db.positions.clear(), db.operations.clear(), db.marks.clear(), db.platforms.clear(), db.groups.clear()])
    await Promise.all([db.positions.bulkAdd(data.positions), db.operations.bulkAdd(data.operations), db.marks.bulkAdd(data.marks),
      db.platforms.bulkPut((data.platforms ?? []).map(name => ({ id: platformKey(name), name })))])
    if (data.groups?.length) await db.groups.bulkAdd(data.groups)
    await db.dailyPrices.clear()
    if (data.dailyPrices?.length) await db.dailyPrices.bulkAdd(data.dailyPrices)
  })
}

export async function probeLocalStorage() {
  const id = 'diagnostic/' + crypto.randomUUID()
  await db.transaction('rw', db.platforms, async () => {
    await db.platforms.add({ id, name: 'Diagnostic' })
    if ((await db.platforms.get(id))?.name !== 'Diagnostic') throw new Error('Lecture de contrôle impossible.')
    await db.platforms.delete(id)
  })
}

export function saveInvestmentGroup(group: InvestmentGroup, previous?: InvestmentGroup, quote?: Mark) {
  validateGroup(group)
  return db.transaction('rw', db.groups, db.marks, async () => {
    const stored = await db.groups.get(group.id)
    if (JSON.stringify(stored) !== JSON.stringify(previous)) throw new Error('Ce groupe a changé. Rouvre-le avant de réessayer.')
    await db.groups.put(group)
    if (quote && !await db.marks.get(quote.id)) await db.marks.add(quote)
  })
}

export async function deleteInvestmentGroup(group: InvestmentGroup) {
  await db.transaction('rw', db.groups, async () => {
    if (JSON.stringify(await db.groups.get(group.id)) !== JSON.stringify(group)) {
      throw new Error('Ce groupe a changé. Rouvre-le avant de réessayer.')
    }
    await db.groups.delete(group.id)
  })
}
