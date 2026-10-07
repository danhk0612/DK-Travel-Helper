export type TripDate = { id: string; travel_date: string }
export type Place = {
  id: string
  name: string
  category: 'restaurant' | 'cafe' | 'sightseeing' | 'lodging' | 'transport' | 'other' | null
  memo: string
  created_at: string
}
export type Trip = { id: string; name: string; revision: number; created_at: string; trip_dates: TripDate[]; places: Place[] }
export type TripSnapshot = { formatVersion: 1; userId: string; trip: Trip; savedAt: string }
export type UserSession = { accessToken: string; refreshToken: string; expiresAt: number; userId: string; email: string | null }

export function isTrip(value: unknown): value is Trip {
  if (!value || typeof value !== 'object') return false
  const trip = value as Trip
  return typeof trip.id === 'string' && typeof trip.name === 'string'
    && Number.isSafeInteger(trip.revision) && trip.revision > 0
    && typeof trip.created_at === 'string' && Number.isFinite(Date.parse(trip.created_at))
    && Array.isArray(trip.trip_dates) && trip.trip_dates.every(date => date && typeof date.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.travel_date))
    && Array.isArray(trip.places) && trip.places.every(place => place && typeof place.id === 'string' && typeof place.name === 'string'
      && typeof place.memo === 'string' && typeof place.created_at === 'string'
      && (place.category === null || ['restaurant', 'cafe', 'sightseeing', 'lodging', 'transport', 'other'].includes(place.category)))
}
export class RevisionConflictError extends Error {
  constructor() { super('다른 기기에서 여행이 변경됐습니다. 최신 내용을 다시 확인해 주세요.'); this.name = 'RevisionConflictError' }
}
export class LimitReachedError extends Error {
  constructor(message: string) { super(message); this.name = 'LimitReachedError' }
}
export class AuthenticationError extends Error {
  constructor() { super('로그인을 다시 확인해야 합니다. 준비된 사본은 열람할 수 있습니다.'); this.name = 'AuthenticationError' }
}
export class UnknownWriteError extends Error {
  constructor() { super('서버 저장 결과를 확인하지 못했습니다. 다시 제출하지 말고 서버 최신본을 확인해 주세요.'); this.name = 'UnknownWriteError' }
}
