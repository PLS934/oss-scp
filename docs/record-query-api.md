# 저장 레코드 조회 API

이 API는 원천 시스템을 호출하지 않고 플랫폼 DB에 마지막으로 저장된 공통 레코드를 읽는다. 현재 계정관리는 비활성화된 상태를 대상으로 하며 인증 없이 접근한다. 역할·담당 자산 권한은 후속 서비스 계층에서 적용한다.

## 목록 조회

첫 묶음은 cursor 없이 요청한다.

```http
GET /api/v1/records?pluginId=sample1&sourceId=sample-api&dataType=asset&limit=20
```

후속 묶음은 직전 응답의 `nextCursor`를 같은 조회 범위와 `limit`으로 전달한다.

```http
GET /api/v1/records?pluginId=sample1&sourceId=sample-api&dataType=asset&limit=20&cursor=<opaque-token>
```

`pluginId`, `sourceId`, `dataType`은 필수다. `limit`은 20·50·100·200 중 하나이며 생략하면 20이다. 결과는 `lastSeenAt` 내림차순, 같은 시각에는 내부 `id` 오름차순으로 고정된다. PostgreSQL과 MySQL 모두 offset 없이 마지막 정렬 키 다음부터 읽으며, MySQL은 UTC `DATETIME(3)`과 UUID binary collation으로 PostgreSQL과 같은 cursor 경계를 유지한다.

```json
{
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "pluginId": "sample1",
      "sourceId": "sample-api",
      "dataType": "asset",
      "externalKey": "server-1",
      "sourceValues": { "hostname": "server-1" },
      "omittedFields": ["reportBody"],
      "firstSeenAt": "2026-09-11T01:00:00.000Z",
      "lastSeenAt": "2026-09-11T01:01:00.000Z"
    }
  ],
  "pageInfo": {
    "nextCursor": "opaque-token-or-null",
    "hasNextPage": true
  },
  "collection": {
    "scope": "source",
    "status": "success",
    "runId": "00000000-0000-4000-8000-000000000002",
    "startedAt": "2026-09-11T01:00:00.000Z",
    "finishedAt": "2026-09-11T01:02:00.000Z"
  },
  "lastStoredAt": "2026-09-11T01:01:00.000Z"
}
```

`nextCursor`는 클라이언트가 해석하거나 수정하지 않는 불투명 값이다. 조회 범위나 `limit`이 바뀌면 기존 cursor를 버리고 첫 묶음부터 다시 요청한다. 잘못된 형식·버전이거나 다른 범위와 크기에 귀속된 cursor는 거부한다. cursor는 인증 정보가 아니며 비밀정보를 포함하지 않는다.

직렬화된 최상위 원천 필드 값이 8 KiB를 초과하면 목록의 `sourceValues`에서 제외하고 이름을 `omittedFields`에 표시한다. 레코드 요약은 64 KiB, 한 묶음의 items는 4 MiB로 제한한다. 전체 크기 때문에 요청한 수보다 적은 items를 반환해도 `hasNextPage=true`와 cursor로 나머지를 이어서 조회할 수 있다. 저장된 전체 값은 상세 API에서 확인한다.

`collection.status`는 같은 plugin/source의 최신 전체 수집 실행 상태이며 `never_collected`, `running`, `success`, `partial`, `failed` 중 하나다. 이는 data type별 상태가 아니다. `lastStoredAt`은 현재 묶음이 아니라 조회 범위 전체의 마지막 저장 시각이다.

이 계약은 두 지원 DB에서 동일하다. cursor 모드는 전체 건수를 계산하지 않는다. 이전 cursor 생성, 검색·필터·사용자 지정 정렬과 DB 제품 간 데이터 이전은 제공하지 않는다. 순회 중 레코드가 갱신되어 cursor 앞쪽으로 이동하면 현재 순회에 다시 나타나지 않을 수 있으므로 전체 스냅샷을 보장하지 않는다.

## 번호형 목록 조회

