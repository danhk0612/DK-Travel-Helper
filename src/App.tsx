import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  addTripDate,
  beginGoogleLogin,
  clearSession,
  createTrip,
  finishGoogleLogin,
  isConfigured,
  lastAccountId,
  loadTrip,
  loadTrips,
  readSession,
  refreshSession,
} from './data/supabase'
import { deleteSnapshots, listSnapshots, saveSnapshot } from './data/offline'
import type { Trip, UserSession } from './data/types'
import { LimitReachedError, RevisionConflictError } from './data/types'

const dateToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())

function App() {
  const [session, setSession] = useState<UserSession | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [selected, setSelected] = useState<Trip | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const [tripName, setTripName] = useState('')
  const [tripDate, setTripDate] = useState(dateToday)
  const [isCached, setIsCached] = useState(false)

  const applyRemoteTrip = useCallback(async (next: Trip, userId: string) => {
    setSelected(next)
    setIsCached(false)
    try {
      await saveSnapshot({ userId, trip: next, savedAt: new Date().toISOString() })
      setMessage('서버의 최신 여행을 저장했고 오프라인 열람을 준비했습니다.')
    } catch {
      setMessage('서버 저장은 확인했지만 이 기기에 오프라인 사본을 저장하지 못했습니다.')
    }
  }, [])

  const syncTrips = useCallback(async (active: UserSession) => {
    const remote = await loadTrips(active)
    setTrips(remote)
    for (const trip of remote) {
      try { await saveSnapshot({ userId: active.userId, trip, savedAt: new Date().toISOString() }) } catch { /* server remains authoritative */ }
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const start = async () => {
      try {
        let active = readSession()
        const offlineAccount = active?.userId ?? lastAccountId()
        if (offlineAccount) {
          setAccountId(offlineAccount)
          const cached = await listSnapshots(offlineAccount)
          if (mounted) setTrips(cached.map(item => item.trip))
        }
        try {
          const callbackSession = await finishGoogleLogin()
          if (callbackSession) active = callbackSession
        } catch (error) {
          if (mounted) setMessage(error instanceof Error ? error.message : 'Google 로그인을 확인하지 못했습니다.')
        }
        if (active && active.expiresAt <= Date.now() + 30_000 && navigator.onLine) {
          try { active = await refreshSession(active) } catch { clearSession(); active = null }
        }
        if (active && mounted) {
          setSession(active)
          setAccountId(active.userId)
          try { await syncTrips(active) } catch { setMessage('서버에 연결할 수 없습니다. 준비된 오프라인 사본을 표시합니다.') }
        }
      } catch {
        if (mounted) setMessage('저장된 여행 사본을 읽지 못했습니다.')
      } finally {
        if (mounted) setBusy(false)
      }
    }
    void start()
    return () => { mounted = false }
  }, [syncTrips])

  useEffect(() => {
    const online = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  const refreshSelected = useCallback(async () => {
    if (!session || !selected || !navigator.onLine) return
    try {
      const latest = await loadTrip(session, selected.id)
      if (latest.revision !== selected.revision) setMessage('여행이 다른 기기에서 변경됐습니다. 최신본을 열거나 현재 화면을 유지해 주세요.')
      else await applyRemoteTrip(latest, session.userId)
    } catch { /* leave the current complete snapshot visible */ }
  }, [applyRemoteTrip, selected, session])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshSelected() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshSelected])

  async function openTrip(tripId: string) {
    setMessage('')
    if (session && navigator.onLine) {
      try {
        const remote = await loadTrip(session, tripId)
        await applyRemoteTrip(remote, session.userId)
        return
      } catch {
        setMessage('서버를 확인할 수 없어 이 기기에 저장된 여행 사본을 엽니다.')
      }
    }
    if (!accountId) return
    const cached = (await listSnapshots(accountId)).find(item => item.trip.id === tripId)
    if (cached) {
      setSelected(cached.trip)
      setIsCached(true)
      setMessage(`오프라인 사본 · ${new Date(cached.savedAt).toLocaleString('ko-KR')} 저장`)
    } else {
      setMessage('이 여행은 이 기기에 준비된 오프라인 사본이 없습니다.')
    }
  }

  async function onCreateTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || !navigator.onLine) return
    setBusy(true)
    setMessage('')
    try {
      const id = await createTrip(session, tripName)
      const trip = await loadTrip(session, id)
      setTripName('')
      await syncTrips(session)
      await applyRemoteTrip(trip, session.userId)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '여행을 저장하지 못했습니다.')
    } finally { setBusy(false) }
  }

  async function onAddDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || !selected || !navigator.onLine) return
    setBusy(true)
    setMessage('')
    try {
      await addTripDate(session, selected.id, tripDate, selected.revision)
      const updated = await loadTrip(session, selected.id)
      await applyRemoteTrip(updated, session.userId)
      setTrips(current => current.map(trip => trip.id === updated.id ? updated : trip))
    } catch (error) {
      if (error instanceof RevisionConflictError) setMessage('다른 기기에서 변경됐습니다. 최신본을 다시 연 뒤 날짜를 추가해 주세요.')
      else if (error instanceof LimitReachedError) setMessage(error.message)
      else setMessage(error instanceof Error ? error.message : '날짜를 저장하지 못했습니다.')
    } finally { setBusy(false) }
  }

  async function signOut() {
    const previousUser = session?.userId ?? accountId
    setSession(null)
    setAccountId(null)
    setSelected(null)
    setTrips([])
    setIsCached(false)
    clearSession()
    localStorage.removeItem('travel-helper.last-user')
    if (previousUser) {
      try { await deleteSnapshots(previousUser) }
      catch { setMessage('로그아웃은 완료했지만 이전 계정의 오프라인 사본을 지우지 못했습니다. 이 기기에서 다른 계정으로 로그인하지 마세요.') }
    }
  }

  async function loadLatest() {
    if (!session || !selected) return
    try {
      const latest = await loadTrip(session, selected.id)
      await applyRemoteTrip(latest, session.userId)
      setTrips(current => current.map(trip => trip.id === latest.id ? latest : trip))
    } catch (error) { setMessage(error instanceof Error ? error.message : '최신 여행을 불러오지 못했습니다.') }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="여행잇다 홈"><span className="brand-mark">잇</span><span>여행잇다</span></a>
        <div className="header-actions">
          <span className={isOnline ? 'connection online' : 'connection'}>{isOnline ? '온라인' : '오프라인'}</span>
          {session && <button className="text-button" onClick={() => void signOut()}>로그아웃</button>}
        </div>
      </header>

      {!isConfigured && <section className="setup-note"><strong>연결 설정 필요</strong><span>저장소의 README에 안내된 Supabase URL과 공개 키를 .env.local에 설정해야 로그인할 수 있습니다.</span></section>}
      {message && <div className="notice" role="status">{message}</div>}
      {busy && <p className="loading">여행을 확인하고 있습니다…</p>}

      {!busy && !session && (
        <section className="login-card">
          <span className="eyebrow">여행 계획을 기기에 연결</span>
          <h1>만든 여행을<br />어디서든 이어 보세요.</h1>
          <p>Google 로그인 후 여행을 서버에 저장합니다. 오프라인에서는 미리 준비한 사본을 확인할 수 있습니다.</p>
          <button className="primary-button" disabled={!isConfigured || !isOnline} onClick={() => void beginGoogleLogin()}>Google로 로그인</button>
          {trips.length > 0 && <p className="offline-caption">마지막 계정의 오프라인 사본 {trips.length}개를 사용할 수 있습니다.</p>}
        </section>
      )}

      {!busy && session && (
        <div className="workspace">
          <aside className="trip-panel">
            <div className="panel-heading"><div><span className="eyebrow">내 여행</span><h2>여행 목록</h2></div><span className="account-label">{session.email ?? 'Google 계정'}</span></div>
            <form className="create-form" onSubmit={event => void onCreateTrip(event)}>
              <label htmlFor="trip-name">새 여행 이름</label>
              <div className="inline-form"><input id="trip-name" maxLength={120} value={tripName} onChange={event => setTripName(event.target.value)} placeholder="예: 경주 여행" required disabled={!isOnline} /><button className="primary-button" disabled={!isOnline}>만들기</button></div>
            </form>
            <ul className="trip-list">
              {trips.map(trip => <li key={trip.id}><button className={selected?.id === trip.id ? 'trip-item selected' : 'trip-item'} onClick={() => void openTrip(trip.id)}><span>{trip.name}</span><small>{trip.trip_dates.length}일 · revision {trip.revision}</small></button></li>)}
              {trips.length === 0 && <li className="empty-list">저장된 여행이 없습니다.</li>}
            </ul>
          </aside>
          <section className="trip-detail">
            {selected ? (
              <>
                <div className="detail-heading"><div><span className="eyebrow">{isCached ? '오프라인 사본' : '여행 계획'}</span><h1>{selected.name}</h1></div>{session && isOnline && <button className="text-button" onClick={() => void loadLatest()}>최신본 확인</button>}</div>
                <div className="revision-line">revision {selected.revision}{isCached ? ' · 열람 전용' : ' · 서버 원본과 동기화됨'}</div>
                {session && <form className="date-form" onSubmit={event => void onAddDate(event)}><label htmlFor="trip-date">여행 날짜 추가</label><div className="inline-form"><input id="trip-date" type="date" value={tripDate} onChange={event => setTripDate(event.target.value)} required disabled={!isOnline || isCached} /><button className="secondary-button" disabled={!isOnline || isCached}>날짜 추가</button></div></form>}
                <h2 className="date-heading">여행 날짜</h2>
                <ol className="date-list">{selected.trip_dates.map(item => <li key={item.id}><time dateTime={item.travel_date}>{new Date(`${item.travel_date}T00:00:00+09:00`).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</time></li>)}</ol>
                {selected.trip_dates.length === 0 && <p className="empty-detail">첫 날짜를 추가하면 여행 일정의 기준이 됩니다.</p>}
              </>
            ) : <div className="empty-detail large">목록에서 여행을 열거나 새 여행을 만들어 주세요.</div>}
            <p className="scope-note">장소 검색·장소 편집·일정 편집은 다음 작업에서 추가합니다.</p>
          </section>
        </div>
      )}
      {!busy && !session && trips.length > 0 && accountId && (
        <section className="offline-trips"><h2>저장된 여행 사본</h2><div className="trip-list">{trips.map(trip => <button key={trip.id} className="trip-item" onClick={() => void openTrip(trip.id)}><span>{trip.name}</span><small>{trip.trip_dates.length}일 · 열람 전용</small></button>)}</div>{selected && <div className="offline-detail"><h3>{selected.name}</h3><ul>{selected.trip_dates.map(date => <li key={date.id}>{date.travel_date}</li>)}</ul></div>}</section>
      )}
      <footer className="app-footer">여행잇다 <span>·</span> DK Travel Helper</footer>
    </main>
  )
}

export default App
