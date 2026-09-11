## Why

서버의 저장 레코드 목록·상세 API와 cursor 계약을 React 화면에서 재사용할 공통 경계가 없다. 후속 목록·상세 화면이 요청 직렬화, 응답 검증과 오류 처리를 중복하지 않도록 작은 타입 안전 API 계층을 먼저 제공한다.

## What Changes

- `GET /api/v1/records`와 `GET /api/v1/records/:id`를 호출하는 클라이언트 함수와 공개 TypeScript 타입을 추가한다.
- 조회 범위, 허용된 묶음 크기와 선택적 불투명 cursor를 검증·직렬화하고 동일 출처 `/api` 경로만 사용한다.
- 정상 목록·빈 목록·상세 응답을 검증하고 입력 오류, 잘못된 cursor, 미수집 상세 404, DB 준비 실패 503, 일반 API·응답·네트워크·취소 오류를 화면이 구분할 수 있게 한다.
- 호출자가 전달한 `AbortSignal`을 지원하고 취소를 일반 실패와 구분한다.
- Mock API 단위 테스트와 현재 지원·제외 범위 문서를 추가한다.
- 목록·상세 UI, 메뉴·라우팅, 검색·필터·사용자 지정 정렬과 서버 API 변경은 제외한다.

## Capabilities

### New Capabilities

- `record-query-client`: 저장 레코드 목록·상세 API의 요청, 응답 검증, 오류 및 취소를 담당하는 재사용 가능한 클라이언트 계약

### Modified Capabilities

없음.

## Impact

- `apps/web`에 API 모듈과 단위 테스트가 추가된다.
- 클라이언트 개발 문서에 현재 조회 API 지원 범위가 추가된다.
- 서버 API, 플랫폼 DB, 원천 Connection과 브라우저 화면은 변경하지 않는다.
