## Context

현재 API는 시작 시 검증된 `CollectionDefinition`, 공개 플러그인 요약과 메뉴를 immutable runtime registry에 보관한다. 홈은 플러그인 요약과 메뉴만 조회하며 source 원문, 전체 데이터 정의, transform 코드는 브라우저에 제공하지 않는다. transform 실행 경로는 검증된 JavaScript 절대 경로이지만 개발 트리에는 대체로 플러그인 루트의 같은 basename TypeScript 원본과 `dist` 아래 JavaScript가 함께 존재하고, 배포 환경에는 JavaScript만 존재할 수 있다.

이 변경은 API·공통 설정 계약·웹을 함께 수정하고 파일 읽기 경계를 다루므로 별도 설계가 필요하다. 요구 동작은 `specs/plugin-config-detail/spec.md`와 `specs/plugin-home/spec.md`를 따른다.

## Goals / Non-Goals

**Goals:**

- 이미 검증되어 메모리에 로드된 정의를 브라우저용 읽기 전용 DTO로 투영한다.
- source 종류별 차이는 보존하되 인증 값과 내부 절대 경로는 구조적으로 포함하지 않는다.
- transform 코드는 서버가 결정한 등록 범위에서만 제한적으로 읽고 원본·배포본·실패를 명시한다.
- 기존 홈·메뉴·레코드 조회 계약을 깨지 않고 직접 URL 접근과 실패 상태를 지원한다.

**Non-Goals:**

- 구성 파일 원문이나 connection 원문을 범용 JSON viewer로 제공하지 않는다.
- 플러그인 생성·수정·삭제·재적용 또는 수집 실행 API를 추가하지 않는다.
- TypeScript source map을 해석하거나 배포 JavaScript에서 원본을 복원하지 않는다.
- 별도 권한 모델이 없는 현재 범위에서 새 인증·인가 체계를 도입하지 않는다.

## Decisions

### 1. runtime registry에 브라우저용 상세 투영을 보관한다

`plugin-config` 로더가 검증을 완료할 때 source 종류별 discriminated union인 `ClientPluginDetail`을 만든다. API controller는 이 DTO를 ID로 찾아 반환하며, 요청 때 디스크의 plugin/source/connection JSON을 다시 파싱하지 않는다. 이렇게 하면 현재 로드된 설정과 화면의 불일치를 피하고 조회가 registry나 실행 상태를 변경하지 않는다는 성질을 유지한다.

대안으로 요청 때 설정 파일을 다시 읽는 방법은 파일 변경이 런타임과 다른 결과를 만들고 임의 경로·secret 정제 경계를 넓히므로 사용하지 않는다. raw 객체를 재귀적으로 redaction하는 방법도 새 secret 필드 누락 위험이 있어 사용하지 않고, 공개 필드를 source 종류별로 명시적으로 조립한다.

### 2. 상세 API는 `GET /api/v1/plugins/:id` 하나로 제공한다

기본 정보, source, 데이터, 화면과 transform 상태를 한 응답에 제공한다. 플러그인 ID만 path parameter로 받고 파일 경로나 섹션 선택 parameter는 받지 않는다. 없는 ID는 일관된 `PLUGIN_NOT_FOUND` 404를 반환한다. 목록 endpoint와 기존 로컬 CSV 다운로드 endpoint는 그대로 유지한다.

transform 코드가 실패해도 나머지 구성은 유효하므로 전체 요청을 실패시키지 않고 `{ status: 'unavailable', reason }`을 포함한다. 이는 구성 조회 실패와 코드 파일 조회 실패를 UI에서 구분하게 한다.

대안인 섹션별 여러 endpoint는 화면 로딩과 오류 조합을 불필요하게 늘리므로 채택하지 않는다.

### 3. transform 후보는 로더가 확정하고 API는 그 후보만 읽는다

