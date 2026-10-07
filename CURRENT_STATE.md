# 현재 상태

## 실제 상태

- 제품명: DK Travel Helper / 여행잇다. main `ff4abff`에는 T00/T01/T04 및 승인된 T03 핵심 계약이 있다.
- T05 구현과 검토 수정은 [PR #7](https://github.com/danhk0612/DK-Travel-Helper/pull/7), `task/t05-travel-storage`에 있으며 main 미병합이다.
- 구현 브랜치에는 Google OAuth PKCE, 여행 목록·생성·열기·날짜 추가, Supabase Auth/REST/RPC, RLS/서버 한도 SQL, 계정별 IndexedDB 사본이 있다. 전체 동작이 검증된 상태는 아니다.
- 날짜·장소·정책 RPC의 NULL revision 우회를 재현하고 비교를 수정했다. 로컬 PostgreSQL 계약 테스트와 CI 테스트 명령을 추가했다.
- T05-R1 인증·사본·복구 수정과 로컬 검증을 완료했다. 실행 세대·사본 작업 순서·정리 실패 장벽, OAuth/refresh 중복 방지, 미확인 쓰기 복구, 형식 버전/장소 포함 사본, 입력 보호 최신본 확인을 구현했다. 최신 CI 결과 확인 후 재검토로 넘긴다.
- 초기 정책은 free 3/50, paid1 15/150, paid2 50/300이며 새 사용자는 free다. 실제 관리자 대상 ID는 지정하지 않았다.
- 장소/일정 편집 UI·관리자 화면·결제·삭제·지도/검색/경로는 없다. T02 공급자는 보류 중이며 이번 검토에서 조사하지 않았다.

## 검증 상태

| 구분 | 결과 |
| --- | --- |
| 검토 기준 | T05 `4cfe5a8`, main `ff4abff` |
| 기준 커밋 원격 CI | push/PR 모두 성공: npm ci, typecheck, build |
| 이번 로컬 검증 | npm 설치·타입 검사·빌드 성공. SQL/전진 migration 테스트 4개와 Chromium 브라우저 테스트 17개 통과. 이전 코드의 계정 전환 노출·로그아웃 후 사본 부활 재현 후 수정 확인 |
| SQL 검증 범위 | PGlite PostgreSQL + 최소 Auth stub. NULL/오래된 revision, 기본 소유권·직접 쓰기 거부·운영자 호출 거부·여행 개수 경계. 다중 연결 동시성 검증은 아님 |
| 프런트엔드 검증 | 실제 Chromium IndexedDB + 제어한 Auth/REST 응답·가상 계정. Google/Supabase 연결 결과가 아님 |
| Google OAuth/Supabase 실제 연결 | 미검증. 개발 프로젝트·provider 설정 미제공 |
| PC→Android/여행 사본 실제 사용 | 미검증. T04의 정적 시작 자원 오프라인 검사와 구분 |

## 설정과 다음 작업

개발 연결은 README와 `.env.example`을 따른다. 공개 URL/키는 `.env.local`, 서비스 비밀 키는 서버에서만 사용한다. 초기 migration을 적용한 개발 DB는 `202610070002_revision_guards.sql`만 추가한다. 새 DB는 001→002 순서다. 테이블을 삭제/재생성하지 않는다. 형식 버전 없는 예전 사본은 온라인에서 다시 준비한다.

다음은 [T05-V1](tasks/TASK-T05-V1.md)(저성능 Work)의 실제 Google/Supabase/RLS·여러 연결 경쟁·PC→Android 검증이다. 개발 서비스 설정/기기 결과가 없어 차단 상태다. T05는 진행 중이며 PR #7 미병합, T05A/T06은 미착수다. 과거 작업 경과는 Git 기록으로 확인한다.
