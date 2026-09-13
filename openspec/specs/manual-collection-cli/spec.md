# manual-collection-cli Specification

## Purpose

설치 환경의 운영자가 등록된 플러그인 하나를 검증된 설정과 플랫폼 DB에 연결해 안전하게 수동 실행하고, 자동 실행 계층 없이 결과 상태를 판별할 수 있게 한다.

## Requirements

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

### Requirement: 실행 전 설정 조합과 검증
CLI는 SHALL 전체 plugin·source·Connection registry를 검증하고, 선택한 정의와 플랫폼 DB 환경 설정, 등록된 수집기 및 저장 가능 DB adapter를 조합한 뒤 기존 공통 collection runner를 정확히 한 번 호출해야 한다. secret 값은 선언된 환경변수 또는 secret 파일 참조에서만 읽어야 하며(MUST), Git 설정이나 실행 인자로 직접 받지 않아야 한다(MUST NOT).

#### Scenario: 유효한 실행 구성
- **WHEN** registry와 선택한 source·Connection, 필요한 secret, 플랫폼 DB 설정 및 adapter가 모두 유효하다
- **THEN** 시스템은 plugin ID와 Connection ID에 귀속된 전체 범위 실행으로 공통 runner를 한 번 호출한다

#### Scenario: repository 설정 오류
- **WHEN** 선택 여부와 관계없이 repository registry·plugin·source·Connection 검증이 실패한다
- **THEN** 시스템은 runner를 호출하거나 DB에 연결하지 않고 설정 실패로 종료한다

#### Scenario: secret 해석 실패
- **WHEN** 필수 secret 환경변수나 파일이 없거나 읽을 수 없거나 허용 한도를 위반한다
- **THEN** 시스템은 runner를 호출하지 않고 secret 값이나 파일 내용을 포함하지 않은 설정 실패를 반환한다

#### Scenario: 저장 기능이 없는 DB adapter
- **WHEN** 선택된 플랫폼 DB adapter가 공통 RecordStorage 계약을 제공하지 않는다
- **THEN** 시스템은 수집을 시작하지 않고 지원되지 않는 저장 adapter임을 명확히 반환한다

### Requirement: 문서화된 실행 결과와 종료 코드
CLI는 SHALL 성공, 부분 성공, 실행 실패, 설정·사용법 실패와 사용자 취소를 서로 다른 문서화된 종료 코드 및 안정적인 결과 코드로 구분해야 한다. 최종 결과는 자동화가 해석 가능한 제한된 JSON 한 줄이어야 한다(MUST).

#### Scenario: 전체 성공
- **WHEN** runner가 격리 오류 없이 성공한다
- **THEN** CLI는 종료 코드 0과 `success` 상태, 실행 ID 및 제한된 집계 수치를 출력한다

#### Scenario: 부분 성공
- **WHEN** runner가 하나 이상의 레코드를 격리하고 나머지를 저장한다
- **THEN** CLI는 종료 코드 2와 `partial` 상태, 실행 ID 및 제한된 집계 수치를 출력한다

#### Scenario: 설정 또는 사용법 실패
- **WHEN** 인자 또는 실행 전 설정 검증이 실패한다
- **THEN** CLI는 종료 코드 1과 안정적인 오류 코드를 출력하며 runner를 호출하지 않는다

#### Scenario: 실행 실패
- **WHEN** 설정 완료 후 수집·가공·저장 또는 연결 단계가 실패한다
- **THEN** CLI는 종료 코드 3과 `failed` 상태 및 안정적인 오류 코드를 출력한다

#### Scenario: 사용자 취소
- **WHEN** 프로세스가 SIGINT 또는 SIGTERM을 받아 실행이 취소된다
- **THEN** CLI는 새 수집·가공·저장을 시작하지 않고 자원을 정리한 뒤 종료 코드 130과 `cancelled` 상태를 출력한다

### Requirement: 비밀정보 없는 제한된 로그
CLI가 stdout 또는 stderr에 출력하는 모든 이벤트와 최종 결과는 SHALL 허용 목록 필드만 포함해야 하며, password, token, authorization 값, connection string, 전체 설정 원문, 원천 레코드·응답 및 원본 driver 오류·stack을 포함해서는 안 된다(MUST NOT).

#### Scenario: 민감한 설정 오류
- **WHEN** 비밀번호·token·connection string을 포함하는 하위 오류나 잘못된 설정 때문에 실행이 실패한다
- **THEN** 출력에는 안정적인 오류 코드와 일반화된 메시지만 있으며 민감한 값과 하위 오류 문자열은 없다

#### Scenario: 수집 실행 로그
- **WHEN** 수집이 시작되고 완료되거나 실패한다
- **THEN** 각 로그는 timestamp, event, plugin ID, 허용된 상태·집계·공개 오류 코드 중 해당 필드만 가진 JSON 한 줄이다

### Requirement: 결정적 자원 정리
CLI는 SHALL 성공, 부분 성공, 실패 및 취소의 모든 경로에서 생성된 collector와 DB 연결 자원을 역순으로 정리해야 하며, 정리 함수는 반복 호출되어도 추가 부작용이나 하위 오류 노출 없이 완료되어야 한다(MUST).

