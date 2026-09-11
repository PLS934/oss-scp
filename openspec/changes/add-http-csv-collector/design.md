## Context

동기는 `proposal.md`를 따른다. 현재 `plugin-config`는 HTTP JSON offset·single과 로컬 CSV를 판별하고, `csv-reader`는 임의 Node readable stream을 UTF-8 CSV 행으로 파싱하는 `parseCsv`와 로컬 파일 어댑터를 제공한다. HTTP JSON 수집기는 Fetch 응답을 페이지 단위로 버퍼링하지만 CSV 다운로드는 파일 크기에 비례하는 버퍼링 없이 전송·압축 해제·파싱·묶음 처리 전 구간에 backpressure와 한도를 유지해야 한다.

## Goals / Non-Goals

**Goals:**

- 기존 source-v1과 HTTP Connection 계약을 유지하면서 HTTP CSV를 명확히 판별하는 설정을 추가한다.
- 네트워크 획득, 압축 해제, 공통 CSV 파싱과 행 묶음 처리를 스트림 pipeline으로 연결한다.
- 전송 전후 크기, 중도 종료, timeout·취소와 소비자 실패를 구분하고 모든 자원을 정리한다.
- 로컬과 HTTP가 같은 CSV에서 동일한 문자열 행을 반환함을 검증한다.

**Non-Goals:**

- CSV 문법을 다시 구현하거나 임의 인코딩·구분자 옵션을 추가하지 않는다.
- 가공 실행, DB 저장, checkpoint, 자산 부재 판정과 메뉴·화면에는 HTTP CSV를 연결하지 않는다.
- redirect, 임의 HTTP 메서드, 브라우저 업로드 또는 원격 URL을 source에 직접 허용하지 않는다.

## Decisions

### HTTP CSV를 source-v1의 별도 판별 분기로 추가한다

`transport: "http"`, `format: "csv"`를 판별자로 사용하고 `connectionRef`, `path`, `method`, `batchSize`, `limits`만 허용한다. limits는 `timeoutMs`, `maxDownloadBytes`, `maxCsvBytes`, `maxRecordSize`로 분리한다. 로컬 CSV와 같은 필드명인 `batchSize`·`maxRecordSize`를 사용하되 파일 전용 `maxBytes`와 HTTP 전송 한도를 혼용하지 않는다.

기존 JSON 분기에 CSV 선택 값을 끼워 넣으면 `itemsPath`·pagination 같은 JSON 전용 속성이 선택 사항으로 퍼지고 잘못된 조합을 놓치므로 선택하지 않는다. 별도 source-v2는 호환 가능한 기능 추가에 비해 migration 비용이 커서 사용하지 않는다.

### Node HTTP 응답 스트림을 소유하는 전용 패키지를 둔다

새 `@oss-scp/http-csv-source` 패키지는 검증된 내부 definition을 받아 callback으로 묶음을 전달하고 요약을 반환한다. callback이 완료될 때까지 다음 행을 요구하지 않아 backpressure를 보장하며, 마지막 lookahead 이후 처리까지 성공해야 완료 요약을 반환한다. 헤더만 있는 CSV는 빈 완료 묶음을 한 번 전달한다.

기존 `http-collector`에 추가하면 JSON의 페이지 버퍼 방식과 CSV pipeline 오류·압축 책임이 한 모듈에 섞인다. `local-csv-source`에 추가하면 파일 접근과 네트워크 획득 경계가 흐려지므로 전용 패키지를 선택한다. 공통 묶음 도우미 추출은 두 구현이 실제로 더 공유하게 될 때로 미룬다.

### 전송 스트림과 해제 스트림에 독립 한도를 적용한다

Node의 `http`/`https` 응답 스트림을 사용해 wire 바이트를 직접 계수하고, `gzip`, `deflate`, `br`만 명시적으로 해제한 뒤 해제된 CSV 바이트를 다시 계수해 `parseCsv`에 전달한다. `Content-Length`가 전송 한도를 넘으면 본문 전에 거부하고, 수신 완료 시 실제 wire 바이트와 일치하는지 확인한다. chunked 응답은 실제 수신량과 응답의 완료 상태로 판단한다.

Fetch는 런타임이 자동 해제한 body와 원래 `Content-Length`를 함께 노출할 수 있어 전송 전후 계수를 신뢰성 있게 분리하기 어렵다. 전체 body 버퍼링은 크기와 backpressure 요구에 어긋나므로 사용하지 않는다. 알 수 없는 또는 다중 content-encoding은 명시적으로 거부한다.

### 하나의 AbortSignal로 요청 생명주기를 닫는다

호출자 signal과 timeout controller를 결합해 DNS/연결, headers, body와 파싱 완료 전까지 요청을 중단한다. 호출자 취소와 timeout을 우선순위 있게 분류하고, 소비자 callback 오류는 `processing`으로 정규화한다. 오류 또는 조기 종료 시 request, response, decompressor, parser iterator를 destroy/return하여 열린 소켓과 후속 읽기를 남기지 않는다.

오류 메시지는 scheme·host·pathname까지만 포함하고 query, 응답 본문, 행 원문과 Connection 비밀은 포함하지 않는다. HTTP status는 상태 코드만 포함한다.

### 샘플은 기존 mock API endpoint와 별도 Connection을 사용한다

`vulnerabilities-http-csv` 플러그인과 `mock-api-vulnerabilities-csv` Connection을 등록해 `/vulnerabilities.csv`를 요청한다. 같은 프로세스를 가리키더라도 원천 단위의 Connection 독립성을 예제에서 유지한다. 플러그인 data/transform은 기존 CSV 샘플 정의를 재사용 가능한 형태로 복제하되 기존 로컬 플러그인 파일은 수정하지 않는다.

## Risks / Trade-offs

- [서버가 Content-Length 없이 TCP를 정상 종료하면 애플리케이션 수준의 잘림을 알 수 없음] → CSV 문법과 응답 완료 상태는 검증하되, 길이·checksum을 제공하지 않는 원천의 의미상 완전성은 보장할 수 없음을 문서화한다.
- [end-to-end timeout이 느린 소비자 대기 시간도 포함함] → 실행 상한을 명확히 유지하고 운영자가 source별 timeout을 조정하게 한다.
- [압축 형식마다 오류 표면이 다름] → 지원 encoding을 고정하고 모든 해제 실패를 별도 안전한 오류 코드로 정규화한다.
- [한 행 lookahead가 레코드 하나를 추가 보관함] → 정확한 마지막 완료 표시를 위해 허용하고 `maxRecordSize`로 상한을 둔다.

## Migration Plan

기존 설정은 변경 없이 유효하다. schema·타입·로더와 실행 패키지를 먼저 추가한 뒤 새 Connection과 샘플 플러그인을 registry에 등록한다. 롤백 시 새 등록 항목과 HTTP CSV 패키지를 제거하면 기존 JSON·로컬 CSV 경로로 돌아가며 영속 데이터 변경은 없다.
