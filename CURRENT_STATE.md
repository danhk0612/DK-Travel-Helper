# 현재 상태

## 실제 상태

- 제품명: DK Travel Helper / 여행잇다.
- T00/T01 완료. [PR #1](https://github.com/danhk0612/DK-Travel-Helper/pull/1)은 main에 병합됐다.
- 개발 순서·D002 조사 문서 [PR #2](https://github.com/danhk0612/DK-Travel-Helper/pull/2)와 T04 앱 골격 [PR #3](https://github.com/danhk0612/DK-Travel-Helper/pull/3)은 main에 병합됐다. 문서 병합이 T02 공급자 선택 완료를 뜻하지 않는다.
- 확정 기술: 단일 React + TypeScript + Vite 반응형 웹/PWA, Android 우선. 초기 Supabase Free + Google 로그인 + PostgreSQL 서버 원본, IndexedDB 열람 사본과 Cache Storage 자체 화면 자원.
- 온라인 로그인 상태에서만 수정하고 오프라인에서는 준비된 계획만 열람한다. 무료/유료1/유료2의 여행·장소 한도 3/50, 15/150, 50/300과 관리자 한도 변경이 확정됐다.
- 구현됨: `src/` React 시작 화면과 반응형 스타일, `public/icons/travel.svg`, Vite/PWA 매니페스트·자체 정적 자원용 서비스 워커, npm lockfile, 타입 검사·빌드 스크립트, GitHub Actions CI.
- 실제 로그인·DB·여행 CRUD·지도·검색·관리자·여행 사본은 없다. 서비스 계정 없이 설치·개발 실행·타입 검사·빌드가 가능하다. PWA 캐시는 앱 화면 자원만 포함하며 여행 데이터 오프라인 열람과 다르다.
- T02는 공급자 저장 조건·역할 선택 미해결로 차단·보류한다. 검색→즉시 저장·오프라인 확인 요구는 유지한다. 가격/약관 반복 조사로 실행 골격과 핵심 계약을 막지 않는다.
- 지도 공급자·실제 서비스 운영·호스팅·결제는 미정. Supabase Free 초기 제약은 D001, 운영 재검토는 T13을 따른다.

## 지금 가능한 것

`npm ci`, `npm run dev`, `npm run typecheck`, `npm run build`를 사용할 수 있다. 빌드 결과는 `dist/`에 생성되며 `npm run preview`로 확인한다.

## 다음 작업

현재 **T03 공급자 독립 핵심 계약 설계 진행 중**이다. [D003](decisions/D003-일정과-여행중-계약.md)에 공통 계약·사용자 정책 제안·가상 사례·T05/T05A/T06 인계를 작성했다. `task/t03-core-contracts`의 미병합 문서 초안이며 코드 구현은 없다. Q01–Q07(관계/메모/삭제, 분류, 시간, 세션 사본, 동시 수정, 등급/한도, 구간 정책)은 사용자 선택 대기다. 다음은 답변 반영 및 동일 PR 갱신이며 핵심 계약 확정 전 T05를 착수하지 않는다.

T04는 코드·설치·타입 검사·빌드·CI 검토가 통과했지만 **PC/모바일 실제 렌더링 확인이 남아 진행 중**이다. 로컬 브라우저 다운로드가 Site Unavailable로 실패해 이를 통과로 처리하지 않았다. 화면 검증은 가능한 환경에서 T04 잔여 검증으로 수행한다. 이 환경 제약은 공급자 독립 계약 설계를 막지 않는다. Android 설치·실제 오프라인도 미검증이다.

T03 핵심 계약 확정 이후 T05 → T05A → T06 순서다. T02는 T07/T08 실제 연동 준비 시 선택 후보에 필요한 근거와 품질을 검증한다. 공급자 조건 미확인이 전체 개발 중단이나 요구 축소를 뜻하지 않는다.

## 검증 상태

T04: clean `npm ci`, `npm run typecheck`, `npm run build`, 그리고 GitHub Actions CI 통과. 빌드에서 매니페스트·서비스 워커 생성 확인. CUA 브라우저가 실행 환경 localhost에 연결하지 못해 PC/모바일 화면의 실제 렌더링은 미검증이며 반응형 CSS 자체는 포함했다. Android 설치·실제 PWA 오프라인 동작은 미검증. 실제 로그인/DB/API/검색 품질은 구현 범위 밖이다. 검토 시 clean 설치와 타입 검사 포함 빌드를 다시 실행해 통과했고 de785bc의 push/PR CI 모두 success임을 확인했다. 코드/CSS/PWA 구성과 변경 범위를 검토했다. 과거 작업 경과는 Git 기록을 사용한다.

T03 문서 검증: 로컬 문서 링크·요구 ID·Task 선행 관계·확정/제안 구분과 `git diff --check`를 확인했다. 춘천 1박 2일/경주 2박 3일은 가상 자료로 논리 대조했으며 사용자 승인이나 실행 검증이 아니다. T02 조사·코드 변경·빌드/DB/기기 검증은 이번에 수행하지 않았다.
