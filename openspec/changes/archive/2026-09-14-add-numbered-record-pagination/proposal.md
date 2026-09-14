## Why

#86: 보안팀과 개발팀 사용자는 현재 cursor 기반 이전·다음 탐색만으로 원하는 페이지나 마지막 결과에 바로 접근할 수 없다. 전체 건수와 번호형 조회를 추가하여 목록 탐색 위치와 이동 대상을 명확히 한다.

## What Changes

- 기존 cursor API를 유지하고 `page`와 기존 `limit`을 사용하는 번호형 조회를 추가한다.
- PostgreSQL·MySQL에서 동일 범위 전체 건수와 페이지 메타데이터, 안정 정렬 및 페이지 경계를 제공한다.
- 기본 목록에 처음·이전·최대 10개 번호·다음·마지막 이동과 20·50·100·200건 선택을 제공한다.
- 요청 경합, 빈 결과, 데이터 감소와 응답 크기 제한을 명시적으로 처리한다.
- #87 행 이동, #74 테마, 검색·필터·정렬 기능 자체와 인증 구현은 제외한다. 이슈별 독립 PR로 제출한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `platform-record-query`: 번호형 조회와 count, DB별 일관성 및 크기 제한을 확장한다.
- `record-query-api`: page 입력과 번호형 응답 및 입력 오류를 추가한다.
- `record-query-client`: 번호형 요청·응답 검증을 추가한다.
- `plugin-record-list`: 기본 목록의 cursor 이력을 번호형 직접 탐색으로 교체한다.

## Impact

`packages/platform-db/src/query.ts`, PostgreSQL·MySQL query adapter, API controller/service, `apps/web/src/records.ts`와 `record-list.tsx`, 해당 단위·DB·브라우저 테스트 및 개발 문서가 대상이다. 기존 cursor 호출의 입력·응답·오류는 유지하며 DB schema migration이나 새 외부 의존성은 계획하지 않는다. 기존 명세의 전체 건수 금지·offset 금지 조건은 cursor 모드에 한정하도록 수정한다.
