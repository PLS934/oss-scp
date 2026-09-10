# 로컬 CSV 읽기

`@oss-scp/csv-reader`는 실행 환경의 로컬 파일을 읽어 문자열 객체를 행 단위로 반환한다. HTTP·DB·인증 서버 없이 실행한다. 플러그인 등록, API 다운로드, 가공 실행, DB 저장과 화면 연결은 후속 작업이다.

## 설치와 샘플 확인

저장소 루트에서 Node.js 24 LTS와 pnpm 10.34.5로 실행한다.

```sh
pnpm install --frozen-lockfile
pnpm --filter @oss-scp/csv-reader build
node --input-type=module <<'JS'
import { readCsvFile } from './packages/csv-reader/dist/index.js';
let count = 0;
for await (const row of readCsvFile('fixtures/csv/vulnerabilities.csv')) {
  if (count === 0) console.log(row);
  count++;
}
console.log({ count }); // 53
JS
pnpm --filter @oss-scp/csv-reader test
```

실제 파일은 `readCsvFile('/absolute/path/input.csv')`로 지정한다. 상대 경로는 실행 프로세스의 현재 디렉터리 기준이다. 실행 계정의 파일 읽기 권한이 필요하다. 일반 파일만 지원하며 원천 파일을 수정하지 않는다.

## API와 형식

- `readCsvFile(path, options?)`: 로컬 파일을 열고 순회 완료 후 변경 여부를 검사한다.
- `parseCsv(readable, options?)`: Node.js 바이트 Readable을 동일 파서로 처리한다. 전달한 스트림은 함수가 소유하며 성공·오류·조기 중단 시 닫는다. 후속 다운로드 기능에서 재사용할 수 있으나 현재 HTTP 클라이언트는 제공하지 않는다.
- 반환값은 `AsyncGenerator<Record<string, string>>`다. `for await`로 한 행씩 소비한다. 전체 결과를 배열에 모으는 것은 호출자의 선택이며 대량 수집에서는 피한다.

UTF-8(선택 BOM), 쉼표, 큰따옴표 인용과 `""` escape, LF·CRLF·CR을 지원한다. 첫 비어 있지 않은 행이 헤더다. 빈 줄을 건너뛰며 빈 파일은 형식 오류, 헤더만 있는 파일은 0행이다. 빈 헤더·공백만 있는 헤더·중복 헤더·열 수 불일치·잘못된 인용·잘못된 UTF-8은 오류다. 인용 안의 쉼표·줄바꿈은 값으로 유지한다.

헤더와 값의 공백, 빈 필드, `10.0`, `0.10` 등의 문자열을 보존한다. 다른 인코딩·구분자 자동 감지와 숫자·날짜 변환은 제공하지 않는다. 반환값은 원천 행이며 후속 가공·검증을 거치기 전 업무 저장 데이터가 아니다.

| 옵션 | 기본값 | 의미 |
| --- | --- | --- |
| `maxBytes` | 1,073,741,824 (1 GiB) | 입력 전체의 바이트 한도 |
| `maxRecordSize` | 1,048,576 | csv-parse의 단일 레코드·필드 버퍼 제한 |

옵션은 양의 안전한 정수여야 한다. `maxRecordSize`는 프로세스 메모리 상한이 아니다. 한글 등 문자 인코딩과 파서 내부 표현의 영향을 받는다. [csv-parse 제한 설명](https://csv.js.org/parse/options/max_record_size/)을 참고한다. 로컬 파일은 16 KiB씩 읽으며 소비가 느리면 선행 읽기도 제한한다. 직접 스트림을 전달할 때는 호출자도 거대한 청크를 미리 생성하지 않아야 한다.

## 오류와 완료

`CsvReadError.code`로 다음을 구분한다. 오류 메시지에는 원천 행·파일 경로·원본 시스템 오류를 포함하지 않는다.

| 코드 | 의미 |
| --- | --- |
| `FILE_NOT_FOUND` | 시작 시 파일 없음 |
| `FILE_ACCESS` | 파일 열기·읽기 실패 또는 일반 파일이 아님 |
| `FILE_CHANGED` | 완료 시 파일 변경·교체·삭제 또는 읽은 크기 불일치 |
| `CSV_FORMAT` | 헤더·CSV·UTF-8 형식 오류 |
| `CSV_LIMIT` | 입력 또는 레코드 한도 초과 |
| `CSV_OPTIONS` | 잘못된 제한 옵션 |

일부 행을 받은 뒤에도 오류가 날 수 있다. **끝까지 오류 없이 순회한 경우에만 전체 읽기 성공**으로 취급한다. `break`는 중단이며 완료 검증을 의미하지 않는다. 재시도는 파일 처음부터 시작하고 checkpoint는 제공하지 않는다. 중복 제거·업무 키 검증·저장·자산 부재 판정은 수행하지 않는다.

읽는 동안 변경하지 않는 완성된 파일을 사용한다. 시작·종료의 inode·device·크기·mtime·ctime과 실제 읽은 바이트를 비교하지만 파일시스템 스냅샷이나 변경 은폐 탐지를 보장하지 않는다.

## 검증 범위

Vitest로 샘플 53행·6필드, 1바이트 UTF-8·인용 경계, 파일·파싱 오류, 접근 권한, 변경·교체, 한도, 조기 종료·재읽기를 확인한다. 생성형 10,000행 혼합 입력의 순서·건수와 100,000행 입력의 첫 행 소비 후 제한된 선행 읽기·자원 해제를 검사한다. 시간·RSS의 운영 규모 보장은 포함하지 않는다. root 실행에서는 실제 파일 권한 거부 테스트를 건너뛴다.

기존 GitHub Actions의 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`가 신규 workspace 패키지를 포함한다. Docker 개발 환경의 세 서비스에는 신규 패키지 전용 node_modules 볼륨을 각각 구성한다. `pnpm test:docker:workspace`로 누락·공유를 검증한다.
