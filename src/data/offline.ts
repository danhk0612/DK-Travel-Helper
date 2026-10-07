import { isTrip, type TripSnapshot } from './types'

const DB_NAME = 'travel-helper'
const STORE_NAME = 'trip-snapshots'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('다른 화면에서 사본 저장소를 사용 중입니다.'))
  })
}
const keyFor = (userId: string, tripId: string) => `${userId}:${tripId}`
function validSnapshot(value: unknown): value is TripSnapshot {
  if (!value || typeof value !== 'object') return false
  const row = value as TripSnapshot & { key?: string }
  return row.formatVersion === 1 && typeof row.userId === 'string' && isTrip(row.trip)
    && Number.isFinite(Date.parse(row.savedAt)) && row.key === keyFor(row.userId, row.trip.id)
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('오프라인 사본 변경이 취소됐습니다.'))
  })
}
export async function saveSnapshot(snapshot: TripSnapshot): Promise<void> {
  const row = { ...snapshot, key: keyFor(snapshot.userId, snapshot.trip.id) }
  if (!validSnapshot(row)) throw new Error('완전한 여행 사본을 확인하지 못했습니다.')
  const db = await openDatabase()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const done = completed(tx)
    tx.objectStore(STORE_NAME).put(row)
    await done
  } finally { db.close() }
}
export async function listSnapshots(userId: string): Promise<TripSnapshot[]> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const done = completed(tx)
    const request = tx.objectStore(STORE_NAME).getAll()
    await done
    return (request.result as unknown[]).filter(validSnapshot).filter(row => row.userId === userId)
  } finally { db.close() }
}
export async function deleteSnapshots(userId: string): Promise<void> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const done = completed(tx)
    const store = tx.objectStore(STORE_NAME)
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if (cursor.value?.userId === userId) cursor.delete()
      cursor.continue()
    }
    await done
  } finally { db.close() }
}
