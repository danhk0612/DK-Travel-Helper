# 현재 상태

## 실제 상태

- 제품명: DK Travel Helper / 여행잇다.
- T00/T01 완료. [PR #1](https://github.com/danhk0612/DK-Travel-Helper/pull/1)은 main에 병합됐다.
- 현재 작업 계획과 [D002](decisions/D002-지도와-이동.md)는 [초안 PR #2](https://github.com/danhk0612/DK-Travel-Helper/pull/2), `task/t02-map-providers`에 있다. T04는 해당 브랜치 기반 [초안 PR #3](https://github.com/danhk0612/DK-Travel-Helper/pull/3), `task/t04-app-foundation`에 쌓였다. 둘 다 미병합이다.
- 확정 기술: 단일 React + TypeScript + Vite 반응형 웹/PWA, Android 우선. 초기 Supabase Free + Google 로그인 + PostgreSQL 서버 원본, IndexedDB 열람 사본과 Cache Storage 자체 화면 자원.
- 온라인 로그인 상태에서만 수정하고 오프라인에서는 준비된 계획만 열람한다. 무료/유료1/유료2의 여행·장소 한도 3/50, 15/150, 50/300과 관리자 한도 변경이 확정됐다.
- 구현됨: `src/` React 시작 화면과 반응형 스타일, `public/icons/travel.svg`, Vite/PWA 매니페스트·자체 정적 자원용 서비스 워커, npm lockfile, 타입 검사·빌드 스크립트, GitHub Actions CI.
- 실제 로그인·DB·여행 CRUD·지도·검색·관리자·여행 사본은 없다. 서비스 계정 없이 설치·개발 실행·타입 검사·빌드가 가능하다. PWA 캐시는 앱 화면 자원만 포함하며 여행 데이터 오프라인 열람과 다르다.
- T02는 공급자 저장 조건·역할 선택 미해결로 차단·보류한다. 검색→즉시 저장·오프라인 확인 요구는 유지한다. 가격/약관 반복 조사로 실행 골격과 핵심 계약을 막지 않는다.
- 지도 공급자·실제 서비스 운영·호스팅·결제는 미정. Supabase Free 초기 제약은 D001, 운영 재검토는 T13을 따른다.

## 지금 가능한 것

`npm ci`, `npm run dev`, `npm run typecheck`, `npm run build`를 사용할 수 있다. 빌드 결과는 `dist/`에 생성되며 `npm run preview`로 확인한다.

## 다음 작업

T04 구현과 CI는 통과했다. **PC/모바일 시작 화면의 실제 시각 확인이 미완료**여서 T04는 진행 중이다. 로컬 서버는 실행됐지만 CUA 브라우저가 실행 환경의 localhost에 연결하지 못했다. 화면 확인이 끝나고 PR #2/#3가 기본 브랜치에 반영된 후 다음은 **T03 — UI·데이터·시간·이동 계약 설계의 공급자 독립 핵심 범위**, 고성능 Work다. T04 실제 파일을 반영해 여행·일정 데이터, UI 흐름, 시간 판단, 인증·사본·한도 계약을 설계하고 T02 공급자 응답·보관·실제 경로 연동은 별도 미완료로 남긴다.

T03 핵심 계약 확정 이후 T05 → T05A → T06 순서다. T02는 T07/T08 실제 연동 준비 시 선택 후보에 필요한 근거와 품질을 검증한다. 공급자 조건 미확인이 전체 개발 중단이나 요구 축소를 뜻하지 않는다.

## 검증 상태

T04: clean `npm ci`, `npm run typecheck`, `npm run build`, 그리고 GitHub Actions CI 통과. 빌드에서 매니페스트·서비스 워커 생성 확인. CUA 브라우저가 실행 환경 localhost에 연결하지 못해 PC/모바일 화면의 실제 렌더링은 미검증이며 반응형 CSS 자체는 포함했다. Android 설치·실제 PWA 오프라인 동작은 미검증. 실제 로그인/DB/API/검색 품질은 구현 범위 밖이다. 과거 작업 경과는 Git 기록을 사용한다.