로더는 등록된 JavaScript `transformPath`와 플러그인 디렉터리를 알고 있으므로, 배포 파일이 `<plugin>/dist/<name>.js`이면 `<plugin>/<name>.ts`를 대응 원본 후보로 기록한다. 후보가 일반 파일로 존재하면 TypeScript를 우선하고, 없으면 등록 JavaScript를 사용한다. 두 경로 모두 검증된 plugin root 내부에 있어야 하며 API는 realpath 재확인, 일반 파일 확인, no-follow open과 open 후 inode 확인을 거쳐 제한된 크기만 UTF-8로 읽는다. 응답에는 경로 대신 `kind`만 포함한다.

원본 후보를 브라우저가 지정하게 하거나 source map을 해석하는 방법은 공격 표면과 구현 복잡도를 늘리므로 제외한다. 원본 후보가 안전하지 않거나 읽기 실패이면 임의 fallback 탐색을 하지 않고 등록 JavaScript만 검증한 뒤, 그것도 실패하면 공개용 오류 이유를 반환한다.

### 4. source별 공개 DTO는 기능적 설정만 보존한다

- HTTP JSON: 정제된 base URL, method/path/format, response path, metadata path, pagination, limits
- 로컬 CSV: basename, batch size, limits
- HTTP CSV: 정제된 base URL, method/path/format, batch size, limits
- PostgreSQL live: host/port/database/ssl, persistence, list/detail query, external key, query field map, batch/cache/limits

PostgreSQL user와 password reference는 인증 정보로 제외한다. HTTP base URL에는 userinfo·query·fragment를 허용하지 않는다. 내부 절대 경로는 어떤 variant에도 넣지 않는다. 데이터와 view는 검증된 runtime plugin 정의를 구조화 복제해 전달한다.

### 5. 홈 상세 화살표와 전용 상세 route를 추가한다

홈의 플러그인 제목 옆 화살표는 `/plugins/:pluginId`로 이동하고, 제목 아래의 검증된 메뉴 경로 텍스트는 기존 레코드 메뉴로 이동한다. 비활성 또는 조회 메뉴가 없는 플러그인도 설정 상세 화살표는 유지한다. 새 `plugin-details` client 모듈이 응답 구조를 런타임 검증하며, `PluginConfigDetail`은 섹션별 semantic markup과 재귀 필드 tree를 렌더링한다. route parameter가 바뀌면 이전 상태를 지우고 새 요청을 시작하며 unmount 또는 재탐색 시 AbortController로 취소한다.

코드는 실행·하이라이트하지 않고 `<pre><code>`에 text node로 표시해 스크립트 삽입을 방지한다. source별 label은 UI에 명시하고 JSON dump에 의존하지 않는다.

## Risks / Trade-offs

- [큰 transform 코드가 응답과 DOM을 키울 수 있음] → 서버에 명시적 코드 크기 한도를 두고 초과 시 `unavailable`로 처리한다.
- [TypeScript 원본 발견 규칙이 비표준 플러그인의 원본을 찾지 못할 수 있음] → 임의 탐색 대신 안전한 단일 관례만 지원하고 JavaScript fallback을 보장한다. 추후 명시적 source path 계약이 필요하면 별도 schema 변경으로 다룬다.
- [SQL·HTTP 경로가 운영 구조를 보여줄 수 있음] → 이 화면의 목적상 기능적 구성에는 포함하되 인증 정보와 secret 참조는 제외하고 향후 권한 기능 도입 시 운영자 권한으로 제한할 수 있는 API 경계를 유지한다.
- [DTO 추가가 plugin-config 로더를 복잡하게 만들 수 있음] → source variant별 작은 projector와 계약 테스트로 분리하고 실행용 정의는 변경하지 않는다.

## Migration Plan

새 API와 route를 기존 endpoint와 병행 추가하므로 데이터·schema migration은 없다. 서버와 웹을 함께 배포하며 rollback은 이전 이미지로 되돌리는 것으로 충분하다. 외부 플러그인 설정 형식은 변경하지 않는다.
