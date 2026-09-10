## Context

현재 저장소에는 sample1을 `GET /sample1?offset=...&limit=...`으로 제공하는 mock API가 별도 브랜치에 구현되어 있지만, 플러그인·source·Connection의 실행 가능한 계약과 로더는 없다. 개발 플랜의 `plugin.json`, `source.json`, Connection 예시는 초안이므로 #15의 HTTP 수집 함수를 만들기 전에 sample1에 필요한 최소 부분을 확정한다.

현재 작업 트리에는 사용자의 문서·fixture 변경이 있으며 이 변경은 해당 파일을 덮어쓰지 않는다. 구현은 #14가 포함된 기준 브랜치에서 수행해야 한다.

## Goals / Non-Goals

**Goals:**

- sample1의 JSON offset 수집 정보를 Git 관리 파일로 표현한다.
- 구조 검증과 파일·Connection 참조 검증을 한 명령으로 수행한다.
- 검증 결과를 #15 수집기가 프레임워크 종속 없이 사용할 내부 정의로 만든다.
- sample2와 CSV를 별도 플러그인으로 추가할 때 기존 책임 경계를 재사용한다.

**Non-Goals:**

- 실제 HTTP 요청, 응답 스트리밍, 가공, DB 저장과 checkpoint를 실행하지 않는다.
- single JSON과 CSV source를 유효한 지원값으로 미리 선언하지 않는다.
- 데이터 필드·유일키·메뉴·화면을 최소 `plugin.json`에 포함하지 않는다.
- 운영 중 동적 설치나 웹 설정 편집을 제공하지 않는다.

## Decisions

### 플러그인, source, Connection을 세 리소스로 분리한다

`plugin.json`은 플러그인 자체의 식별·버전과 `./source.json` 참조만 가진다. `source.json`은 `connectionRef`, 상대 `path`, `method`, `format`, 응답 경로와 pagination을 가진다. Connection은 ID, connector 종류와 `baseUrl`을 가진다.

API 정보를 모두 `plugin.json`에 넣는 대안은 파일 수가 적지만 데이터·화면 정의와 환경별 수집 설정의 책임이 섞인다. source에 base URL까지 넣는 대안은 간단하지만 로컬·Docker·운영 환경 전환 때 플러그인을 수정하게 된다. 세 리소스 분리는 개발 플랜의 Git 원본과 환경 설정 경계를 유지한다.

### 첫 공개 계약은 실제 지원하는 JSON offset만 허용한다

source는 구분 가능한 `format: "json"`과 `pagination.type: "offset"` 구조를 사용하되, 이번 버전의 schema enum에는 구현된 값만 둔다. sample2의 `single`과 CSV 다운로드는 후속 변경에서 schema와 해석기를 함께 확장한다.

세 방식을 미리 enum에 넣는 대안은 미래 형태를 보여주지만 검증 성공과 실행 가능성 사이에 차이를 만든다. 세 방식을 한 작업에서 모두 구현하는 대안은 첫 계약의 범위를 넓히고 JSON pagination과 CSV 스트리밍 문제를 섞는다.

### JSON Schema 검증 뒤 교차 참조를 검증한다

각 리소스는 JSON Schema 2020-12로 타입, 필수 값, 열거값, 추가 속성과 문자열 제약을 확인한다. 구조 검증이 끝난 뒤 로더가 source 상대 경로의 플러그인 디렉터리 이탈, 파일 존재 여부, Connection ID 존재 여부와 중복 ID를 확인한다. 오류에는 파일과 JSON 경로를 포함하되 설정 원문이나 비밀 값을 포함하지 않는다.

Schema만 사용하는 대안은 파일·ID 참조를 확인할 수 없다. TypeScript 검증만 사용하는 대안은 외부 작성자가 사용할 공개 schema를 제공하지 못하므로 두 계층을 함께 둔다.

### 내부 수집 정의는 검증된 값만 포함한다

로더 출력은 plugin ID/version, Connection ID·base URL, HTTP path/method, itemsPath/totalPath와 offset 설정을 포함하는 불변 데이터 구조다. base URL과 상대 path의 실제 결합 및 네트워크 요청은 #15가 담당한다. 이 경계로 설정 로더가 NestJS 요청 객체나 DB 세션에 의존하지 않게 한다.

### 샘플은 하나의 수집 동작만 대표한다

`plugins/sample1-offset-api/`가 `plugin.json`과 `source.json`을 가지며 mock Connection은 `connections/mock-api.json`에 둔다. 로컬 실행과 Docker 내부 실행의 base URL이 다르므로 Connection 파일 선택 또는 실행 시 허용된 환경 치환 방식 중 하나를 구현 단계에서 택하지 않고, 이번 계약에서는 검증 fixture의 명시적인 로컬 URL을 사용한다. 실제 환경 전환 형식은 Connection 상세 계약에서 별도로 확정한다.

## Risks / Trade-offs

- [최소 plugin 계약이 후속 데이터 계약과 충돌할 수 있음] → `apiVersion`으로 계약을 식별하고 후속 필드는 호환 가능한 선택 추가로 설계하며, 파괴적 변경은 새 버전으로 다룬다.
- [sample1만으로 일반성을 과대평가할 수 있음] → #15 이전에는 JSON offset만 지원한다고 문서화하고, sample2와 CSV 추가 시 본체 변경 범위를 별도로 검증한다.
- [상대 경로를 통한 디렉터리 이탈] → 정규화한 실제 경로가 플러그인 루트 안인지 확인하고 절대 경로를 거부한다.
- [Connection에 비밀정보가 들어갈 수 있음] → 이번 HTTP mock Connection은 비밀 속성을 허용하지 않고, 후속 인증은 `secretRef` 계약으로 추가한다.
- [로컬과 Docker base URL 차이] → 샘플 검증은 네트워크 호출 없이 명시된 fixture를 해석하며, #15에서 실행 환경별 Connection 선택을 확정한다.

## Migration Plan

신규 기능이므로 기존 데이터 migration은 없다. 먼저 schema·로더·sample1 설정을 추가하고 CI 검증을 연결한다. 롤백은 등록된 샘플 플러그인과 검증 명령을 제거하는 것으로 가능하며 기존 API·웹 실행에는 영향을 주지 않는다.
