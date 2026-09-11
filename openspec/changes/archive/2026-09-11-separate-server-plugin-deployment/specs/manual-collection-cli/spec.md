## MODIFIED Requirements

### Requirement: 등록된 플러그인 단일 선택
수동 수집 CLI는 plugin ID 하나와 외부 설정 루트를 필수 입력으로 받아 SHALL 해당 루트의 registry에 등록되고 활성화된 정확히 하나의 수집 정의만 선택해야 한다. CLI는 개별 plugin 파일 경로, Connection ID 또는 원천 URL을 실행 인자로 받아 registry 선택을 우회해서는 안 된다(MUST NOT).

#### Scenario: 등록된 플러그인 선택
- **WHEN** 운영자가 읽기 가능한 외부 설정 루트와 그 registry에 등록된 활성 plugin ID 하나로 CLI를 실행한다
- **THEN** 시스템은 해당 외부 설정 revision의 플러그인 수집 정의 하나를 선택한다

#### Scenario: 알 수 없는 플러그인 거부
- **WHEN** 운영자가 미등록, 비활성 또는 중복된 plugin ID로 CLI를 실행한다
- **THEN** 시스템은 수집과 DB 쓰기를 시작하지 않고 안전한 설정 오류를 반환한다

#### Scenario: 임의 원천 지정 거부
- **WHEN** 운영자가 지원되지 않는 인자나 개별 plugin 경로·원천 URL·Connection을 직접 지정한다
- **THEN** 시스템은 registry가 허용한 범위를 넓히지 않고 사용법 오류로 종료한다

#### Scenario: 외부 설정 루트 누락
- **WHEN** 운영자가 설정 루트를 제공하지 않거나 읽을 수 없는 경로를 제공한다
- **THEN** 시스템은 현재 작업 디렉터리나 이미지 내부 설정을 추정하지 않고 설정 오류로 종료한다

### Requirement: 로컬과 배포 이미지의 동일 코어 실행
프로젝트는 SHALL 로컬 pnpm 명령과 배포 API 이미지 내부 명령에서 동일한 수동 CLI 코어, 외부 설정 루트 입력과 종료 코드 계약을 제공해야 한다. 이 실행 경로는 NestJS HTTP 요청, Redis, worker 또는 LDAP에 의존해서는 안 된다(MUST NOT).

#### Scenario: 로컬 수동 실행
- **WHEN** 운영자가 문서화된 pnpm 명령에 plugin ID, 외부 설정 루트와 필수 환경 설정을 제공한다
- **THEN** 독립 CLI 프로세스가 외부 registry를 검증해 실행되고 NestJS 서버를 시작하지 않는다

#### Scenario: 배포 이미지 수동 실행
- **WHEN** 운영자가 외부 설정 볼륨이 주입된 API 배포 이미지에서 문서화된 명령을 실행한다
- **THEN** 로컬 명령과 같은 CLI 코어, 외부 registry 및 종료 코드 계약을 사용하며 이미지 내부 샘플 설정에 의존하지 않는다
