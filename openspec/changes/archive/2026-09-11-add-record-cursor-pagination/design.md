## Context

현재 공통 조회는 `lastSeenAt DESC, id ASC`와 `LIMIT`만 사용하며 첫 묶음 이후를 읽을 수 없다. 목록 API는 이후 클라이언트 공통 계층과 선언형 화면의 기반이므로 대용량에서도 offset 비용과 페이지 사이 경계 중복을 피해야 한다.

## Goals / Non-Goals

**Goals:**

- 공개 HTTP와 DB 독립 조회 계약에 불투명 cursor를 추가한다.
- PostgreSQL에서 keyset pagination과 제한된 응답을 검증한다.
- 기존 수집 상태와 상세 조회 동작을 유지한다.

**Non-Goals:**

- 검색·필터·사용자 지정 정렬, 정확한 전체 건수와 임의 페이지 이동
- 이전 묶음 cursor와 MySQL 구현
- cursor를 인증·권한 토큰으로 사용하는 것

## Decisions

### 버전이 있는 stateless cursor

cursor는 version, plugin/source/data type, limit, 고정 sort ID와 마지막 `lastSeenAt/id`를 JSON으로 직렬화하고 base64url로 인코딩한다. 서버는 필드 집합·타입·길이·UUID·timestamp와 현재 요청의 범위·limit을 엄격히 비교한다. 별도 cursor 저장소와 새 secret 설정을 피하기 위한 선택이며 cursor는 권한을 부여하지 않는다. 서명된 cursor는 변조 방지가 강하지만 배포 secret과 rotation 계약이 추가되므로 현재 범위에서 제외한다.

### limit+1 keyset 조회

PostgreSQL은 `(last_seen_at < cursorTime) OR (last_seen_at = cursorTime AND id > cursorId)` 조건과 기존 고정 정렬을 사용하고 최대 `limit+1`건을 읽는다. 초과 한 건으로 다음 묶음 존재 여부를 판정하며 정확한 count를 수행하지 않는다. offset 방식은 깊은 페이지 비용과 동시 변경 시 경계 이동 때문에 제외한다.

### 묶음 응답 크기 제한

기존 개별 필드 8 KiB 제한에 레코드 요약 64 KiB와 items 전체 4 MiB 제한을 추가한다. 키 이름 순서로 필드를 결정적으로 포함하고 한도를 넘긴 필드는 omittedFields에 기록한다. 전체 묶음 한도에 도달하면 마지막으로 반환한 레코드에서 cursor를 만들고 `hasNextPage=true`로 종료한다.

### 범위 전체의 lastStoredAt 유지

후속 묶음에서도 `lastStoredAt`은 현재 items가 아니라 조회 범위 전체의 최대 `last_seen_at`을 별도 집계한다. 화면의 마지막 저장 상태 의미가 페이지 이동에 따라 바뀌지 않게 한다.

## Risks / Trade-offs

- [동시 갱신된 레코드가 이미 지난 cursor 앞으로 이동할 수 있음] → cursor는 스냅샷을 보장하지 않는다고 문서화하고, 중복 경계 제거와 안정적 현재 순회를 보장한다.
- [base64url cursor는 클라이언트가 해석할 수 있음] → 공개 계약에서 불투명으로 취급하고 값에 비밀정보를 넣지 않으며 모든 조회 범위와 타입을 서버에서 재검증한다.
- [전체 응답 제한으로 요청 limit보다 적게 반환될 수 있음] → `hasNextPage`와 nextCursor로 이어 읽게 하고 테스트로 누락 없는 진행을 검증한다.

## Migration Plan

목록 응답이 `records`에서 `items/pageInfo`로 바뀌는 breaking change다. 아직 클라이언트 소비 계층이 없으므로 서버·문서·테스트를 한 PR에서 변경하고 이후 #51은 새 계약만 사용한다. 롤백은 이 PR 전체를 되돌려 기존 첫 묶음 전용 계약으로 복원한다.
