import { Dexie, type EntityTable } from 'dexie'
import { assetKey, type Position } from './portfolio.ts'
import { dayKey } from './currency.ts'
import { demoMode, makeDemo } from './demo.ts'
import { firstTrackingDate, replay, unitMark, type Mark, type Operation, type PortfolioData } from './ledger.ts'

export interface DailySeries { target: string; fetchedAt: number; marks: Mark[]; instrument?: Position['market'] }

const db = new Dexie(demoMode ? 'portefeuille-local-demo' : 'portefeuille-local') as Dexie & {
  positions: EntityTable<Position, 'id'>
  operations: EntityTable<Operation, 'id'>
  marks: EntityTable<Mark, 'id'>
  dailyPrices: EntityTable<DailySeries, 'target'>
}

db.version(1).stores({ positions: 'id,createdAt' })
db.version(2).stores({ positions: 'id,createdAt', operations: 'id,at', marks: 'id,[kind+target]' })
db.version(3).stores({ dailyPrices: 'target' })

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
    const byDay = new Map(existing?.marks.map(mark => [dayKey(mark.at), mark]))
    for (const mark of series.marks) {
      const day = dayKey(mark.at)
      const previous = byDay.get(day)
      if (!previous || previous.sourceAt <= mark.sourceAt) byDay.set(day, mark)
    }
    return db.dailyPrices.put({ target: series.target, fetchedAt: Math.max(series.fetchedAt, existing?.fetchedAt ?? 0),
      marks: [...byDay.values()], instrument: series.instrument ?? existing?.instrument })
  })
}

export async function loadPortfolio(): Promise<PortfolioData> {
  return db.transaction('r', [db.positions, db.operations, db.marks], async () => {
    const [positions, operations, marks] = await Promise.all([
      db.positions.orderBy('createdAt').toArray(),
      db.operations.orderBy('at').toArray(),
      db.marks.toArray(),
    ])
    return { positions, operations, marks }
  })
}

const write = <T,>(callback: () => Promise<T>) =>
  db.transaction('rw', [db.positions, db.operations, db.marks], callback)

export function savePosition(position: Position, editing: boolean, quote?: Mark) {
  return write(async () => {
    const data = await loadPortfolio()
    const previous = data.positions.find(item => item.id === position.id)
    if (editing && !previous) throw new Error('Cette position a été supprimée dans un autre onglet.')
    const positions = previous ? data.positions.map(item => item.id === position.id ? position : item)
      : [...data.positions, position]
    const marks = [...data.marks]
    const identityChanged = previous && assetKey(previous) !== assetKey(position)
    if (identityChanged) {
      await db.marks.where('[kind+target]').equals(['manual', position.id]).delete()
      for (let i = marks.length - 1; i >= 0; i--) {
        if (marks[i].kind === 'manual' && marks[i].target === position.id) marks.splice(i, 1)
      }
    } else {
      const oldMark = previous && unitMark(previous)
      if (oldMark && !marks.some(item => item.id === oldMark.id)) {
        marks.push(oldMark)
        await db.marks.add(oldMark)
      }
    }
    const manual = unitMark(position)
    if (manual) {
      await db.marks.put(manual)
      marks.push(manual)
    } else if (previous?.valuation && !identityChanged) {
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
    const { positions, operations } = await loadPortfolio()
    const targets = new Set([...positions, ...operations].map(assetKey))
    const existing = await db.marks.bulkGet(marks.map(mark => mark.id))
    const fresh = marks.filter((mark, index) => !existing[index] && targets.has(mark.target))
    await db.marks.bulkAdd(fresh)
    return fresh.length
  })
}

export function restorePortfolio(data: PortfolioData) {
  replay(data)
  return write(async () => {
    await Promise.all([db.positions.clear(), db.operations.clear(), db.marks.clear()])
    await Promise.all([db.positions.bulkAdd(data.positions), db.operations.bulkAdd(data.operations), db.marks.bulkAdd(data.marks)])
  })
}
