# 작성 계약

## 기준과 버전

이 스킬과 대상 플랫폼을 같은 Git ref 또는 릴리스로 맞춘다. 템플릿은 출발점이고 최종 판정은 대상 플랫폼의 `plugin-config` 검증기가 한다. 스키마를 별도로 복사하거나 확장하지 않는다. 개발 시 규칙 원본은 해당 ref의 `packages/plugin-config/schemas`, `packages/plugin-sdk/src/index.ts`, `docs/plugin-development.md`다.

설치한 ref의 GitHub 소스에서 위 파일을 확인한다. 최신 `main` 문서와 과거 이미지를 섞지 않는다. 스킬의 `metadata.source.json`이 있으면 설치 ref와 commit을 먼저 읽는다.

## Source 선택

| CLI 값 | 실제 입력 확인 | 수정할 설정 |
| --- | --- | --- |
| `json-single` | 한 응답으로 목록 전체 제공 | `path`, `itemsPath` |
| `json-offset` | offset/limit와 전체 건수 제공 | `path`, `itemsPath`, pagination 파라미터와 `totalPath` |
| `csv-file` | 설정 루트 안의 CSV 파일 | 루트 기준 상대 `path`, `batchSize` |
| `csv-http` | GET으로 CSV 다운로드 | Connection, `path`, `batchSize`, `limits` |

HTTP Connection의 `baseUrl`은 예제 `http://127.0.0.1:3001`이다. 실제 실행 위치에서 도달 가능한 주소로 수정한다. 컨테이너의 localhost는 호스트 PC가 아니다. HTTP JSON 예제는 `fixtures/items.json`, CSV 예제는 `fixtures/items.csv`에 있다. HTTP 서버는 자동 시작되지 않는다.

## 데이터와 화면

- 예제 `item`은 문자열 `id`와 `name`, 유일키 `id`를 가진다. 실제 원천에서 안정적이고 비어 있지 않은 식별 기준을 확인한다. 누락된 ID를 `String(undefined)` 같은 임의 값으로 만들지 않는다.
- 모든 필드와 중첩 필드에 label을 두고 실제 transform 결과 타입과 맞춘다. CSV 숫자·boolean·datetime은 명시적으로 변환한다.
- 목록 columns는 최상위 scalar 필드를 참조한다. 상세 sections는 최상위 필드를 참조하며 필드를 중복 배치하지 않는다.
- 메뉴는 dataType을 참조한다. ID와 메뉴 경로는 전체 운영 설정 안에서 충돌하지 않아야 한다.
- transform은 레코드마다 호출되어 records와 선택적 relations를 반환한다. 원천 주소·인증 정보를 transform에 넣지 않는다.
- 유일키 중복·필수값 누락·출력 타입 오류는 공통 엔진의 실패 정책을 따른다. 담당자 지정 정보는 플랫폼이 관리하며 원천 필드로 덮어쓰지 않는다.

## 첫 수집

생성과 preflight만으로는 연동 성공이 아니다. 테스트용 DB와 대상 버전 실행 환경을 준비한 뒤 해당 ref의 `docs/manual-collection-cli.md`, `docs/platform-db.md`, `docs/offline-bundle.md`를 따른다.

릴리스 Compose에 기존 설정과 합칠 때는 ID·경로 충돌을 확인하고 전체 설정을 다시 검증한다. 외부 설정 루트에 완성한 폴더를 연결한 뒤 등록된 ID 하나를 테스트 환경에서 수집한다.

```sh
docker compose run --rm api node node_modules/@oss-scp/collector-cli/dist/process.js <플러그인-ID>
```

이 명령은 실제 DB에 저장한다. 원천 접속·DB 준비·설정 mount를 확인한 테스트 환경에서 실행한다. 수집 결과와 메뉴의 목록·상세를 확인해야 첫 연동 확인이 끝난다. 초기 설정 스킬은 운영 DB를 자동 준비하거나 실행 중 서비스를 재시작하지 않는다.
