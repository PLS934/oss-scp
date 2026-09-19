## Purpose

OSS-SCP 도입 사용자가 플랫폼 저장소 없이 공통 스킬 또는 일반 CLI로 첫 플러그인 설정을 안전하게 생성하고, 선택한 플랫폼 버전의 실제 계약으로 검증할 수 있게 한다.

## ADDED Requirements

### Requirement: 도구 중립적 스킬 배포

시스템은 GitHub ref로 고정해 설치 가능한 공통 스킬 폴더와 Codex·Claude Code별 설치 안내를 제공해야 한다(SHALL). 스킬 폴더 외부의 플랫폼 파일이나 AI 전용 API 없이 생성 CLI가 실행되어야 한다(SHALL).

#### Scenario: 별도 위치에서 생성

- **WHEN** 사용자가 스킬 폴더만 별도 위치에 복사하고 Node.js로 생성 명령을 실행한다
- **THEN** 플랫폼 소스 checkout이나 AI 전용 API 없이 새 플러그인 설정 루트를 생성한다

#### Scenario: 버전 고정 설치

- **WHEN** 사용자가 GitHub에서 스킬을 설치한다
- **THEN** 문서는 이동 가능한 branch가 아닌 명시적 release tag 또는 commit ref와 대응 플랫폼 버전을 선택하는 절차를 제공한다

### Requirement: 독립 플러그인 초기 설정

생성기는 JSON single, JSON offset, CSV file, CSV HTTP 입력 방식을 지원하고, plugin/source 설정, 즉시 로드 가능한 JavaScript transform, plugin과 Connection registry, 필요한 HTTP Connection 및 로컬 샘플을 새 설정 루트에 생성해야 한다(SHALL). 생성물은 `item` 데이터의 문자열 `id`와 `name`, 유일키 `id`, 기본 목록·상세 및 메뉴 예제를 포함하고 원천 필드는 수정이 필요한 예제임을 명시해야 한다(SHALL). 생성기는 담당자 정보, DB 또는 실행 중 플랫폼을 변경하지 않아야 한다(MUST).

#### Scenario: 지원 source 생성

- **WHEN** 사용자가 유효한 ID, 네 가지 지원 source 유형 중 하나와 존재하지 않는 출력 경로를 지정한다
- **THEN** 생성기는 선택한 source에 필요한 완전한 설정과 샘플을 만들고 예제 transform은 샘플 레코드를 선언된 `item` 형태로 변환한다

#### Scenario: 입력 오류

- **WHEN** 사용자가 잘못된 ID, 지원하지 않는 source, 알 수 없는 인자 또는 누락된 필수 인자를 제공한다
- **THEN** 생성기는 0이 아닌 종료 코드로 실패하고 출력 설정을 남기지 않는다

#### Scenario: 기존 경로 보호

- **WHEN** 출력 경로가 기존 파일·디렉터리이거나 symlink이다
- **THEN** 생성기는 대상을 따르거나 덮어쓰지 않고 0이 아닌 종료 코드로 실패하며 기존 데이터를 보존한다

#### Scenario: 생성 중 실패 정리

- **WHEN** 새 출력 루트를 만드는 도중 생성이 실패한다
- **THEN** 생성기는 이번 실행에서 만든 불완전한 출력만 정리하고 출력 루트 밖의 파일을 변경하지 않는다

### Requirement: 대상 플랫폼 검증기 재사용

검증 CLI는 사용자가 명시한 플랫폼 이미지의 기존 검증기를 사용하고 그 종료 코드를 전달해야 한다(SHALL). 이미지 참조는 명시적 버전 tag 또는 digest로 고정해야 하며 `latest`와 고정되지 않은 참조를 거부해야 한다(SHALL). Docker 검증은 이미지를 자동 pull하지 않고 네트워크와 컨테이너 쓰기를 비활성화하며 설정 루트를 읽기 전용으로 제공해야 한다(MUST). 비루트 POSIX 호스트에서는 컨테이너 검증기를 호스트 사용자의 UID/GID로 실행해 소유자 전용 설정 루트를 권한 완화 없이 읽어야 한다(MUST). 검증 대상 checkout의 코드를 호스트 권한으로 실행하는 경로를 제공하지 않아야 한다(MUST). 검증 성공을 실제 원천 호출·수집·저장·조회 성공으로 표현하지 않아야 한다(MUST).

#### Scenario: 고정 이미지 계약 검증 성공

- **WHEN** 사용자가 로컬에 존재하는 버전 또는 digest 고정 플랫폼 이미지와 유효한 생성 설정을 지정한다
- **THEN** 검증 CLI는 자동 pull·네트워크·컨테이너 쓰기 없이 호스트 사용자 소유권과 읽기 전용 설정을 유지하며 기존 플랫폼 검증기로 확인한다

#### Scenario: 잘못된 설정

- **WHEN** 설정이 존재하지 않는 목록 필드를 참조하거나 transform이 필수 export를 제공하지 않는다
- **THEN** 플랫폼 검증기는 오류를 보고하고 검증 CLI는 0이 아닌 종료 코드로 실패한다

#### Scenario: 검증 환경 미준비

- **WHEN** 지정 이미지가 로컬에 없거나 이미지가 지정되지 않거나 로컬 checkout 실행 인자가 전달된다
- **THEN** 검증 CLI는 성공을 보고하지 않고 준비 조건을 설명하며 0이 아닌 종료 코드로 실패한다

#### Scenario: 호스트 코드 및 pathname 교체 거부

- **WHEN** 사용자가 검증기 파일이나 symlink 또는 상위 경로 구성요소를 교체할 수 있는 로컬 checkout 실행을 요청한다
- **THEN** 검증 CLI는 해당 pathname을 검사하거나 실행하지 않고 0이 아닌 종료 코드로 실패한다

### Requirement: 자동 회귀 검증

프로젝트 CI는 스킬 폴더만 복사한 상태에서 네 source 유형의 생성 및 플랫폼 계약 검증을 실행해야 한다(SHALL). CI는 잘못된 입력·설정과 기존 경로 보호를 함께 검증해야 하며, 현재 revision으로 빌드한 플랫폼 이미지에 대해서도 네 유형의 성공과 손상된 설정의 실패를 확인해야 한다(SHALL).

#### Scenario: CI 생성 및 검증

- **WHEN** 생성기, 템플릿, 문서, 플랫폼 계약 또는 CI 구성이 변경된다
- **THEN** CI는 네 source 유형의 정상 경로와 대표 실패 경로를 자동으로 실행해 결과를 보고한다
