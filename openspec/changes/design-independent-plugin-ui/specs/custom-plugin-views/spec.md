## MODIFIED Requirements

### Requirement: 플러그인별 사용자 정의 화면을 선택적으로 사용한다
클라이언트는 서버가 기동 시 검증하여 공개한 플러그인 ID별 사용자 정의 목록·상세 UI descriptor를 각각 선택할 수 있어야 한다(SHALL). 목록 또는 상세 화면이 선언되지 않은 경우 해당 route는 기존 공통 화면을 사용해야 한다(MUST).

#### Scenario: 목록과 상세를 모두 등록한다
- **WHEN** 활성 메뉴의 검증 완료 UI descriptor에 사용자 정의 목록과 상세 화면이 모두 선언되어 있다
- **THEN** 목록 route와 상세 route는 각각 해당 사용자 정의 화면을 로드해 표시한다

#### Scenario: 목록만 등록한다
- **WHEN** 활성 메뉴의 검증 완료 UI descriptor에 사용자 정의 목록만 선언되어 있다
- **THEN** 목록 route는 사용자 정의 목록을 표시하고 상세 route는 기존 공통 상세 화면을 표시한다

#### Scenario: 사용자 정의 화면을 등록하지 않는다
- **WHEN** 활성 메뉴의 플러그인에 검증 완료 UI descriptor가 없거나 현재 화면 종류가 선언되지 않았다
- **THEN** 기존 공통 목록 또는 상세 화면을 그대로 표시한다

## REMOVED Requirements

### Requirement: 사용자 정의 화면 코드는 플랫폼과 함께 빌드한다
**Reason**: 검증된 사용자 정의 UI를 플랫폼 웹 이미지와 독립적인 플러그인 revision으로 배포할 수 있게 하므로 정적 웹 빌드 결합을 제거한다.

**Migration**: 기존 정적 registry 화면은 공통 플러그인 빌드로 ESM·manifest를 생성해 같은 플러그인 revision에 포함하고, 검증 완료 UI descriptor로 로드한다.

## ADDED Requirements

### Requirement: 사용자 정의 화면 코드는 플러그인과 함께 사전 빌드한다
사용자 정의 화면은 플랫폼이 지원하는 UI 계약에 맞춰 플러그인 제작 단계에서 사전 빌드되어야 하며(MUST), 서버가 기동 시 검증한 UI descriptor를 통해서만 클라이언트가 로드해야 한다(MUST). 클라이언트는 React 원본, 임의 외부 URL 또는 검증되지 않은 프론트엔드 번들을 발견·변환·실행해서는 안 된다(MUST NOT).

#### Scenario: 플러그인 UI 빌드
- **WHEN** 사용자 정의 화면을 포함한 플러그인 배포물을 빌드한다
- **THEN** 화면은 지원 React·UI 계약과 무결성 정보를 가진 사전 빌드 ESM 산출물로 포함된다

#### Scenario: 검증된 외부 UI 번들 참조
- **WHEN** 활성 메뉴가 기동 시 검증 완료된 UI descriptor를 포함한다
- **THEN** 클라이언트는 플랫폼 이미지와 독립적으로 해당 same-origin UI 번들을 로드할 수 있다

#### Scenario: 미검증 UI 참조
- **WHEN** 외부 설정이 React 원본, 원격 URL 또는 검증 완료 descriptor에 없는 프론트엔드 파일을 참조한다
- **THEN** 클라이언트는 해당 코드를 로드하거나 실행하지 않는다
