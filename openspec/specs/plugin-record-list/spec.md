# plugin-record-list Specification

## Purpose

검증된 플러그인 기본 컬럼 정의와 플랫폼 저장 조회 API만 사용해 여러 데이터 종류를 재사용 가능한 React 목록으로 표시하고, 조회 및 수집 상태와 순방향 cursor 이동을 일관되게 제공한다.

## Requirements

### Requirement: 목록 레코드에서 공통 상세로 이동한다
기본 목록은 각 저장 레코드의 내부 UUID를 같은 메뉴의 상세 경로에만 SHALL 사용해야 한다. `externalKey`를 route 식별자로 사용하지 않아야 한다(MUST NOT).

#### Scenario: 목록 행 상세 이동
- **WHEN** 사용자가 목록의 상세 링크를 선택한다
- **THEN** 현재 메뉴 경로와 해당 레코드 내부 UUID로 상세 URL을 생성한다

#### Scenario: 상세에서 목록 복귀
- **WHEN** 사용자가 목록 복귀 동작을 선택한다
- **THEN** 같은 플러그인의 등록 메뉴 경로로 이동한다

### Requirement: 선언형 기본 컬럼으로 저장 레코드를 표시한다
클라이언트는 route context의 pluginId, sourceId, dataType으로 플랫폼 저장 레코드 목록을 조회하고 플러그인의 검증된 기본 columns 순서와 표시명으로 공통 목록을 렌더링해야 한다(SHALL). 각 행은 `sourceValues`에서 선언된 column key만 읽어야 하며 선언되지 않은 필드, `omittedFields`, 큰 본문, 원천 설정과 Connection 정보를 표시하거나 별도로 요청하지 않아야 한다(MUST).

#### Scenario: 플러그인 기본 목록 표시
- **WHEN** 저장 조회 API가 레코드를 반환하고 메뉴의 columns가 여러 scalar 필드를 선언한다
- **THEN** 화면은 선언 순서와 표시명을 표 머리글에 사용하고 각 행에서 해당 key의 값만 표시한다

#### Scenario: 다른 플러그인 정의 재사용
- **WHEN** 이름, 경로, 조회 범위와 컬럼이 다른 검증된 플러그인 메뉴로 이동한다
- **THEN** 클라이언트 본체에 플러그인별 목록 코드를 추가하지 않아도 해당 정의로 목록을 조회하고 표시한다

#### Scenario: 비공개 필드 제외
- **WHEN** 목록 응답의 `sourceValues`에 columns에 선언되지 않은 필드가 포함된다
- **THEN** 화면은 그 필드의 이름과 값을 렌더링하지 않는다

### Requirement: 기본 scalar 값을 일관되게 표현한다
클라이언트는 선언 타입에 따라 string은 문자열 그대로, number는 한국어 locale 숫자, boolean은 `예` 또는 `아니요`, datetime은 한국어 locale 날짜·시간으로 표시해야 한다(SHALL). null, 누락 또는 선언 타입과 맞지 않는 값은 `—`로 표시해야 한다(MUST).

#### Scenario: 기본 타입 표시
- **WHEN** 한 행에 유효한 string, number, boolean, datetime 값이 있다
- **THEN** 각 값은 선언 타입에 맞는 기본 표현으로 표시된다

#### Scenario: 빈 값 표시
- **WHEN** 선언된 필드가 null이거나 `sourceValues`에 없다
- **THEN** 해당 셀은 빈 셀 대신 `—`를 표시한다

#### Scenario: 타입 불일치 표시
- **WHEN** 저장 값이 선언된 scalar 타입과 맞지 않거나 datetime 문자열이 유효하지 않다
- **THEN** 화면은 값을 추정하거나 객체를 문자열화하지 않고 `—`를 표시한다

### Requirement: 수집 및 조회 상태를 구분한다
클라이언트는 목록 로딩, 미수집, 정상 빈 결과, 수집 중, 마지막 실행 실패, 부분 완료와 조회 실패를 사용자가 구분할 수 있게 표시해야 한다(SHALL). 실행 중·실패·부분 완료에도 저장 items가 있으면 기존 목록을 함께 유지해야 한다(MUST).

