# HTTP CSV source

`vulnerabilities-http-csv` 플러그인은 HTTP Connection의 base URL과 source의 상대 경로를 결합해 CSV를 다운로드하고, 로컬 CSV와 같은 `@oss-scp/csv-reader` 파서로 문자열 행을 전달합니다. 전체 응답을 한 번에 메모리에 모으지 않습니다.

## 설정

```json
{
  "apiVersion": "oss-scp/source-v1",
  "transport": "http",
  "connectionRef": "mock-api-vulnerabilities-csv",
  "path": "/vulnerabilities.csv",
  "method": "GET",
  "format": "csv",
  "batchSize": 20,
  "limits": {
    "timeoutMs": 5000,
    "maxDownloadBytes": 2097152,
    "maxCsvBytes": 2097152,
    "maxRecordSize": 262144
  }
}
```

- base URL은 source가 아니라 등록된 HTTP Connection에 둡니다. 인증 비밀 참조는 현재 Connection 계약의 후속 범위입니다.
- `path`는 query나 fragment가 없는 `/` 시작 상대 HTTP 경로이고 메서드는 GET입니다.
- `batchSize`는 1~1000입니다. 소비자 callback이 끝난 뒤에 다음 행을 요구하므로 느린 처리에 다운로드가 맞춰집니다.
- `timeoutMs`는 연결부터 마지막 묶음 처리까지의 실행 상한이며 100~300000ms입니다.
- `maxDownloadBytes`는 압축된 wire 응답, `maxCsvBytes`는 압축 해제 후 CSV, `maxRecordSize`는 CSV 레코드 하나의 바이트 상한입니다. 각각 1~100MiB이며 레코드 한도는 CSV 한도보다 클 수 없습니다.

`gzip`, `deflate`, `br`와 identity 응답을 지원합니다. 알 수 없거나 여러 단계로 선언한 content encoding은 거부합니다.

## 실행

`collectHttpCsv(definition, onBatch, { signal })`은 검증된 내부 definition과 묶음 처리 callback을 받습니다.

```ts
const summary = await collectHttpCsv(definition, async ({ records, complete, signal }) => {
  await processBatch(records, { complete, signal });
});
```

행 값은 숫자처럼 보여도 문자열을 유지합니다. 마지막 묶음 처리까지 성공해야 `{ requests: 1, records }` 요약을 반환합니다. 헤더만 있는 정상 CSV는 빈 `complete: true` 묶음을 한 번 전달합니다. 가공과 DB 저장은 이 패키지의 범위가 아닙니다.

## 오류와 완료 보장

| 코드 | 의미 |
|---|---|
| `http_status` | 2xx가 아닌 HTTP 상태 |
| `timeout` | 전체 실행 시간 초과 |
| `cancelled` | 호출자 AbortSignal 취소 |
| `download_too_large` | wire 다운로드 한도 초과 |
| `csv_too_large` | 압축 해제 후 CSV 한도 초과 |
| `record_too_large` | 단일 CSV 레코드 한도 초과 |
| `length_mismatch` | 선언된 Content-Length와 수신 길이 불일치 |
| `incomplete_download` | 길이 선언 없는 응답의 비정상 중단 |
| `unsupported_encoding` | 지원하지 않는 content encoding |
| `invalid_compression` | 손상된 압축 스트림 |
| `invalid_csv` | 헤더·열·인용·UTF-8 CSV 형식 오류 |
| `processing` | 소비자 묶음 처리 실패 |
| `network` | 그 밖의 연결·전송 실패 |

오류 메시지는 protocol, host, pathname과 상태/원인 코드만 사용하며 URL query, 응답 본문과 CSV 원문을 노출하지 않습니다. 실패·취소 전에 전달된 묶음은 전체 성공이나 후속 자산 부재 판정의 근거가 아닙니다.

`Content-Length`가 있으면 사전 크기 검사와 완료 길이 검증에 사용하지만 실제 수신 바이트도 항상 계수합니다. 길이·checksum이 없는 서버가 문법적으로 유효한 CSV 경계에서 정상적으로 연결을 끝내면 애플리케이션은 의미상 누락을 판별할 수 없습니다. 완전성 보장이 필요한 원천은 신뢰할 수 있는 Content-Length 또는 별도 checksum/건수 계약을 제공해야 합니다.

## 검증

```sh
pnpm validate:plugins
pnpm test:http-csv-source
```

테스트는 53행 샘플, 로컬/HTTP 결과 일치, 다른 CSV 구조, 압축, timeout·취소·중단·길이·형식·크기·처리 실패, 자원 정리와 큰 입력의 제한된 heap 사용을 확인합니다.

## 제외 범위

브라우저 업로드, 임의 인코딩·구분자, redirect, 가공 실행, DB 저장, checkpoint 영속화, 메뉴·화면 연결은 포함하지 않습니다.
