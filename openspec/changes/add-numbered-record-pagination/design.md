## Context

동기는 proposal.md를 따른다. 기존 query.ts는 limit·cursor를 검증하고 두 DB adapter는 limit+1 keyset 조회와 요약 4 MiB 조기 중단을 사용한다. React 목록은 cursor history reducer를 보유하며 API service/controller와 records.ts 검증기도 cursor 계약만 처리한다. 관련 테스트는 platform-db/test/query.test.mjs 및 record-contract.mjs, apps/api/test/server.test.mjs, apps/web/test/records.test.ts 및 record-list.test.tsx, scripts/test-browser.mjs에 있다.

## Goals / Non-Goals

**Goals:** 동일 endpoint에서 하위 호환성을 유지하며 번호형 페이지를 추가하고 기존 수집 상태와 원천 데이터 요약 정책을 보존한다.

**Non-Goals:** 새로운 수집처 변환·식별·담당자 저장 변경, 검색 기능, 인증·권한 구현, 테마 및 행 이동 변경은 하지 않는다. page 조회도 기존 service 경계를 사용하고 원천을 호출하지 않는다.

## Decisions

1. `page`가 없으면 기존 cursor 모드, 있으면 번호형 모드로 분기한다. 페이지 크기는 별도 pageSize 입력 대신 기존 limit을 재사용한다. 번호형 pageInfo는 page/pageSize/totalItems/totalPages/hasNextPage로 구분하고 nextCursor는 포함하지 않는다. 별도 endpoint 대안보다 scope·수집 상태·오류 경계를 재사용할 수 있다. TypeScript에서는 두 응답 타입을 명확히 구분하여 기존 cursor 소비자가 손상되지 않게 한다.
2. 같은 연결의 읽기 전용 REPEATABLE READ transaction에서 scoped count와 LIMIT/OFFSET items를 조회하고 commit/rollback을 정리한다. 두 DB 모두 기존 last_seen_at DESC,id ASC 정렬을 보존한다. 번호형 page/offset과 DB count 변환의 안전 정수를 검증한다. 전체 키를 먼저 메모리에 읽거나 cursor를 순차 순회하는 대안은 임의 마지막 이동 비용 때문에 채택하지 않는다.
3. totalPages=ceil(totalItems/limit), 빈 결과는 totalPages=0/page=1이며 초과 요청은 마지막 유효 페이지로 clamp한다. 현재 페이지 이후 데이터가 삭제되어도 빈 페이지에 갇히지 않는다. count와 items를 독립 snapshot으로 읽는 방식은 요청 내부 모순 때문에 제외한다.
4. cursor는 기존 4 MiB items 예산에 도달하면 중단한다. 번호형은 중단하면 다음 offset에서 레코드가 누락되므로 모든 선택 레코드를 유지하고 각 레코드의 sourceValues 필드를 결정적인 순서로 추가 생략한다. 4 MiB를 limit으로 배분한 예산과 64 KiB 개별 상한을 함께 적용하고 omittedFields를 갱신한다. 최소 metadata가 예산을 넘으면 안전한 QUERY_FAILED로 실패한다. 상세 원문 조회는 보존한다.
5. 목록 reducer는 요청 대상 페이지와 마지막 성공 페이지를 구분한다. 번호 구간은 floor((page-1)/10)*10+1부터 최대 10개다. route context에는 menu.path도 포함한다. AbortController와 request version으로 늦은 응답을 무시하고 실패 시 마지막 성공 목록을 유지한다. 향후 검색·필터·정렬도 같은 session key에 포함할 수 있게 한다.
6. #87과 #74는 별도 main 기반 PR이다. 본 PR은 record-list의 표 행 내용과 테마 색상 변경을 포함하지 않는다. 이후 병합 충돌은 번호 이동 로직·행 링크·CSS token 각각의 책임을 보존해 통합 검증한다.

## Risks / Trade-offs

- 깊은 OFFSET과 exact count 비용 → 범위 인덱스를 활용하고 페이지 크기와 정수 경계를 제한한다. 대용량 성능 보장은 별도 측정 대상으로 남긴다.
- 요청 사이 수집으로 순서 변경 → 중복·누락 가능성을 문서화하고 페이지 간 고정 snapshot을 약속하지 않는다.
- 번호형 요약에서 더 많은 필드 생략 → 기존 omittedFields 계약으로 명시하고 상세 원문을 유지한다.
- 공유 record-list·브라우저 테스트 충돌 → 이슈별 변경을 분리하고 세 PR을 합친 임시 통합 환경에서 검증한다.

## Migration Plan

DB schema migration 없이 서버·웹을 같은 버전으로 배포한다. 구 웹은 새 서버의 cursor API를 계속 사용한다. 신 웹은 번호형 메타데이터가 필요한 새 서버와 함께 배포한다. 롤백은 서버·웹을 함께 이전 이미지로 되돌리며 저장 데이터 변경이 없으므로 데이터 역변환은 없다. 기존 CI의 양 DB 통합·로컬 빌드/테스트·브라우저 job에 새 회귀 검증을 포함한다.
