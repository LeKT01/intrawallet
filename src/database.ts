import { Dexie, type EntityTable } from 'dexie'
import type { Position } from './portfolio'

const db = new Dexie('portefeuille-local') as Dexie & {
  positions: EntityTable<Position, 'id'>
}

db.version(1).stores({ positions: 'id,createdAt' })

export function loadPositions() {
  return db.positions.orderBy('createdAt').toArray()
}

export function savePosition(position: Position, editing: boolean) {
  if (!editing) return db.positions.add(position)
  return db.positions.update(position.id, position).then(changes => {
    if (changes !== 1) throw new Error('Cette position a été supprimée dans un autre onglet.')
  })
}

export function deletePosition(id: string) {
  return db.positions.delete(id)
}
