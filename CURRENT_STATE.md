# 현재 상태

## 실제 상태

- 제품명: DK Travel Helper / 여행잇다. main `ff4abff`에는 T00/T01/T04 및 승인된 T03 핵심 계약이 있다.
- T05 구현과 검토 수정은 [PR #7](https://github.com/danhk0612/DK-Travel-Helper/pull/7), `task/t05-travel-storage`에 있으며 main 미병합이다.
- 구현 브랜치에는 Google OAuth PKCE, 여행 목록·생성·열기·날짜 추가, Supabase Auth/REST/RPC, RLS/서버 한도 SQL, 계정별 IndexedDB 사본이 있다. 전체 동작이 검증된 상태는 아니다.
- 날짜·장소·정책 RPC의 NULL revision 우회를 재현하고 비교를 수정했다. 로컬 PostgreSQL 계약 테스트와 CI 테스트 명령을 추가했다.
- 인증·사본·저장 복구 결함이 남아 있다. [T05-R1](tasks/TASK-T05-R1.md)에 코드 근거·수정 범위·검증 사례를 기록했다. T05-R1은 외부 계정 없이 진행 가능하다.
- 초기 정책은 free 3/50, paid1 15/150, paid2 50/300이며 새 사용자는 free다. 실제 관리자 대상 ID는 지정하지 않았다.
- 장소/일정 편집 UI·관리자 화면·결제·삭제·지도/검색/경로는 없다. T02 공급자는 보류 중이며 이번 검토에서 조사하지 않았다.

## 검증 상태

| 구분 | 결과 |
| --- | --- |
| 검토 기준 | T05 `4cfe5a8`, main `ff4abff` |
| 기준 커밋 원격 CI | push/PR 모두 성공: npm ci, typecheck, build |
| 이번 로컬 검증 | npm 설치·타입 검사·빌드 성공. SQL 테스트 기존 코드 2개 실패 → 수정 후 3개 모두 성공 |
| SQL 검증 범위 | PGlite PostgreSQL + 최소 Auth stub. NULL/오래된 revision, 기본 소유권·직접 쓰기 거부·운영자 호출 거부·여행 개수 경계. 다중 연결 동시성 검증은 아님 |
| 프런트엔드 검토 | 코드 흐름 검토. T05-R1의 실제 브라우저 재현/수정 필요 |
| Google OAuth/Supabase 실제 연결 | 미검증. 개발 프로젝트·provider 설정 미제공 |
| PC→Android/여행 사본 실제 사용 | 미검증. T04의 정적 시작 자원 오프라인 검사와 구분 |

## 설정과 다음 작업

개발 연결은 README와 `.env.example`을 따른다. 공개 URL/키는 `.env.local`, 서비스 비밀 키는 서버에서만 사용한다. 기존 개발 DB에 초기 migration을 이미 적용했다면 수정 함수의 적용 절차를 준비하며 테이블을 삭제/재생성하지 않는다.

다음은 T05-R1(저성능 Work). 먼저 인증·사본·복구 결함을 고치고 PR #7을 재검토한다. 이어 접근 가능한 실제 Google/Supabase/PC→Android 검증을 수행한다. T05는 진행 중으로 유지하고 T05A/T06은 아직 착수하지 않는다. 과거 작업 경과는 Git 기록으로 확인한다.