`page`를 지정하면 동일 endpoint가 번호형으로 조회한다. `page`는 1부터 시작하는 정수이고 `limit`의 허용값과 기본값은 cursor 모드와 같다.

```http
GET /api/v1/records?pluginId=sample1&sourceId=sample-api&dataType=asset&page=2&limit=20
```

45건 범위에서는 21~40번째 items와 다음 pageInfo를 반환한다. items, collection과 lastStoredAt의 구조는 기존 계약과 같다.

```json
{ "page": 2, "pageSize": 20, "totalItems": 45, "totalPages": 3, "hasNextPage": true }
```

번호형 pageInfo에는 nextCursor가 없다. 전체 건수는 동일 plugin/source/dataType 범위에서 계산하며, 두 DB 모두 읽기 전용 REPEATABLE READ transaction에서 count와 정렬된 LIMIT/OFFSET 조회를 실행한다. 한 요청 안의 전체 건수와 items는 같은 snapshot을 사용한다. 빈 범위는 page=1, totalItems=0, totalPages=0, items=[], hasNextPage=false다. 유효한 정수지만 마지막 페이지를 초과하면 마지막 유효 페이지로 보정한다.

page와 cursor의 동시 지정, 중복 page, 빈 문자열·0·음수·소수·숫자 외 문자는 INVALID_QUERY다. page와 `(page-1)*limit`은 JavaScript 안전 정수 범위 안이어야 한다.

번호형 조회는 4 MiB items 예산 때문에 레코드를 버리지 않는다. 선택한 모든 레코드의 식별 정보와 omittedFields를 유지하면서 원천 요약 필드를 추가로 생략한다. 최소 메타데이터로도 예산을 초과하면 QUERY_FAILED이며 불완전한 성공 페이지를 반환하지 않는다. 상세는 저장 원문을 유지한다.

서로 다른 페이지 요청 사이 수집·추가·삭제가 발생하면 정렬 위치가 변해 중복·누락이 생길 수 있다. 페이지 간 고정 snapshot은 보장하지 않는다. 깊은 페이지 OFFSET과 정확한 count 비용은 데이터 규모에 따라 증가한다.

번호형 요청은 플러그인이 허용한 목록 scalar 필드 하나를 `sort=<field>&direction=asc|desc`로 정렬할 수 있다. 두 값은 함께 전달하며 정렬 변경 시 page 1부터 다시 요청한다. 검색·필터 뒤에 정렬하고 같은 값은 저장 시각 내림차순과 내부 ID 오름차순으로 안정화한다. null·타입 불일치·잘못된 값은 방향과 관계없이 마지막이다. 미허용 필드·방향·중복 값·cursor 결합은 `400 INVALID_QUERY`다.

새 웹과 서버는 같은 버전으로 배포한다. 기존 웹·cursor 호출은 새 서버와 호환되며, 이전 버전으로 되돌릴 때는 웹과 서버를 함께 복귀시킨다. DB migration과 데이터 역변환은 필요 없다.

## 상세 조회

```http
GET /api/v1/records/00000000-0000-4000-8000-000000000001
```

상세는 목록과 같은 식별·관측 정보 및 저장 한도 내의 전체 `sourceValues`를 반환한다. ID는 플랫폼 내부 UUID다.

## 오류

| HTTP | 코드 | 의미 |
|---|---|---|
| 400 | `INVALID_QUERY` | 필수 범위 누락, 허용되지 않은 limit/page, cursor·page 혼합 또는 잘못된 UUID |
| 400 | `INVALID_CURSOR` | 잘못된 형식·버전 또는 현재 조건과 일치하지 않는 cursor |
| 404 | `RECORD_NOT_FOUND` | 유효한 UUID에 해당하는 저장 레코드 없음 |
| 503 | `QUERY_FAILED` | PostgreSQL 또는 MySQL 플랫폼 DB 조회 실패 |

오류 응답은 안정된 코드와 메시지만 제공하며 SQL, 드라이버 오류, 접속 정보와 cursor 내부 값을 포함하지 않는다. 조회 실패를 원천 직접 조회로 대체하지 않는다.
