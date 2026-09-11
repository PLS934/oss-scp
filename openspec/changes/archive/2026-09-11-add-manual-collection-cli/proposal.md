## Why

#47에서 프레임워크와 진입점에 독립적인 공통 collection runner가 마련되었지만, 운영자가 설치 환경에서 등록된 플러그인과 Connection, 플랫폼 DB 설정을 조합해 이를 한 번 실행할 수 있는 진입점이 없다. Phase 0의 수동 수집 흐름을 완성하고 로컬 개발과 배포 이미지에서 같은 실행 코어를 재사용하려면 비밀정보를 노출하지 않는 독립 CLI가 필요하다.

## What Changes

- 등록된 플러그인 ID 하나를 인자로 받아 repository 설정을 검증하고, 미등록·비활성 대상을 명확히 거부하는 수동 수집 CLI를 추가한다.
- 검증된 source·Connection 정의, 환경변수 기반 플랫폼 DB 설정과 등록된 어댑터를 해석하여 기존 collection runner를 정확히 한 번 호출한다.
- HTTP offset·single 수집 정의를 기존 collector에 연결하고, 실행 범위와 설정 revision을 안정적으로 구성한다.
- 성공·부분 성공·실패·취소를 문서화된 종료 코드와 제한된 JSON 로그로 구분한다.
- 설정·연결·실행 오류를 안정적인 공개 코드와 메시지로 정규화하고 비밀번호, token, connection string, 전체 설정 원문과 원본 드라이버 오류를 출력하지 않는다.
- 정상 종료와 실패·취소 시 collector 및 DB 연결 자원을 정리하며, 반복된 close 호출도 안전하게 처리한다.
- 로컬 pnpm 명령과 API 배포 이미지 내부 명령이 같은 CLI 코어를 실행하도록 패키지·이미지 구성을 갱신한다.
- 가짜 runner·adapter를 사용한 프로세스 테스트, 잘못된 입력·비밀정보 비노출 회귀 테스트와 운영 문서를 추가한다.
- 여러 플러그인 일괄 실행, NestJS 실행 API, 스케줄러·Redis·worker, 새로운 collector나 저장 로직은 포함하지 않는다.

## Capabilities

### New Capabilities

- `manual-collection-cli`: 등록된 플러그인의 단일 수집 실행, 설정 조합, 종료 상태·안전한 로그, 자원 정리 및 로컬·배포 이미지 실행 계약을 정의한다.

### Modified Capabilities

- 없음.

## Impact

- 공통 runner와 플러그인 설정·HTTP collector·플랫폼 DB adapter를 조합하는 CLI 패키지 또는 API 배포 패키지의 독립 진입점이 추가된다.
- 루트 pnpm scripts, workspace 의존성, API Dockerfile과 CI 프로세스 검증이 변경된다.
- `plugins/registry.json`, `connections/registry.json` 및 기존 플랫폼 DB 환경변수 계약을 입력으로 재사용하며, NestJS·Redis·LDAP에는 의존하지 않는다.
- 운영자를 위한 수동 실행, secret 주입, 종료 코드 및 로그 문서가 추가된다.
