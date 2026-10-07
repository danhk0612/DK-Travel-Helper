# 여행잇다 · DK Travel Helper

**여행 계획을 쉽게 만들고, 여행 중에는 다음 행동을 쉽게 해주는 여행 계획/도우미.**

PC에서 여행 계획을 작성하고, 여행 중 휴대폰에서 현재 위치·일정·다음 장소와 이동 방법을 확인하는 앱을 준비하고 있습니다.

현재는 플랫폼·저장 방식을 결정한 단계입니다. 반응형 웹/PWA와 React·TypeScript·Vite를 선택했고 Android를 우선 검증합니다. 초기 검증은 Supabase 무료와 Google 로그인으로 진행합니다. 실행 가능한 앱, 실제 서버/DB, 설치 방법, 배포 URL은 아직 없으며 지도 공급자는 미정입니다.

온라인 로그인 상태에서만 수정하고, 오프라인에서는 미리 받은 계획을 확인합니다. 무료·유료1·유료2 등급별 여행·장소 수 한도와 관리자 한도 변경을 준비합니다. 실제 결제와 서비스 운영은 아직 확정하지 않았습니다. [확정 결정과 초기 운영 제약](decisions/D001-플랫폼과-데이터.md)을 참고하세요.

## 프로젝트 기준 문서

| 문서 | 역할 |
| --- | --- |
| [PROJECT.md](PROJECT.md) | 목적, 제품 방향, 유지할 원칙 |
| [REQUIREMENTS.md](REQUIREMENTS.md) | 확정 요구사항, 비요구사항, 미결정 사항 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 최소 논리 구조, 결정 순서, 구현 경계 |
| [CURRENT_STATE.md](CURRENT_STATE.md) | 지금 실제로 존재하는 것과 다음 작업 |
| [TASKS.md](TASKS.md) | Task 상태, 선행 관계, 개별 작업 계약 |
| [AI_WORKFLOW.md](AI_WORKFLOW.md) | Chat/Work 운영, Git 작업, 검증·인계 규칙 |

새 작업자는 최신 저장소 확인 → PROJECT → CURRENT_STATE → TASKS → 해당 REQUIREMENTS/ARCHITECTURE → AI_WORKFLOW 순서로 읽습니다.

T01은 main에 반영됐습니다. 다음은 **T04: 실행 가능한 앱 골격 구현**입니다. 지도 공급자는 미정이며 실제 연동 전에 [D002](decisions/D002-지도와-이동.md)의 조건을 해결합니다. 공급자 조사와 독립적인 개발을 먼저 진행하도록 [새 작업 시작 지시문](TASKS.md#새-작업-시작-지시문)을 준비했습니다. 현재 계획은 PR #2에 있고 아직 main에 병합되지 않았습니다.
