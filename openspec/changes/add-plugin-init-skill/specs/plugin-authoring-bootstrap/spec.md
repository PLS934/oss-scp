## Purpose

OSS-SCP 도입 사용자가 GitHub에서 공통 스킬을 설치하거나 AI 없이 CLI를 실행해 독립 설정 폴더에서 첫 수집 플러그인을 생성하고 대상 플랫폼의 계약으로 검증할 수 있게 한다.

## ADDED Requirements

### Requirement: 도구 중립적 스킬 배포

시스템은 GitHub ref를 고정해 설치 가능한 공통 스킬 폴더와 Codex·Claude Code별 설치 안내를 제공해야 한다(SHALL). 스킬 폴더 외부 파일 없이 생성 CLI가 실행되어야 한다(SHALL).

#### Scenario: 별도 설치

- **WHEN** 사용자가 스킬 폴더만 복사하고 Node.js로 생성 명령을 실행한다
- **THEN** 플랫폼 소스 checkout이나 AI 전용 API 없이 플러그인 설정 폴더를 생성한다

### Requirement: 독립 플러그인 초기 설정

생성기는 JSON single·offset, CSV file·HTTP 입력 방식을 지원하고 plugin/source/실행 가능한 transform, registry, 필요한 Connection과 로컬 예제를 생성해야 한다(SHALL). 유일키와 기본 목록·상세·메뉴를 포함하고 원천 필드는 예제임을 명시해야 한다(SHALL). 운영자 작업 파일만 생성하며 담당자 정보·DB·실행 중 플랫폼을 변경하지 않아야 한다(MUST).

#### Scenario: 지원 입력 초기화

- **WHEN** 사용자가 유효한 ID, 지원 source 유형과 새로운 출력 경로를 지정한다
- **THEN** 생성된 설정은 기존 플랫폼 검증기를 통과하며 transform은 예제 레코드를 선언된 데이터 형태로 변환한다

#### Scenario: 입력 오류와 덮어쓰기 방지

- **WHEN** ID나 source가 잘못되었거나 출력 경로가 이미 존재한다
- **THEN** 0이 아닌 종료 코드로 실패하고 기존 파일을 변경하지 않는다

### Requirement: 대상 플랫폼 검증기 재사용

검증 CLI는 사용자가 명시한 플랫폼 이미지 또는 빌드된 로컬 checkout의 기존 검증기를 사용하고 실패 종료 코드를 전달해야 한다(SHALL). 이미지 참조는 명시적 버전 또는 digest로 고정하고 스킬 ref와 대상 버전 정합 확인 절차를 안내해야 한다(SHALL). 검증을 수집·저장·조회 성공으로 표현하지 않아야 한다(MUST).

#### Scenario: 계약 오류

- **WHEN** 사용자가 존재하지 않는 필드를 목록에 지정하고 검증한다
- **THEN** 플랫폼 검증기가 오류 위치를 출력하고 CLI가 실패한다

#### Scenario: 환경 미준비

- **WHEN** 로컬 검증기가 빌드되지 않았거나 대상 이미지가 없다
- **THEN** 검증 성공을 보고하지 않고 필요한 준비 절차와 실패를 알린다
