# 저장 레코드 기본 조회 API

이 API는 원천 시스템을 호출하지 않고 플랫폼 DB에 마지막으로 저장된 공통 레코드를 읽는다. 현재 계정관리는 비활성화된 상태를 대상으로 하며 인증 없이 접근한다. 역할·담당 자산 권한은 후속 서비스 계층에서 적용한다.

## 목록 조회

```http
GET /api/v1/records?pluginId=sample1&sourceId=sample-api&dataType=asset&limit=20
```

`pluginId`, `sourceId`, `dataType`은 필수다. `limit`은 1~200의 정수이며 생략하면 50이다. 결과는 `lastSeenAt` 내림차순, 같은 시각에는 내부 `id` 오름차순으로 고정된다. 이 단계는 다음 페이지, 전체 건수, 검색·필터·사용자 정렬을 제공하지 않는다.

```json
{
  "records": [
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

직렬화된 최상위 원천 필드 값이 8 KiB를 초과하면 목록의 `sourceValues`에서 제외하고 이름을 `omittedFields`에 표시한다. 저장된 전체 값은 상세 API에서 확인한다.

`collection.status`는 같은 plugin/source의 최신 전체 수집 실행 상태이며 `never_collected`, `running`, `success`, `partial`, `failed` 중 하나다. 이는 data type별 상태가 아니다. 실행 중이거나 실패했어도 기존 저장 목록은 유지되며, `lastStoredAt`은 현재 조회 범위 레코드의 마지막 저장 관측 시각이다. 수집 이력과 저장 결과가 모두 없는 경우에도 HTTP 200과 빈 목록을 반환한다.

## 상세 조회

```http
GET /api/v1/records/00000000-0000-4000-8000-000000000001
```

상세는 목록과 같은 식별·관측 정보 및 저장 한도 내의 전체 `sourceValues`를 반환한다. ID는 플랫폼 내부 UUID다.

## 오류

| HTTP | 코드 | 의미 |
|---|---|---|
| 400 | `INVALID_QUERY` | 필수 범위 누락, 잘못된 limit 또는 UUID |
| 404 | `RECORD_NOT_FOUND` | 유효한 UUID에 해당하는 저장 레코드 없음 |
| 503 | `QUERY_FAILED` | 플랫폼 DB 조회 실패 또는 지원하지 않는 DB 조회 adapter |

오류 응답은 안정된 코드와 메시지만 제공하며 SQL, 드라이버 오류와 접속 정보를 포함하지 않는다. 조회 실패를 원천 직접 조회로 대체하지 않는다.
