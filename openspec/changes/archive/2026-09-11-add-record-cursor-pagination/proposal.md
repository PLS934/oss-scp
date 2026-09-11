## Why

현재 저장 레코드 목록 API는 첫 묶음만 반환하고 다음 결과를 조회할 수 없다. 실제 데이터 규모가 클 수 있으므로 offset과 정확한 전체 건수 계산 없이 안정적으로 이어 읽는 cursor 계약이 필요하다.

## What Changes

- **BREAKING** 목록 크기를 임의의 1~200 정수에서 20·50·100·200 중 하나로 제한하고 기본값을 20으로 변경한다.
- 목록 응답을 `records`에서 `items`와 `pageInfo.nextCursor`, `pageInfo.hasNextPage` 구조로 변경한다.
- 조회 범위·묶음 크기·고정 정렬에 귀속된 불투명 cursor를 추가한다.
- PostgreSQL 목록 조회를 `lastSeenAt DESC, id ASC` keyset pagination으로 변경한다.
- 목록 요약과 전체 페이지의 응답 크기를 제한한다.
- 검색·필터·사용자 지정 정렬·정확한 전체 건수·임의 페이지 이동은 제외한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `platform-record-query`: 저장 레코드 목록을 cursor 기반의 제한된 묶음으로 이어 읽는 계약으로 변경한다.
- `record-query-api`: HTTP 요청·응답과 cursor 오류 계약을 추가한다.

## Impact

`@oss-scp/platform-db` 조회 타입·검증·PostgreSQL SQL, NestJS 조회 controller/service, API 문서와 개발 계획이 변경된다. 기존 목록 응답 소비자는 새 `items/pageInfo` 계약으로 전환해야 한다.
