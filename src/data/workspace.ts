import * as api from './supabase'
import * as offline from './offline'
import { AuthenticationError, UnknownWriteError, type Trip, type UserSession } from './types'

const CLEANUP_KEY = 'travel-helper.cleanup-user'
const WRITE_KEY = 'travel-helper.pending-write'
const LAST_USER_KEY = 'travel-helper.last-user'
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
type PendingWrite = { userId: string; kind: 'trip' | 'date'; tripId: string | null; confirmed: boolean }
type State = {
  session: UserSession | null; accountId: string | null; trips: Trip[]; selected: Trip | null
  online: boolean; busy: boolean; message: string; tripName: string; tripDate: string; dateDirty: boolean
  cachedAt: string | null; remotePending: Trip | null; cleanupBlocked: boolean
  pendingWrite: PendingWrite | null; recoveryReady: boolean
}

// One owner for async UI/account/cache operations, including StrictMode remounts.
class Workspace {
  private state: State = { session: null, accountId: null, trips: [], selected: null, online: navigator.onLine,
    busy: true, message: '', tripName: '', tripDate: today(), dateDirty: false, cachedAt: null,
    remotePending: null, cleanupBlocked: false, pendingWrite: null, recoveryReady: false }
  private listeners = new Set<() => void>()
  private generation = 0
  private readSequence = 0
  private cacheTail: Promise<unknown> = Promise.resolve()
  private initialized: Promise<void> | null = null
  private writing = false
  private refreshing: Promise<UserSession> | null = null
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private update(patch: Partial<State>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener())
  }
  private current(generation: number) { return generation === this.generation && !this.state.cleanupBlocked }
  private cache<T>(work: () => Promise<T>): Promise<T> {
    const result = this.cacheTail.then(work)
    this.cacheTail = result.catch(() => undefined)
    return result
  }
  private pending(value: PendingWrite | null) {
    if (value) localStorage.setItem(WRITE_KEY, JSON.stringify(value))
    else localStorage.removeItem(WRITE_KEY)
    this.update({ pendingWrite: value, recoveryReady: false })
  }
  private restorePending(userId: string) {
    try {
      const value = JSON.parse(localStorage.getItem(WRITE_KEY) ?? 'null') as PendingWrite | null
      if (value?.userId === userId && ['trip', 'date'].includes(value.kind)) this.update({ pendingWrite: value })
    } catch { localStorage.removeItem(WRITE_KEY) }
  }
  private expire() {
    api.clearSession()
    this.refreshing = null
    this.update({ session: null, message: new AuthenticationError().message })
  }
  private async active(generation: number): Promise<UserSession> {
    const session = this.state.session
    if (!session || !navigator.onLine) throw new AuthenticationError()
    if (session.expiresAt > Date.now() + 30_000) return session
    if (!this.refreshing) this.refreshing = api.refreshSession(session)
    const pending = this.refreshing
    try {
      const next = await pending
      if (!this.current(generation) || next.userId !== session.userId) throw new AuthenticationError()
      api.storeSession(next)
      this.update({ session: next })
      return next
    } catch (error) {
      if (this.current(generation)) this.expire()
      throw error
    } finally { if (this.refreshing === pending) this.refreshing = null }
  }
  private async prepare(trips: Trip[], userId: string, generation: number, sequence: number): Promise<boolean> {
    try {
      for (const trip of trips) await this.cache(async () => {
        if (this.current(generation) && sequence === this.readSequence) await offline.saveSnapshot({ formatVersion: 1, userId, trip, savedAt: new Date().toISOString() })
      })
      return true
    } catch { return false }
  }
  private async readCopies(userId: string, generation: number) {
    try {
      const copies = await offline.listSnapshots(userId)
      if (this.current(generation)) this.update({ trips: copies.map(copy => copy.trip) })
    } catch {
      if (this.current(generation)) this.update({ message: '이 기기의 사본 저장소를 사용할 수 없습니다. 온라인 서버 기능은 사용할 수 있습니다.' })
    }
  }
  private async clearAccount(userId: string): Promise<boolean> {
    ++this.generation
    ++this.readSequence
    this.refreshing = null
    this.update({ session: null, accountId: null, trips: [], selected: null, tripName: '', tripDate: today(), dateDirty: false,
      cachedAt: null, remotePending: null, pendingWrite: null, recoveryReady: false, cleanupBlocked: true, busy: true })
    // Persist the barrier before deleting, so a reload cannot bypass failed cleanup.
    try {
      localStorage.setItem(CLEANUP_KEY, userId)
      api.clearSession()
      localStorage.removeItem(LAST_USER_KEY)
      await this.cache(() => offline.deleteSnapshots(userId))
      localStorage.removeItem(CLEANUP_KEY)
      localStorage.removeItem(WRITE_KEY)
      this.update({ cleanupBlocked: false, busy: false, message: '이전 계정의 사본을 정리했습니다.' })
      return true
    } catch {
      this.update({ busy: false, cleanupBlocked: true, message: '이전 계정의 사본을 지우지 못했습니다. 정리를 재시도한 뒤 로그인해 주세요.' })
      return false
    }
  }
  initialize = () => {
    if (!this.initialized) this.initialized = this.start()
    return this.initialized
  }
  private async start() {
    try {
      const cleanup = localStorage.getItem(CLEANUP_KEY)
      if (cleanup && !await this.clearAccount(cleanup)) return
      let session = api.readSession()
      const previous = session?.userId ?? api.lastAccountId()
      const callback = new URLSearchParams(location.search).has('code')
      // Never show a previous account while a new callback is being resolved.
      if (callback) {
        const generation = this.generation
        session = await api.finishGoogleLogin()
        if (!this.current(generation)) return
        if (session && previous && session.userId !== previous && !await this.clearAccount(previous)) return
        this.update({ busy: true })
      }
      const generation = this.generation
      const userId = session?.userId ?? (callback ? null : previous)
      if (!userId) return
      if (session) api.storeSession(session)
      this.update({ accountId: userId, session })
      this.restorePending(userId)
      await this.readCopies(userId, generation)
      if (!this.current(generation)) return
      if (session && navigator.onLine) await this.refresh()
      else if (session && session.expiresAt <= Date.now()) this.expire()
    } catch (error) {
      this.update({ message: error instanceof Error ? error.message : '로그인을 확인하지 못했습니다.' })
    } finally { this.update({ busy: false }) }
  }
  setTripName = (value: string) => this.update({ tripName: value })
  setTripDate = (value: string) => this.update({ tripDate: value, dateDirty: true })
  checkExpiry = () => {
    if (this.state.session && this.state.session.expiresAt <= Date.now()) {
      if (navigator.onLine) void this.refresh()
      else this.expire()
    }
  }
  connectionChanged = () => {
    this.update({ online: navigator.onLine })
    if (navigator.onLine) void this.refresh()
    else this.checkExpiry()
  }
  login = async () => {
    if (this.state.cleanupBlocked || this.state.busy) return
    this.update({ busy: true })
    try { await api.beginGoogleLogin() }
    catch (error) { this.update({ busy: false, message: error instanceof Error ? error.message : '로그인을 시작하지 못했습니다.' }) }
  }
  signOut = async () => {
    const userId = this.state.accountId ?? localStorage.getItem(CLEANUP_KEY)
    if (userId) await this.clearAccount(userId)
  }
  retryCleanup = async () => {
    const userId = localStorage.getItem(CLEANUP_KEY)
    if (userId) await this.clearAccount(userId)
  }
  refresh = async () => {
    if (!this.state.session || !navigator.onLine || this.state.cleanupBlocked || this.writing) return
    const generation = this.generation
    const sequence = ++this.readSequence
    const selectedId = this.state.selected?.id
    try {
      const session = await this.active(generation)
      if (!this.current(generation)) return
      const trips = await api.loadTrips(session)
      if (!this.current(generation) || sequence !== this.readSequence) return
      const latest = selectedId ? trips.find(trip => trip.id === selectedId) : null
      this.update({ trips })
      if (latest && this.state.selected?.id === selectedId) {
        if (this.state.dateDirty && latest.revision !== this.state.selected?.revision) this.update({ remotePending: latest })
        else this.update({ selected: latest, cachedAt: null, remotePending: null })
      }
      const prepared = await this.prepare(trips, session.userId, generation, sequence)
      if (!this.current(generation) || sequence !== this.readSequence) return
      this.update({ message: prepared ? '서버 최신본을 확인하고 오프라인 사본을 준비했습니다.' : '서버 최신본은 확인했지만 오프라인 사본을 준비하지 못했습니다.',
        recoveryReady: Boolean(this.state.pendingWrite) })
      if (this.state.pendingWrite?.confirmed && trips.some(trip => trip.id === this.state.pendingWrite?.tripId)) {
        const recovered = trips.find(trip => trip.id === this.state.pendingWrite?.tripId)!
        this.update({ selected: recovered, cachedAt: null, dateDirty: false, remotePending: null, message: '서버 저장은 완료됐습니다. 최신 내용을 다시 확인했습니다.' })
        this.pending(null)
      }
    } catch (error) {
      if (!this.current(generation) || sequence !== this.readSequence) return
      if (error instanceof AuthenticationError) this.expire()
      else this.update({ message: '서버 최신본을 확인하지 못했습니다. 현재 사본과 입력은 유지합니다.', recoveryReady: false })
    }
  }
  acceptLatest = () => {
    if (!this.state.remotePending) return
    this.update({ selected: this.state.remotePending, cachedAt: null, remotePending: null, tripDate: today(), dateDirty: false })
  }
  keepCurrent = () => this.update({ remotePending: null, message: '현재 입력을 유지합니다. 저장 시 서버 revision을 다시 검사합니다.' })
  confirmRecovery = () => {
    if (!this.state.recoveryReady) return
    this.pending(null)
    this.update({ tripName: '', dateDirty: false, message: '확인한 서버 내용을 기준으로 계속합니다. 이전 요청은 자동으로 다시 보내지 않습니다.' })
  }
  openTrip = async (tripId: string) => {
    const userId = this.state.accountId
    if (!userId || this.state.cleanupBlocked || this.writing) return
    const generation = this.generation
    const sequence = ++this.readSequence
    try {
      if (this.state.session && navigator.onLine) {
        try {
          const session = await this.active(generation)
          if (!this.current(generation)) return
          const trip = await api.loadTrip(session, tripId)
          if (!this.current(generation) || sequence !== this.readSequence) return
          this.update({ selected: trip, cachedAt: null, remotePending: null, dateDirty: false, tripDate: today() })
          const prepared = await this.prepare([trip], userId, generation, sequence)
          if (this.current(generation) && sequence === this.readSequence) this.update({ message: prepared ? '서버 최신 여행을 확인했습니다.' : '서버 최신 여행은 확인했지만 오프라인 사본을 준비하지 못했습니다.' })
          return
        } catch (error) { if (error instanceof AuthenticationError && this.current(generation)) this.expire() }
      }
      if (!this.current(generation) || sequence !== this.readSequence) return
      const copy = (await offline.listSnapshots(userId)).find(item => item.trip.id === tripId)
      if (!this.current(generation) || sequence !== this.readSequence) return
      if (!copy) { this.update({ message: '이 여행은 이 기기에 준비된 사본이 없습니다.' }); return }
      this.update({ selected: copy.trip, cachedAt: copy.savedAt, dateDirty: false, remotePending: null,
        message: '서버를 확인할 수 없어 준비된 사본을 열었습니다. 열람 전용입니다.' })
    } catch {
      if (this.current(generation) && sequence === this.readSequence) this.update({ message: '이 기기의 여행 사본을 읽지 못했습니다.' })
    }
  }
  canWrite = () => Boolean(this.state.session && this.state.session.expiresAt > Date.now() && this.state.online
    && !this.state.busy && !this.state.cleanupBlocked && !this.state.pendingWrite)
  create = async () => this.write('trip')
  addDate = async () => this.write('date')
  private async write(kind: 'trip' | 'date') {
    if (this.writing || this.state.pendingWrite || !this.state.session || !navigator.onLine || this.state.cleanupBlocked) return
    if (kind === 'date' && (!this.state.selected || this.state.cachedAt)) return
    const generation = this.generation
    const name = this.state.tripName
    const selected = this.state.selected
    const date = this.state.tripDate
    this.writing = true
    ++this.readSequence
    this.update({ busy: true, message: '', remotePending: null })
    let acknowledged = false
    let sent = false
    try {
      const session = await this.active(generation)
      if (!this.current(generation)) return
      const pending: PendingWrite = { userId: session.userId, kind, tripId: kind === 'date' ? selected!.id : null, confirmed: false }
      this.pending(pending)
      sent = true
      if (kind === 'trip') {
        pending.tripId = await api.createTrip(session, name)
      } else {
        await api.addTripDate(session, selected!.id, date, selected!.revision)
      }
      if (!this.current(generation)) return
      acknowledged = true
      this.pending({ ...pending, confirmed: true })
      if (kind === 'trip') this.update({ tripName: '' })
      else this.update({ dateDirty: false })
      const trip = await api.loadTrip(session, pending.tripId!)
      if (!this.current(generation)) return
      const sequence = ++this.readSequence
      this.update({ selected: trip, cachedAt: null, trips: [trip, ...this.state.trips.filter(item => item.id !== trip.id)] })
      const prepared = await this.prepare([trip], session.userId, generation, sequence)
      if (!this.current(generation)) return
      this.pending(null)
      this.update({ message: prepared ? '서버 저장이 완료됐고 오프라인 사본을 준비했습니다.' : '서버 저장은 완료됐지만 오프라인 사본을 준비하지 못했습니다.' })
    } catch (error) {
      if (!this.current(generation)) return
      if (acknowledged) this.update({ message: '서버 저장은 완료됐지만 후속 조회를 확인하지 못했습니다. 서버 최신본을 확인해 주세요.' })
      else if (sent && error instanceof UnknownWriteError) this.update({ message: error.message })
      else {
        if (sent) this.pending(null)
        if (error instanceof AuthenticationError) this.expire()
        else this.update({ message: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.' })
      }
    } finally {
      this.writing = false
      if (generation === this.generation) this.update({ busy: false })
    }
  }
}
export const workspace = new Workspace()