#### Scenario: 최초 로딩
- **WHEN** 현재 조회 범위의 첫 요청이 완료되지 않았다
- **THEN** 화면은 목록 로딩 상태를 표시하고 이전 범위의 행을 표시하지 않는다

#### Scenario: 미수집 상태
- **WHEN** collection status가 `never_collected`이고 items가 비어 있다
- **THEN** 화면은 아직 수집된 데이터가 없음을 안내한다

#### Scenario: 정상 빈 결과
- **WHEN** collection status가 `success`이고 items가 비어 있다
- **THEN** 화면은 수집은 완료됐지만 표시할 결과가 없음을 안내한다

#### Scenario: 수집 중 기존 결과
- **WHEN** collection status가 `running`이다
- **THEN** 화면은 수집 중임을 알리고 반환된 저장 items가 있으면 목록도 함께 표시한다

#### Scenario: 실패 또는 부분 완료 결과
- **WHEN** collection status가 `failed` 또는 `partial`이다
- **THEN** 화면은 마지막 실행 상태를 각각 구분해 경고하고 반환된 저장 items가 있으면 목록도 함께 표시한다

#### Scenario: 조회 실패
- **WHEN** 저장 조회 클라이언트가 취소 이외의 실패 결과를 반환한다
- **THEN** 화면은 안전한 조회 실패 메시지와 다시 시도 동작을 표시하며 실패 응답 원문을 노출하지 않는다

### Requirement: cursor로 다음 묶음을 조회한다
클라이언트는 cursor 없는 첫 묶음에서 시작하고 `hasNextPage`와 `nextCursor`가 유효할 때만 다음 묶음 이동을 제공해야 한다(SHALL). 다음 묶음은 현재 items를 누적하지 않고 새 묶음으로 교체해야 한다(MUST).

#### Scenario: 다음 묶음 이동
- **WHEN** 현재 응답의 `hasNextPage`가 true이고 사용자가 다음 묶음을 선택한다
- **THEN** 클라이언트는 같은 조회 범위와 limit에 `nextCursor`를 전달하고 반환된 다음 items로 표를 교체한다

#### Scenario: 마지막 묶음
- **WHEN** 현재 응답의 `hasNextPage`가 false이고 `nextCursor`가 null이다
- **THEN** 화면은 다음 묶음 이동을 제공하지 않는다

#### Scenario: 다음 묶음 로딩 중 중복 방지
- **WHEN** 다음 묶음 요청이 진행 중이다
- **THEN** 화면은 중복 요청을 허용하지 않고 진행 중임을 표시한다

### Requirement: 조회 조건 변경과 요청 생명주기를 안전하게 처리한다
클라이언트는 route context 또는 묶음 크기가 바뀌면 보관한 cursor를 폐기하고 새 조건의 첫 묶음을 조회해야 한다(SHALL). 진행 중인 이전 요청은 AbortSignal로 취소하고 그 결과가 새 화면 상태를 덮지 못하게 해야 한다(MUST).

#### Scenario: 묶음 크기 변경
- **WHEN** 사용자가 20·50·100·200 중 다른 묶음 크기를 선택한다
- **THEN** 클라이언트는 cursor 없이 현재 조회 범위의 첫 묶음을 새 limit으로 요청한다

#### Scenario: route context 변경
- **WHEN** 사용자가 다른 플러그인 메뉴로 이동한다
- **THEN** 클라이언트는 이전 cursor와 행을 폐기하고 새 pluginId, sourceId, dataType으로 첫 묶음을 요청한다

#### Scenario: 이전 요청의 늦은 완료
- **WHEN** 조건 변경 전에 시작된 요청이 취소 후 늦게 완료되거나 실패한다
- **THEN** 그 결과는 현재 조건의 목록·상태·오류를 변경하지 않는다
