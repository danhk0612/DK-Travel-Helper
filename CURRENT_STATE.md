# 현재 상태

## 실제 상태

- 제품명: DK Travel Helper / 여행잇다.
- T00/T01, T04 완료. PR #1/#2/#3/#5 및 T03 핵심 계약은 main에 반영됐다.
- T05 구현은 `task/t05-travel-storage`와 검토 PR에서 진행 중이다. 구현 브랜치는 main에 병합되지 않았다.
- 앱은 Google OAuth PKCE 로그인 흐름, 여행 목록·생성·열기, 날짜 추가, Supabase Auth/REST/RPC 통신, PostgreSQL RLS/원자적 한도 migration, 계정별 IndexedDB 여행 사본을 포함한다.
- 초기 서버 정책: free 3여행/50장소, paid1 15/150, paid2 50/300. 새 계정은 free. 코드와 DB 함수가 서버 등급·revision·개수를 판정한다.
- 여행/날짜만 앱 화면에서 다룬다. 장소 검색·편집·일정 배치·관리자 화면·결제·삭제·지도/경로 기능은 구현하지 않았다. 장소 한도는 서버 RPC로 보호하지만 UI에서는 장소를 만들지 않는다.
- 공개 URL/키는 개발자 로컬 `.env.local`에서 제공한다. service_role 키는 클라이언트에서 사용하지 않는다. 실제 관리자 대상 ID는 지정하지 않았다.
- Supabase 프로젝트·Google OAuth provider 계정이 연결되지 않아 실제 로그인/DB/RLS/동시 요청을 실행하지 않았다. Android 기기와 계정 간 사본 전달도 확인하지 않았다. 로컬 npm 의존성 설치가 이 런타임의 외부 네트워크 제한에 막혀 타입 검사/빌드도 아직 확인하지 않았다.
- T02 공급자·검색·지도·경로 선택은 미정이고, 이 T05 작업에서 조사하거나 변경하지 않았다.
- 실제 서비스 운영·호스팅·도메인·결제는 미정이다. Supabase Free 초기 제약과 재검토는 D001/T13을 따른다.

## 개발 환경 설정

`.env.example`을 복사해 Supabase 개발 URL과 publishable/anon 공개 키를 `.env.local`에 둔다. Google OAuth provider/redirect URL을 Supabase에서 설정하고 migration을 적용해야 인증·DB 기능을 사용할 수 있다. 자세한 절차는 README를 따른다. 환경 변수 없이도 정적 빌드는 가능해야 한다.

## 다음 작업

T05 검토 PR의 원격 CI 결과를 확인하고, 가능하면 사용자가 제공한 Supabase 개발 프로젝트·Google provider·Android 기기에서 실제 검증한다. 실제 관리자 대상은 ID/이메일을 직접 대조한 경우에만 설정한다. 실제 서비스/기기 검증이 남아 있어 T05를 완료 처리하지 않으며 T05A나 T06으로 진행하지 않는다.

## 검증 상태

| 구분 | 상태 |
| --- | --- |
| 기준·계약 | main `ff4abff`, T04 완료, D003 Q01–Q07 및 T05 계약 확인 |
| 구현 검토 | 파일·SQL 정적 확인. 사용자 소유권/RLS와 잠금 순서를 코드에서 대조했으나 DB 실행 검증은 아님 |
| 로컬 타입 검사/빌드 | 미실행: `npm ci`가 네트워크 연결 제한으로 완료되지 않아 `tsc` 실행 불가 |
| 원격 CI | PR 생성 후 GitHub Actions 결과를 확인해 갱신 |
| 실제 Google 로그인/Supabase DB/RLS/동시 요청 | 미검증: 프로젝트와 provider credentials 미제공 |
| IndexedDB 실제 브라우저 계정 격리 | 코드만 검토, 브라우저 동작 미검증 |
| PC→Android/오프라인 여행 사본 | 미검증. 기존 T04의 시작 화면 오프라인 자원 검사와 구분 |
| 모의 사례 | Q05 revision 충돌, Q06 등급/한도/하향 보존, 계정 필터/로그아웃 정리의 코드 경로 대조. 실행 결과가 아님 |

과거 작업 경과는 Git 기록으로 확인한다.
