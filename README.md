# 여행잇다 · DK Travel Helper

여행 계획과 여행 중 필요한 정보를 이어주는 반응형 웹/PWA 앱입니다. 현재 저장소에는 PC와 휴대폰에서 열 수 있는 초기 화면과 PWA 앱 자원 기본 설정만 있습니다. 로그인, 여행 저장, 지도·검색은 아직 구현되지 않았습니다.

## 시작하기

### 필요한 환경

- Node.js 24 LTS
- npm 11.9.0 (Node.js와 함께 설치)

### 설치·실행

```bash
npm ci
npm run dev
```

터미널에 표시된 로컬 주소를 브라우저에서 엽니다. 개발 서버는 기본적으로 `http://localhost:5173`을 사용합니다.

### 검사·빌드

```bash
npm run typecheck
npm run build
npm run preview
```

`build`는 타입 검사를 실행한 뒤 `dist/`에 배포용 정적 파일을 만듭니다. `preview`는 빌드 결과를 로컬에서 확인합니다. 인증 정보, 서비스 계정, 지도 키는 필요하지 않습니다.

## PWA 기본 구성

프로덕션 빌드는 앱 매니페스트와 서비스 워커를 생성하고 화면 자원을 미리 캐시합니다. 이 캐시는 앱의 HTML·JavaScript·CSS·아이콘 등 자체 화면 자원만 다룹니다. 로그인, 여행 데이터 저장과 오프라인 열람은 구현되어 있지 않습니다. 설치 동작과 Android 실기기 동작은 아직 검증되지 않았습니다.

## 기술 구성

- React 19 + TypeScript 5
- Vite 8
- `vite-plugin-pwa` 서비스 워커·매니페스트 생성
- npm lockfile과 GitHub Actions CI

주요 경로는 `src/`(화면), `public/`(정적 앱 자원), `vite.config.ts`(Vite/PWA), `.github/workflows/ci.yml`(검사·빌드 CI)입니다. 확정된 제품 구조와 미결정 경계는 [ARCHITECTURE.md](ARCHITECTURE.md), 현재 범위와 다음 Task는 [CURRENT_STATE.md](CURRENT_STATE.md), [TASKS.md](TASKS.md)에서 확인합니다.
