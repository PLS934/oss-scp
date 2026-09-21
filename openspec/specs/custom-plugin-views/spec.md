# custom-plugin-views Specification

## Purpose

플랫폼이 기동 시 검증한 플러그인 전용 React 화면을 검증된 메뉴 route에 선택적으로 연결하면서, 미등록 화면과 로딩·렌더링 실패를 안전하게 처리한다.

이 문서는 화면 선택·route 입력·오류 격리를 다룬다. 사전 빌드 산출물, manifest, 호환성·무결성 검증과 전달은 [UI 배포 명세](../plugin-ui-distribution/spec.md)를 따른다.

## Requirements

### Requirement: 플러그인별 사용자 정의 화면을 선택적으로 사용한다
클라이언트는 [UI 배포 계약](../plugin-ui-distribution/spec.md)에 따라 서버가 기동 시 검증하여 공개한 플러그인 ID별 사용자 정의 목록·상세 UI descriptor만 사용해 해당 same-origin 번들을 로드하고 화면을 각각 선택할 수 있어야 한다(SHALL). React 원본, 임의 외부 URL 또는 검증되지 않은 프론트엔드 번들을 발견·변환·실행해서는 안 된다(MUST NOT). 목록 또는 상세 화면이 선언되지 않은 경우 해당 route는 기존 공통 화면을 사용해야 한다(MUST).

#### Scenario: 목록과 상세를 모두 등록한다
- **WHEN** 활성 메뉴의 검증 완료 UI descriptor에 사용자 정의 목록과 상세 화면이 모두 선언되어 있다
- **THEN** 목록 route와 상세 route는 각각 해당 사용자 정의 화면을 로드해 표시한다

#### Scenario: 목록만 등록한다
- **WHEN** 활성 메뉴의 검증 완료 UI descriptor에 사용자 정의 목록만 선언되어 있다
- **THEN** 목록 route는 사용자 정의 목록을 표시하고 상세 route는 기존 공통 상세 화면을 표시한다

#### Scenario: 사용자 정의 화면을 등록하지 않는다
- **WHEN** 활성 메뉴의 플러그인에 검증 완료 UI descriptor가 없거나 현재 화면 종류가 선언되지 않았다
- **THEN** 기존 공통 목록 또는 상세 화면을 그대로 표시한다

#### Scenario: 미검증 UI 참조
- **WHEN** 외부 설정이 React 원본, 원격 URL 또는 검증 완료 descriptor에 없는 프론트엔드 파일을 참조한다
- **THEN** 클라이언트는 해당 코드를 로드하거나 실행하지 않는다

### Requirement: 검증된 route context만 사용자 정의 화면에 전달한다
클라이언트는 사용자 정의 목록에 활성 메뉴의 검증된 공개 context를 SHALL 전달하고, 사용자 정의 상세에는 같은 context와 URL에서 해석한 `recordId`를 SHALL 전달해야 한다. 사용자 정의 화면은 플랫폼의 공개 조회 API를 사용해야 하며(MUST), 원천 Connection이나 서버 전용 설정을 입력으로 받아서는 안 된다(MUST NOT).

#### Scenario: 사용자 정의 목록 입력
- **WHEN** 등록된 사용자 정의 목록 route가 활성화된다
- **THEN** 화면은 서버의 검증된 메뉴 응답에 포함된 `pluginId`, `sourceId`, `dataType`과 표시 정의를 입력으로 받는다

#### Scenario: 사용자 정의 상세 직접 접근
- **WHEN** 사용자가 등록된 사용자 정의 상세 URL을 직접 열거나 새로고침한다
- **THEN** 화면은 메뉴 선택 때와 동일한 검증된 context 및 URL의 `recordId`를 입력으로 받는다

#### Scenario: 서버 권한 경계 유지
- **WHEN** 사용자 정의 화면이 저장 레코드를 조회한다
- **THEN** 기존 공개 API를 호출하며 서버의 조회 범위와 권한 검사를 동일하게 적용받는다

### Requirement: 사용자 정의 화면 오류를 route 영역에 격리한다
클라이언트는 사용자 정의 UI 번들의 다운로드·import·export·렌더링 실패를 활성 route 영역에서 처리하고 안전한 실패 안내를 표시해야 한다(SHALL). 원본 예외·내부 경로·번들 소스를 사용자 메시지에 포함하지 않아야 한다(MUST NOT). 오류가 발생해도 애플리케이션 shell, 다른 플러그인 메뉴와 이후 탐색을 계속 사용할 수 있어야 한다(MUST).

#### Scenario: 사용자 정의 목록 렌더링 실패
- **WHEN** 사용자 정의 목록 컴포넌트가 렌더링 중 예외를 발생시킨다
- **THEN** 활성 route 영역에 사용자 정의 화면을 표시하지 못했다는 안전한 안내를 표시하고 메뉴 탐색은 유지한다

#### Scenario: 실패 화면에서 다른 메뉴로 이동
- **WHEN** 사용자가 오류가 발생한 사용자 정의 화면에서 다른 플러그인 메뉴를 선택한다
- **THEN** 새 route의 사용자 정의 화면 또는 공통 화면을 정상적으로 표시한다

#### Scenario: UI 번들 로드 실패
- **WHEN** 검증된 사용자 정의 UI 번들을 다운로드·import하거나 요구 export를 해석할 수 없다
- **THEN** 활성 route에 안전한 실패 안내를 표시하고 다른 메뉴 탐색을 유지한다
