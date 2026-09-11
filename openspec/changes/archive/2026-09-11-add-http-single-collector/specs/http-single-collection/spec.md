## Purpose

검증된 JSON single source 설정으로 HTTP API를 한 번 안전하게 호출하고, 원천 레코드와 명시적으로 허용된 응답 metadata를 후속 처리 단계에 전달한다.

## ADDED Requirements

### Requirement: 설정 기반 single 수집
수집기는 base URL, 상대 경로, HTTP 메서드와 목록 경로를 입력으로 받아 SHALL HTTP API를 정확히 한 번 호출하고, 업무 필드나 응답 건수를 코드에 고정하지 않은 채 목록의 원천 값과 순서를 변경 없이 처리 함수에 전달해야 한다. 수집 완료 요약은 요청 횟수와 전달 레코드 수를 포함하되 원천 레코드 전체를 포함하지 않아야 한다.

#### Scenario: sample2 단일 요청 수집
- **WHEN** sample2의 `/sample2`와 `items` 경로를 선언한 single 정의로 수집한다
- **THEN** 수집기는 API를 한 번만 호출하고 원본 153건을 같은 값과 순서로 한 번 전달한 뒤 153건 완료를 보고한다

#### Scenario: 다른 응답 경로의 single API
- **WHEN** 주소, 요청 경로와 목록 경로가 sample2와 다른 유효한 single 정의를 사용한다
- **THEN** 수집기는 코드 변경 없이 선언된 경로에서 목록을 읽어 한 번 전달한다

#### Scenario: 정상 빈 목록
- **WHEN** 성공 응답의 목록 경로가 빈 배열을 가리킨다
- **THEN** 수집기는 처리 함수를 호출하지 않고 한 번의 요청과 0건으로 정상 완료한다

### Requirement: 원천 구조와 제한된 metadata 전달
수집기는 SHALL 목록 항목의 중첩 객체·배열을 원천 구조대로 유지하고, source의 `metadataPaths`에 선언된 경로의 값만 경로별 metadata로 처리 함수에 전달해야 한다. 원본 응답 전체와 선언하지 않은 응답 값은 처리 문맥에 포함하지 않아야 한다.

#### Scenario: sample2 중첩 값과 metadata 보존
- **WHEN** sample2가 `items`를 목록 경로로, `test_field6`을 metadata 경로로 선언한다
- **THEN** 처리 함수는 각 항목의 중첩 배열·객체와 `{ "test_field6": true }` metadata를 원본 값대로 받는다

#### Scenario: 선언하지 않은 응답 값 제외
- **WHEN** 응답에 목록과 선언된 metadata 외의 최상위 값이 포함된다
- **THEN** 처리 함수는 선언하지 않은 값이나 원본 응답 전체에 접근할 수 없다

#### Scenario: 존재하지 않는 metadata 응답 경로
- **WHEN** 검증된 metadata 경로가 실제 성공 응답에 존재하지 않는다
- **THEN** 수집기는 해당 응답을 처리 함수에 전달하지 않고 잘못된 응답으로 실패한다

### Requirement: 응답 구조와 바이트 한도
수집기는 SHALL 성공 응답의 압축 해제된 실제 본문을 읽는 동안 설정된 응답 바이트 한도를 적용하고, JSON 해석 후 각 목록 항목의 UTF-8 JSON 직렬화 크기에 단일 레코드 한도를 적용해야 한다. 목록 경로는 배열이어야 하며 한 항목이라도 한도를 넘거나 JSON 값으로 직렬화할 수 없으면 목록 전체를 전달하지 않아야 한다.

#### Scenario: 수신 중 응답 한도 초과
- **WHEN** `Content-Length`와 무관하게 압축 해제된 실제 응답 본문이 설정 한도를 넘는다
- **THEN** 수집기는 읽기를 중단하고 크기 초과 오류를 반환하며 목록을 전달하지 않는다

#### Scenario: 단일 레코드 한도 초과
- **WHEN** 목록의 한 레코드가 설정된 단일 레코드 바이트 한도를 넘는다
- **THEN** 수집기는 정상 크기 레코드를 포함한 목록 일부도 전달하지 않고 실패한다

#### Scenario: 잘못된 JSON 또는 목록 경로
- **WHEN** 성공 상태 응답이 유효한 JSON이 아니거나 선언된 목록 경로가 배열을 가리키지 않는다
- **THEN** 수집기는 응답 검증 오류를 반환하고 처리 함수를 호출하지 않는다

### Requirement: 처리 완료와 제한된 보관
수집기는 SHALL 전체 single 응답을 검증한 뒤 처리 함수를 최대 한 번 호출하고 그 완료를 기다려야 하며, 처리 완료 데이터나 원천 응답을 실행 결과에 중복 보관하지 않아야 한다.

#### Scenario: 느린 처리 완료 대기
- **WHEN** 처리 함수가 아직 완료되지 않았다
- **THEN** 수집 작업은 정상 완료를 반환하지 않는다

#### Scenario: 처리 실패
- **WHEN** 처리 함수가 실패한다
- **THEN** 수집기는 처리 오류를 호출자에게 전파하고 정상 완료를 반환하지 않는다

#### Scenario: 큰 유효 응답의 제한된 실행 결과
- **WHEN** 설정 한도 안의 큰 single 목록을 성공적으로 처리한다
- **THEN** 수집 결과는 요청·레코드 건수의 작은 요약만 포함하고 원천 목록과 metadata를 포함하지 않는다

### Requirement: 실패와 취소 전파
수집기는 SHALL HTTP 비성공 상태, timeout, 호출자 취소와 처리 실패를 구분 가능한 오류로 전달해야 한다. timeout과 취소 시 진행 중인 요청·본문 읽기를 중단하고 처리 함수에는 호출자의 취소 신호를 제공하며, 오류에는 query·응답 본문·header·Connection 원문을 포함하지 않아야 한다.

#### Scenario: HTTP 오류
- **WHEN** 원천이 비성공 HTTP 상태를 반환한다
- **THEN** 수집기는 상태 코드와 비밀 query를 제외한 요청 위치를 식별하는 HTTP 오류를 반환한다

#### Scenario: timeout
- **WHEN** 연결 또는 응답 본문 수신이 설정된 timeout 안에 완료되지 않는다
- **THEN** 수집기는 진행 중인 요청을 중단하고 timeout 오류를 반환한다

#### Scenario: 요청 또는 처리 중 외부 취소
- **WHEN** 호출자가 HTTP 요청, 본문 수신 또는 처리 함수 실행 중 취소 신호를 보낸다
- **THEN** 수집기는 가능한 진행 중 작업을 중단하고 취소 오류를 반환하며 처리 함수가 협력적으로 중단할 수 있도록 같은 신호를 전달한다

### Requirement: 프레임워크 독립 실행과 회귀 검증
HTTP single 수집 기능은 SHALL NestJS 컨트롤러·HTTP 요청 객체·플랫폼 DB 세션 없이 Node.js 테스트나 후속 CLI에서 호출할 수 있어야 한다. 외부 자격증명 없는 loopback HTTP 통합 테스트는 single 정상·실패·자원 제한 동작과 기존 offset 수집 회귀 동작을 함께 검증해야 한다.

#### Scenario: 로컬 통합 검증
- **WHEN** 사용자가 문서화된 HTTP 수집 workspace 테스트 명령을 실행한다
- **THEN** 테스트는 sample2 153건, 일반화된 경로, 빈 응답, metadata, 오류·timeout·취소·크기 제한·처리 완료와 기존 sample1 offset 수집을 외부 자격증명 없이 검증한다
