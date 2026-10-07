export type TripDate = {
  id: string
  travel_date: string
}

export type Trip = {
  id: string
  name: string
  revision: number
  created_at: string
  trip_dates: TripDate[]
}

export type TripSnapshot = {
  userId: string
  trip: Trip
  savedAt: string
}

export type UserSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  userId: string
  email: string | null
}

export class RevisionConflictError extends Error {
  constructor() {
    super('다른 기기에서 여행이 변경됐습니다. 최신 내용을 다시 확인해 주세요.')
    this.name = 'RevisionConflictError'
  }
}

export class LimitReachedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LimitReachedError'
  }
}
