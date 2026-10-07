function App() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="여행잇다 홈">
          <span className="brand-mark" aria-hidden="true">잇</span>
          <span>여행잇다</span>
        </a>
        <span className="topbar-caption">DK Travel Helper</span>
      </header>

      <section className="welcome-card" aria-labelledby="welcome-title">
        <div className="eyebrow"><span className="status-dot" /> 준비 중인 여행 도우미</div>
        <h1 id="welcome-title">여행의 시작과<br className="mobile-break" /> 여정을 이어요.</h1>
        <p className="intro">
          여행을 준비할 때는 계획을 만들고,<br className="desktop-break" />
          여행 중에는 다음에 할 일을 확인할 수 있도록 준비하고 있어요.
        </p>
        <div className="coming-soon" role="status">
          <span className="coming-soon-icon" aria-hidden="true">✦</span>
          <span>여행잇다의 첫 화면입니다. 여행 계획 기능은 다음 단계에서 추가됩니다.</span>
        </div>
        <div className="card-footer">
          <span className="footer-line" />
          <span>계획부터 여행 중까지, 한 곳에서</span>
        </div>
      </section>

      <footer className="page-footer">여행잇다 <span aria-hidden="true">·</span> DK Travel Helper</footer>
    </main>
  )
}

export default App