#### Scenario: 정상 종료 후 정리
- **WHEN** runner가 성공 또는 부분 성공 결과를 반환한다
- **THEN** CLI는 DB 연결을 닫은 뒤 최종 종료 결과를 반환한다

#### Scenario: 실행 중 실패 후 정리
- **WHEN** 연결 이후 runner 또는 collector가 실패한다
- **THEN** CLI는 생성된 자원을 한 번 이상 안전하게 닫고 원래의 안정적인 실패 결과를 유지한다

#### Scenario: 반복 정리
- **WHEN** signal 처리와 finally 경로가 같은 자원에 대해 close를 반복 호출한다
- **THEN** close는 안전하게 같은 완료 상태를 반환하고 추가 오류를 출력하지 않는다

### Requirement: 로컬과 배포 이미지의 동일 코어 실행
프로젝트는 SHALL 로컬 pnpm 명령과 배포 API 이미지 내부 명령에서 동일한 수동 CLI 코어, 외부 설정 루트 입력과 종료 코드 계약을 제공해야 한다. 이 실행 경로는 NestJS HTTP 요청, Redis, worker 또는 LDAP에 의존해서는 안 된다(MUST NOT).

#### Scenario: 로컬 수동 실행
- **WHEN** 운영자가 문서화된 pnpm 명령에 plugin ID, 외부 설정 루트와 필수 환경 설정을 제공한다
- **THEN** 독립 CLI 프로세스가 외부 registry를 검증해 실행되고 NestJS 서버를 시작하지 않는다

#### Scenario: 배포 이미지 수동 실행
- **WHEN** 운영자가 외부 설정 볼륨이 주입된 API 배포 이미지에서 문서화된 명령을 실행한다
- **THEN** 로컬 명령과 같은 CLI 코어, 외부 registry 및 종료 코드 계약을 사용하며 이미지 내부 샘플 설정에 의존하지 않는다

### Requirement: HTTP CSV 플러그인의 공통 CLI 실행
CLI는 SHALL registry에서 선택한 HTTP CSV 플러그인의 응답을 제한된 행 묶음으로 수집하여 다른 지원 source와 동일한 가공·검증·저장 코어에 전달해야 한다. 각 묶음은 저장 전 기대 checkpoint, 저장 후 확정할 다음 numeric checkpoint와 HTTP CSV source가 보고한 전체 응답 완료 여부를 전달해야 한다.

#### Scenario: HTTP CSV 전체 수동 수집
- **WHEN** 운영자가 유효한 HTTP CSV 플러그인 ID로 수동 CLI를 실행하고 원천이 여러 묶음의 유효한 CSV를 반환한다
- **THEN** CLI는 `unsupported_collector` 없이 모든 행을 순서대로 공통 수집 코어에 전달하고 마지막 묶음의 전체 완료 여부를 기록한다

#### Scenario: API 기동 수집의 HTTP CSV 실행
- **WHEN** API가 등록된 HTTP CSV 플러그인을 기동 전체 수집 대상으로 실행한다
- **THEN** API는 수동 실행과 같은 CLI 코어를 사용하여 HTTP CSV 행을 저장하고 대상별 실행 결과를 기록한다

### Requirement: HTTP CSV numeric checkpoint 재개
CLI는 SHALL HTTP CSV 실행의 저장 완료 numeric checkpoint를 확정된 행 수로 해석하고 재실행 시 해당 행을 건너뛴 뒤 남은 행만 전달해야 한다. checkpoint는 성공적으로 저장된 묶음 뒤에만 진행해야 하며 실패하거나 취소된 묶음의 행을 확정해서는 안 된다(MUST NOT).

#### Scenario: 저장 완료 행 이후 재개
- **WHEN** HTTP CSV 실행이 numeric checkpoint와 함께 다시 시작되고 원천이 같은 순서의 CSV를 반환한다
- **THEN** CLI는 checkpoint 이전 행을 전달하지 않고 첫 미확정 행부터 순서대로 수집한다

#### Scenario: 묶음 경계 내부 checkpoint
- **WHEN** 저장 완료 checkpoint가 HTTP CSV source가 생성한 묶음의 중간 행을 가리킨다
- **THEN** CLI는 그 묶음에서 이미 확정된 행만 제거하고 남은 행에 checkpoint 이후의 연속된 위치를 부여한다

#### Scenario: 실패 또는 취소된 묶음
- **WHEN** HTTP 다운로드·CSV 파싱·묶음 처리 중 실패하거나 실행이 취소된다
- **THEN** CLI는 기존 공개 실패 또는 취소 결과를 반환하고 마지막 저장 완료 checkpoint 이후의 행을 확정하지 않는다

#### Scenario: 잘못된 HTTP CSV checkpoint
- **WHEN** HTTP CSV 실행이 음수·비정수 또는 숫자가 아닌 checkpoint에서 시작된다
- **THEN** CLI는 원천을 정상 완료한 것으로 처리하지 않고 안정적인 실행 실패 결과를 반환한다
