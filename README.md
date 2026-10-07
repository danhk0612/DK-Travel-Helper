# 여행잇다 · DK Travel Helper

React + TypeScript + Vite 반응형 PWA입니다. T05에서는 Google 로그인, 여행·날짜 서버 저장, revision 충돌 방지, 계정별 오프라인 열람 사본의 기반을 구성합니다. 장소 검색·지도·일정 편집·관리자 화면·결제는 포함하지 않습니다.

## 개발 환경

- Node.js 24
- npm 11.9.0

```bash
npm ci
npm run dev
npm run typecheck
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run preview
```

Supabase 설정 없이도 설치·타입 검사·빌드를 수행할 수 있습니다. 로그인과 서버 저장을 확인하려면 아래 서비스 설정이 필요합니다.

## Supabase 개발 프로젝트 연결

1. 개인 Supabase 프로젝트에서 Google provider를 켜고 Google OAuth client 설정을 완료합니다. Supabase Auth의 Site URL과 Redirect URLs에 개발 주소(기본 `http://localhost:5173`)와 사용할 HTTPS 앱 origin을 등록합니다.
2. SQL Editor에서 [T05 migration](supabase/migrations/202610070001_t05_trip_storage.sql)을 적용합니다. 새 DB에서는 001 후 [002 전진 migration](supabase/migrations/202610070002_revision_guards.sql)도 적용합니다. 001이 이미 적용된 DB에는 002만 추가하며 초기 테이블을 재생성하지 않습니다. 초기 migration은 등급 한도 3/50, 15/150, 50/300, 사용자별 RLS, 여행 revision 및 원자적 생성 RPC를 준비합니다.
3. `.env.example`을 참고해 `.env.local`에 프로젝트 URL과 publishable/anon 공개 키를 입력합니다. 이 두 값은 브라우저 공개 설정입니다. `service_role` 키는 브라우저 환경 변수나 저장소에 넣지 않습니다.
4. `npm run dev`로 실행하고 Google 로그인 후 여행을 만들고 날짜를 추가합니다.

새 Google 사용자는 무료 등급으로 시작합니다. 관리자/등급 지정은 제품 화면에 없으며, 실제 대상은 계정의 Google 로그인 후 생성된 `auth.users.id`와 이메일을 운영자가 직접 대조한 뒤 Supabase 대시보드의 SQL Editor에서 설정합니다. 확인한 뒤에만 다음 예시의 UUID를 실제 값으로 바꿉니다.

```sql
begin;
select revision from public.app_settings where id = true for share;
update public.user_profiles
set tier = 'free', is_admin = true
where user_id = '<운영자가 검증한 auth.users.id>';
commit;
```

등급은 `free`, `paid1`, `paid2` 중 하나입니다. 저장소에는 특정 관리자 ID를 넣지 않습니다. 등급 한도 변경 함수는 서버 측 `service_role` 호출 전용이며 해당 키를 브라우저에 제공하지 않습니다. 실제 설정은 개인 서비스 프로젝트에서 수행해야 하며 이 저장소/CI에는 서비스 계정이 포함되지 않습니다.

## 저장과 오프라인 동작

- PostgreSQL이 원본입니다. 여행 목록·날짜는 로그인 사용자 본인 행만 읽을 수 있고, 직접 테이블 쓰기는 막혀 있습니다.
- 여행 생성·날짜 추가·장소 추가 한도는 DB 함수에서 인증, 계정 등급, 소유권, revision, 현재 개수를 검사합니다. DB 잠금으로 경쟁 요청을 직렬화합니다.
- 여행별 IndexedDB 사본은 한 번의 저장 트랜잭션으로 완전한 revision 단위로 교체합니다. 오프라인에서는 준비된 사본을 읽을 수 있으며 변경을 저장하거나 대기열에 쌓지 않습니다.
- 로그아웃은 현재 계정의 브라우저 사본을 삭제합니다. 세션이 만료되거나 서버에 연결하지 못하면 사본을 읽을 수 있지만 서버 쓰기는 허용하지 않습니다.
- 오프라인 사본은 백업이 아니며 브라우저 저장소 삭제·기기 변경·origin 변경 후 유지되지 않을 수 있습니다.

## 검증 상태

GitHub Actions는 `npm ci`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build`를 실행합니다. `npm test`는 PGlite PostgreSQL과 최소 Auth stub의 저장 계약 검사입니다. 실제 OAuth/PostgREST나 다중 연결 잠금 검증은 아닙니다. `npm run test:browser`는 Chromium의 실제 IndexedDB에 가상 계정/HTTP 응답을 적용한 인증·사본·복구 회귀 검증입니다. 테스트 실행 전에 `npx playwright install chromium`을 수행합니다. CI는 Chromium 설치도 수행합니다. T05의 SQL/RLS 동시성은 실제 Supabase 프로젝트에서 별도 확인해야 합니다. 실제 Google OAuth, 서버 권한·경쟁 요청, IndexedDB와 Android 실기기 동작은 해당 계정/기기에서 수행하기 전까지 확인된 것으로 보지 않습니다.

계정 정리 실패 시 재시도 전 새 로그인은 차단됩니다. 저장 결과가 불확실하면 같은 요청을 다시 보내지 않고 서버 최신본과 명시 확인으로 복구합니다. 형식 버전 없는 예전 사본은 온라인에서 다시 준비합니다. 수정 범위는 [T05-R1](tasks/TASK-T05-R1.md), 남은 실제 인증·서버 경쟁·Android 검증은 [T05-V1](tasks/TASK-T05-V1.md)을 따릅니다.

현재 구현 범위와 남은 검증은 [CURRENT_STATE.md](CURRENT_STATE.md), 구조는 [ARCHITECTURE.md](ARCHITECTURE.md), 계약은 [TASKS.md](TASKS.md)와 [D003](decisions/D003-일정과-여행중-계약.md)을 확인하세요.
