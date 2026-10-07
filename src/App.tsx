import { useEffect, useSyncExternalStore } from 'react'
import { isConfigured } from './data/supabase'
import { workspace } from './data/workspace'

function App() {
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot)
  const { session, accountId, trips, selected, busy, message, tripName, tripDate,
    cachedAt, remotePending, cleanupBlocked, pendingWrite, recoveryReady } = state
  const isOnline = state.online
  const isCached = Boolean(cachedAt)
  const canWrite = workspace.canWrite()
  useEffect(() => {
    void workspace.initialize()
    const online = () => workspace.connectionChanged()
    const visible = () => { if (document.visibilityState === 'visible') void workspace.refresh() }
    const interval = window.setInterval(workspace.checkExpiry, 1000)
    window.addEventListener('online', online)
    window.addEventListener('offline', online)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', online)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="여행잇다 홈"><span className="brand-mark">잇</span><span>여행잇다</span></a>
        <div className="header-actions">
          <span className={isOnline ? 'connection online' : 'connection'}>{isOnline ? '온라인' : '오프라인'}</span>
          {accountId && <button className="text-button" onClick={() => void workspace.signOut()}>로그아웃</button>}
        </div>
      </header>

      {!isConfigured && <section className="setup-note"><strong>연결 설정 필요</strong><span>저장소의 README에 안내된 Supabase URL과 공개 키를 .env.local에 설정해야 로그인할 수 있습니다.</span></section>}
      {cleanupBlocked && <button className="secondary-button" disabled={busy} onClick={() => void workspace.retryCleanup()}>사본 정리 재시도</button>}
      {pendingWrite && <section className="setup-note"><strong>{pendingWrite.confirmed ? '서버 저장 완료 · 후속 확인 필요' : '저장 결과 확인 필요'}</strong><span>같은 요청을 다시 보내지 않고 서버 내용을 먼저 확인합니다.</span><button className="secondary-button" disabled={!session || !isOnline || busy} onClick={() => void workspace.refresh()}>서버 최신본 확인</button>{recoveryReady && <button className="secondary-button" onClick={workspace.confirmRecovery}>서버 내용을 확인했습니다</button>}</section>}
      {remotePending && <section className="setup-note"><strong>새로운 서버 내용을 확인했습니다.</strong><span>현재 입력을 유지하거나 최신본을 적용할 수 있습니다.</span><button className="secondary-button" onClick={workspace.keepCurrent}>현재 입력 유지</button><button className="secondary-button" onClick={workspace.acceptLatest}>최신본 적용</button></section>}
      {message && <div className="notice" role="status">{message}</div>}
      {busy && <p className="loading">여행을 확인하고 있습니다…</p>}

      {!busy && !session && (
        <section className="login-card">
          <span className="eyebrow">여행 계획을 기기에 연결</span>
          <h1>만든 여행을<br />어디서든 이어 보세요.</h1>
          <p>Google 로그인 후 여행을 서버에 저장합니다. 오프라인에서는 미리 준비한 사본을 확인할 수 있습니다.</p>
          <button className="primary-button" disabled={!isConfigured || !isOnline || cleanupBlocked} onClick={() => void workspace.login()}>Google로 로그인</button>
          {trips.length > 0 && <p className="offline-caption">마지막 계정의 오프라인 사본 {trips.length}개를 사용할 수 있습니다.</p>}
        </section>
      )}

      {!busy && session && (
        <div className="workspace">
          <aside className="trip-panel">
            <div className="panel-heading"><div><span className="eyebrow">내 여행</span><h2>여행 목록</h2></div><span className="account-label">{session.email ?? 'Google 계정'}</span></div>
            <form className="create-form" onSubmit={event => { event.preventDefault(); void workspace.create() }}>
              <label htmlFor="trip-name">새 여행 이름</label>
              <div className="inline-form"><input id="trip-name" maxLength={120} value={tripName} onChange={event => workspace.setTripName(event.target.value)} placeholder="예: 경주 여행" required disabled={!canWrite} /><button className="primary-button" disabled={!canWrite}>만들기</button></div>
            </form>
            <ul className="trip-list">
              {trips.map(trip => <li key={trip.id}><button className={selected?.id === trip.id ? 'trip-item selected' : 'trip-item'} onClick={() => void workspace.openTrip(trip.id)}><span>{trip.name}</span><small>{trip.trip_dates.length}일 · revision {trip.revision}</small></button></li>)}
              {trips.length === 0 && <li className="empty-list">저장된 여행이 없습니다.</li>}
            </ul>
          </aside>
          <section className="trip-detail">
            {selected ? (
              <>
                <div className="detail-heading"><div><span className="eyebrow">{isCached ? '오프라인 사본' : '여행 계획'}</span><h1>{selected.name}</h1></div>{session && isOnline && <button className="text-button" onClick={() => void workspace.refresh()}>최신본 확인</button>}</div>
                <div className="revision-line">revision {selected.revision}{isCached ? ` · 열람 전용 · ${new Date(cachedAt!).toLocaleString('ko-KR')} 수신` : ' · 서버 조회본'}</div>
                {session && <form className="date-form" onSubmit={event => { event.preventDefault(); void workspace.addDate() }}><label htmlFor="trip-date">여행 날짜 추가</label><div className="inline-form"><input id="trip-date" type="date" value={tripDate} onChange={event => workspace.setTripDate(event.target.value)} required disabled={!canWrite || isCached} /><button className="secondary-button" disabled={!canWrite || isCached}>날짜 추가</button></div></form>}
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
        <section className="offline-trips"><h2>저장된 여행 사본</h2><div className="trip-list">{trips.map(trip => <button key={trip.id} className="trip-item" onClick={() => void workspace.openTrip(trip.id)}><span>{trip.name}</span><small>{trip.trip_dates.length}일 · 열람 전용</small></button>)}</div>{selected && <div className="offline-detail"><h3>{selected.name}</h3><p className="revision-line">revision {selected.revision} · {cachedAt && new Date(cachedAt).toLocaleString('ko-KR')} 수신 · 열람 전용</p><ul>{selected.trip_dates.map(date => <li key={date.id}>{date.travel_date}</li>)}</ul></div>}</section>
      )}
      <footer className="app-footer">여행잇다 <span>·</span> DK Travel Helper</footer>
    </main>
  )
}

export default App
