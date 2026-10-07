import type { Trip, UserSession } from './types'
import { LimitReachedError, RevisionConflictError } from './types'

const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const SESSION_KEY = 'travel-helper.session'
const LAST_USER_KEY = 'travel-helper.last-user'
const VERIFIER_KEY = 'travel-helper.pkce-verifier'

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
    return JSON.parse(raw) as UserSession
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function lastAccountId(): string | null {
  return localStorage.getItem(LAST_USER_KEY)
}

function storeSession(session: UserSession): UserSession {
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

export async function finishGoogleLogin(): Promise<UserSession | null> {
  const code = new URLSearchParams(window.location.search).get('code')
  if (!code) return null
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier) throw new Error('로그인 확인 정보가 만료됐습니다. 다시 로그인해 주세요.')
  const data = await authRequest('token?grant_type=pkce', { auth_code: code, code_verifier: verifier })
  sessionStorage.removeItem(VERIFIER_KEY)
  history.replaceState({}, '', window.location.pathname)
  return storeSession(sessionFromResponse(data))
}

export async function refreshSession(session: UserSession): Promise<UserSession> {
  const data = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refreshToken })
  return storeSession(sessionFromResponse(data))
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
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers,
  })
  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    const message = String(body?.message ?? body?.details ?? '서버 요청에 실패했습니다.')
    if (response.status === 409 || String(body?.code) === '40001') throw new RevisionConflictError()
    if (String(body?.code) === 'P0001') throw new LimitReachedError(message)
    throw new Error(message)
  }
  return body as T
}

export async function loadTrips(session: UserSession): Promise<Trip[]> {
  return request<Trip[]>('trips?select=id,name,revision,created_at,trip_dates(id,travel_date)&order=created_at.desc&trip_dates.order=travel_date.asc', session)
}

export async function loadTrip(session: UserSession, tripId: string): Promise<Trip> {
  const trips = await request<Trip[]>(`trips?id=eq.${encodeURIComponent(tripId)}&select=id,name,revision,created_at,trip_dates(id,travel_date)&trip_dates.order=travel_date.asc`, session)
  if (!trips[0]) throw new Error('여행을 찾을 수 없습니다.')
  return trips[0]
}

export async function createTrip(session: UserSession, name: string): Promise<string> {
  return request<string>('rpc/create_trip', session, {
    method: 'POST',
    body: JSON.stringify({ p_name: name }),
  })
}

export async function addTripDate(session: UserSession, tripId: string, date: string, expectedRevision: number): Promise<void> {
  await request('rpc/add_trip_date', session, {
    method: 'POST',
    body: JSON.stringify({ p_trip_id: tripId, p_date: date, p_expected_revision: expectedRevision }),
  })
}
