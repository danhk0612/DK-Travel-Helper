import type { TripSnapshot } from './types'

const DB_NAME = 'travel-helper'
const STORE_NAME = 'trip-snapshots'
const VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

type StoredSnapshot = TripSnapshot & { key: string }
const keyFor = (userId: string, tripId: string) => `${userId}:${tripId}`

export async function saveSnapshot(snapshot: TripSnapshot): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({ ...snapshot, key: keyFor(snapshot.userId, snapshot.trip.id) })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('오프라인 사본 저장이 취소됐습니다.'))
  })
  db.close()
}

export async function listSnapshots(userId: string): Promise<TripSnapshot[]> {
  const db = await openDatabase()
  const rows = await new Promise<StoredSnapshot[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as StoredSnapshot[])
    request.onerror = () => reject(request.error)
  })
  db.close()
  return rows.filter(row => row.userId === userId).map(row => ({
    userId: row.userId,
    trip: row.trip,
    savedAt: row.savedAt,
  }))
}

export async function deleteSnapshots(userId: string): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if ((cursor.value as StoredSnapshot).userId === userId) cursor.delete()
      cursor.continue()
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  db.close()
}
