import type { Trip, UserSession } from './types'
import { AuthenticationError, UnknownWriteError, isTrip, LimitReachedError, RevisionConflictError } from './types'

const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const SESSION_KEY = 'travel-helper.session'
const LAST_USER_KEY = 'travel-helper.last-user'
const VERIFIER_KEY = 'travel-helper.pkce-verifier'
let callbackPromise: Promise<UserSession | null> | null = null
const refreshes = new Map<string, Promise<UserSession>>()

export const isConfigured = Boolean(url && anonKey)

function requireConfig(): { url: string; anonKey: string } {
  if (!url || !anonKey) throw new Error('Supabase URL과 공개 키를 .env.local에 설정해 주세요.')
  return { url, anonKey }
}

function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
}

function sessionFromResponse(data: Record<string, unknown>): UserSession {
  const user = data.user as Record<string, unknown> | undefined
  const accessToken = String(data.access_token ?? '')
  if (!accessToken || typeof data.refresh_token !== 'string' || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) throw new AuthenticationError()
  const payload = decodeJwt(accessToken)
  const userId = String(user?.id ?? payload.sub ?? '')
  if (!userId) throw new Error('로그인 사용자 정보를 확인할 수 없습니다.')
  return {
    accessToken,
    refreshToken: String(data.refresh_token ?? ''),
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    userId,
    email: typeof user?.email === 'string' ? user.email : null,
  }
}

export function readSession(): UserSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as UserSession
    if (!session || typeof session.userId !== 'string' || typeof session.accessToken !== 'string'
      || typeof session.refreshToken !== 'string' || !Number.isFinite(session.expiresAt)) throw new AuthenticationError()
    return session
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function lastAccountId(): string | null {
  return localStorage.getItem(LAST_USER_KEY)
}

export function storeSession(session: UserSession): UserSession {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  localStorage.setItem(LAST_USER_KEY, session.userId)
  return session
}

async function authRequest(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const config = requireConfig()
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: config.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(String(data.msg ?? data.message ?? '인증 요청에 실패했습니다.'))
  return data
}

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function beginGoogleLogin(): Promise<void> {
  const config = requireConfig()
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const verifier = base64Url(bytes)
  const challenge = base64Url(new Uint8Array(await sha256(verifier)))
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  const redirectTo = new URL(window.location.href)
  redirectTo.search = ''
  const authorize = new URL(`${config.url}/auth/v1/authorize`)
  authorize.searchParams.set('provider', 'google')
  authorize.searchParams.set('redirect_to', redirectTo.toString())
  authorize.searchParams.set('code_challenge', challenge)
  authorize.searchParams.set('code_challenge_method', 's256')
  window.location.assign(authorize.toString())
}

export function finishGoogleLogin(): Promise<UserSession | null> {
  if (callbackPromise) return callbackPromise
  const code = new URLSearchParams(window.location.search).get('code')
  if (!code) return Promise.resolve(null)
  callbackPromise = (async () => {
    try {
      const verifier = sessionStorage.getItem(VERIFIER_KEY)
      if (!verifier) throw new Error('로그인 확인 정보가 만료됐습니다. 다시 로그인해 주세요.')
      const data = await authRequest('token?grant_type=pkce', { auth_code: code, code_verifier: verifier })
      return sessionFromResponse(data)
    } finally {
      sessionStorage.removeItem(VERIFIER_KEY)
      history.replaceState({}, '', window.location.pathname)
    }
  })()
  return callbackPromise
}

export function refreshSession(session: UserSession): Promise<UserSession> {
  const existing = refreshes.get(session.refreshToken)
  if (existing) return existing
  const pending = authRequest('token?grant_type=refresh_token', { refresh_token: session.refreshToken })
    .then(sessionFromResponse).finally(() => refreshes.delete(session.refreshToken))
  refreshes.set(session.refreshToken, pending)
  return pending
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

async function request<T>(path: string, session: UserSession, init: RequestInit = {}): Promise<T> {
  const config = requireConfig()
  const headers = new Headers(init.headers)
  headers.set('apikey', config.anonKey)
  headers.set('Authorization', `Bearer ${session.accessToken}`)
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  const isWrite = init.method === 'POST'
  let response: Response
  try {
    response = await fetch(`${config.url}/rest/v1/${path}`, { ...init, headers })
  } catch (error) {
    if (isWrite) throw new UnknownWriteError()
    throw error
  }
  if (response.status === 204 && path === 'rpc/add_trip_date') return null as T
  let body: unknown
  try { body = await response.json() } catch {
    if (response.ok && isWrite) throw new UnknownWriteError()
    if (response.ok) throw new Error('서버 응답을 읽지 못했습니다.')
    body = null
  }
  const errorBody = body as Record<string, unknown> | null
  if (!response.ok) {
    if (response.status === 401) throw new AuthenticationError()
    const message = String(errorBody?.message ?? errorBody?.details ?? '서버 요청에 실패했습니다.')
    if (response.status === 409 || String(errorBody?.code) === '40001') throw new RevisionConflictError()
    if (String(errorBody?.code) === 'P0001') throw new LimitReachedError(message)
    if (isWrite && response.status >= 500) throw new UnknownWriteError()
    throw new Error(message)
  }
  return body as T
}

const tripSelect = 'id,name,revision,created_at,trip_dates(id,travel_date),places(id,name,category,memo,created_at)'
function tripsFromResponse(value: unknown): Trip[] {
  if (!Array.isArray(value) || !value.every(isTrip)) throw new Error('완전한 여행 응답을 확인하지 못했습니다.')
  return value
}
export async function loadTrips(session: UserSession): Promise<Trip[]> {
  return tripsFromResponse(await request(`trips?select=${tripSelect}&order=created_at.desc&trip_dates.order=travel_date.asc`, session))
}
export async function loadTrip(session: UserSession, tripId: string): Promise<Trip> {
  const trips = tripsFromResponse(await request(`trips?id=eq.${encodeURIComponent(tripId)}&select=${tripSelect}&trip_dates.order=travel_date.asc`, session))
  if (trips.length !== 1 || trips[0].id !== tripId) throw new Error('여행을 찾을 수 없습니다.')
  return trips[0]
}
export async function createTrip(session: UserSession, name: string): Promise<string> {
  const id = await request<unknown>('rpc/create_trip', session, { method: 'POST', body: JSON.stringify({ p_name: name }) })
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new UnknownWriteError()
  return id
}
export async function addTripDate(session: UserSession, tripId: string, date: string, expectedRevision: number): Promise<void> {
  const result = await request<unknown>('rpc/add_trip_date', session, {
    method: 'POST', body: JSON.stringify({ p_trip_id: tripId, p_date: date, p_expected_revision: expectedRevision }),
  })
  if (result !== null) throw new UnknownWriteError()
}
