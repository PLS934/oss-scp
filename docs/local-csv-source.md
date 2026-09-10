# 로컬 CSV source

`vulnerabilities-local-csv` 플러그인은 플랫폼 실행 환경에서 접근할 수 있는 `fixtures/csv/vulnerabilities.csv`를 공통 CSV 파서로 읽고, 전체 파일을 메모리에 모으지 않은 채 제한된 행 묶음으로 전달합니다.

## 설정

`plugins/vulnerabilities-local-csv/source.json`의 형식은 다음과 같습니다.

```json
{
  "apiVersion": "oss-scp/source-v1",
  "transport": "file",
  "format": "csv",
  "path": "fixtures/csv/vulnerabilities.csv",
  "batchSize": 20
}
```

- `path`는 저장소 설정 루트 기준 상대 `.csv` 경로입니다. 절대 경로와 `..`로 루트 밖을 참조하는 경로는 파일을 열기 전에 거부합니다.
- 배포 환경에서는 파일을 설정 루트 안의 같은 상대 위치로 마운트해야 합니다. 환경 밖 파일을 허용하는 Connection 계약은 현재 지원하지 않습니다.
- `batchSize`는 1~1000이며 필수입니다.
- `maxBytes`와 `maxRecordSize`는 양의 안전한 정수로 선택 지정합니다. 생략 시 공통 파서 기본값인 파일 1 GiB, 레코드 1 MiB가 적용됩니다.
- 로컬 파일은 접속 정보나 비밀이 없으므로 `connectionRef`, HTTP 메서드·응답 경로·pagination을 함께 지정할 수 없습니다.

설정만 검증하려면 저장소 루트에서 다음을 실행합니다.

```sh
pnpm validate:plugins
```

출력의 `vulnerabilities-local-csv` 정의에는 검증된 절대 파일 경로, 묶음 크기와 한도가 포함됩니다. 이 단계에서는 파일 내용을 읽지 않습니다.

## 실행 계약

`@oss-scp/local-csv-source`의 `collectLocalCsv(definition, { signal })`은 검증된 로컬 CSV 정의를 받아 `AsyncGenerator`로 다음 묶음을 반환합니다.

```ts
interface LocalCsvBatch {
  records: Record<string, string>[];
  complete: boolean;
}
```

각 값은 숫자처럼 보여도 원천 문자열 그대로 유지됩니다. 첫 행은 필드 이름이며 UTF-8, 선택 BOM, 쉼표 구분, 인용 쉼표·줄바꿈·큰따옴표와 LF·CRLF·CR을 지원합니다. 타입 변환은 후속 가공 단계의 책임입니다.

소비자가 다음 묶음을 요청할 때만 읽기가 진행됩니다. 마지막까지 읽고 파일 변경 없음이 확인된 마지막 묶음만 `complete: true`입니다. 헤더만 있는 정상 파일은 빈 완료 묶음을 한 번 반환합니다. 소비자가 조기 종료하면 파일 iterator를 닫습니다.

샘플과 실패 경로를 실제 파일로 검증하려면 다음을 실행합니다.

```sh
pnpm --filter @oss-scp/local-csv-source test
```

## 실패와 취소

공통 파서의 오류 코드를 변경하지 않습니다.

| 코드 | 의미 |
|---|---|
| `FILE_NOT_FOUND` | 파일 없음 |
| `FILE_ACCESS` | 일반 파일이 아니거나 접근·읽기 실패 |
| `FILE_CHANGED` | 순회 중 파일 교체·크기·수정 정보 변경 |
| `CSV_FORMAT` | 헤더·열 수·인용·UTF-8 형식 오류 |
| `CSV_LIMIT` | 파일 또는 레코드 크기 초과 |
| `CSV_OPTIONS` | 잘못된 파서 한도 |
| `LOCAL_CSV_ABORTED` | 전달한 `AbortSignal`로 실행 취소 |

오류나 취소 전에 반환된 묶음은 `complete: false`이며 전체 수집 성공이나 자산 부재 판정의 근거로 사용할 수 없습니다. 실패·취소·조기 종료 시 열린 파일 자원을 정리합니다.

## 제외 범위

브라우저 업로드, HTTP CSV 다운로드, 사용자 지정 구분자·비 UTF-8 인코딩, 가공 코드 실행, DB 저장, checkpoint 영속화, 메뉴·화면은 이 source 구현에 포함하지 않습니다. HTTP 다운로드는 추후 획득 계층만 추가하고 같은 공통 CSV 파서를 재사용합니다.
