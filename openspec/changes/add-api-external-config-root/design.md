## Context

동기는 [proposal.md](proposal.md)를 따른다. 최신 `main`의 API bootstrap은 `preflightConfiguration`을 DB 연결과 listen 전에 실행한다. 성공 결과는 `definitions`와 정렬된 `menus`를 포함하지만 `configuration.menus`만 `AppModule.register`에 전달되고, 실패 결과의 구조화된 `ConfigurationIssue[]`는 일반 오류 한 줄로 치환된다.

외부 설정 루트, JSON Schema·경로·중복·참조 검증, transform 모듈 사전 로딩, Compose 읽기 전용 주입과 재기동 배포 절차는 이미 구현되었다. 이 변경은 해당 기반을 수정하지 않고 API 내부 snapshot과 오류 표현을 완성한다.

## Goals / Non-Goals

**Goals:**

- 한 번의 preflight 성공 결과를 API 프로세스 수명 동안 불변 snapshot으로 보존한다.
- 플러그인 정의가 필요한 API 소비자에 단일 runtime registry 경계를 제공한다.
- preflight의 모든 문제를 비민감하고 로그 안전한 형식으로 시작 로그에 보존한다.
- 실행 중 파일 변경 미반영과 재기동 후 반영을 자동 검증한다.

**Non-Goals:**

- 외부 설정 형식, preflight와 transform loader 재구현
- custom fetch 계약, 운영 hot reload 또는 watcher
- Compose·이미지·DB·클라이언트 API 변경
- 현재 플러그인 설정을 사용하지 않는 저장·조회 계층에 불필요한 의존성 추가

## Decisions

### preflight 성공 결과를 불변 runtime registry로 감싼다

API에 `PluginRuntimeRegistry` interface와 injection token, 생성 함수를 둔다. 생성 함수는 성공 결과의 `definitions`와 `menus`를 `structuredClone`한 뒤 재귀적으로 동결한다. registry는 전체 수집 정의, 정렬된 메뉴와 plugin ID별 단일 수집 정의 조회를 제공하며 내부 `Map`을 노출하지 않는다.

현재 manifest는 plugin마다 source 하나만 허용하고 loader는 plugin ID 중복을 거부하므로 ID 조회도 하나의 정의 또는 `undefined`를 반환한다. 여러 source를 미리 가정한 배열 API는 현재 계약을 넘어가므로 추가하지 않는다.

TypeScript `readonly`만 사용하는 대안은 런타임 변이를 막지 못한다. 매 조회마다 복제하는 대안은 안전하지만 불필요한 비용과 서로 다른 snapshot 정체성을 만든다. 기동 시 한 번 복제·동결하는 방식이 재기동 기반 적용 계약에 맞는다.

### NestJS에는 registry 하나만 주입한다

bootstrap은 preflight 성공 직후 registry를 한 번 생성해 `AppModule.register`에 전달한다. 메뉴 controller는 별도 `PLUGIN_MENUS` 배열 token 대신 registry에서 메뉴를 읽는다. 이후 실제로 플러그인 수집 정의가 필요한 소비자가 생길 때 같은 token을 사용하며, 현재 필요하지 않은 저장·조회 계층에는 주입하지 않는다.

기존 메뉴 배열과 registry를 동시에 제공하는 대안은 두 개의 상태 경계를 남긴다. 공통 loader가 NestJS registry를 직접 생성하는 대안은 프레임워크 비종속 설정 패키지의 책임을 넓히므로 사용하지 않는다.

### 허용 필드만 사용하는 시작 오류 formatter를 둔다

preflight 실패 시 각 `ConfigurationIssue`의 `file`, `path`, `message`를 한 줄씩 직렬화한다. 기존 loader가 root 기준 상대 경로를 생성하지만 formatter도 절대 `file`을 거부하거나 basename 수준으로 축소한다. CR, LF와 그 밖의 제어문자는 이스케이프해 한 issue가 새 로그 항목을 만들지 못하게 한다. 원본 exception이나 stack은 formatter에 전달하지 않는다.

모든 issue를 출력해 운영자가 한 번의 기동 실패로 함께 수정할 수 있게 한다. 첫 오류만 출력하는 대안은 반복 배포를 요구하고, JSON 전체 직렬화는 향후 issue 구조가 확장될 때 정보 노출 범위를 넓힐 수 있어 사용하지 않는다.

### 프로세스 테스트로 snapshot 수명을 고정한다

단위 테스트는 생성 입력과 registry 반환값의 변경 시도가 이후 조회에 영향을 주지 않는지, plugin ID 조회와 메뉴 정렬이 유지되는지 확인한다. Nest 테스트는 메뉴 controller와 다른 테스트 소비자가 동일 registry 인스턴스를 받는지 확인한다.

프로세스 테스트는 임시 외부 설정 revision으로 API를 시작하고 메뉴 파일을 수정한 뒤 기존 프로세스 응답이 유지되는지 확인한다. 프로세스를 종료하고 새 설정으로 재기동하면 변경된 메뉴가 반영되는지 확인한다. 기존 DB fixture를 재사용하며 reload endpoint나 watcher를 추가하지 않는다.

## Risks / Trade-offs

- [깊은 동결 대상에 함수나 특수 객체가 추가될 수 있음] → 현재 JSON 기반 수집·메뉴 정의만 snapshot 대상으로 제한하고 transform 함수 로딩·실행은 기존 collection-engine에 둔다.
- [오류 메시지에 공격자가 넣은 제어문자가 포함될 수 있음] → 허용 필드만 직렬화하고 모든 C0/C1 제어문자를 이스케이프한다.
- [기존 메뉴 token 제거가 테스트와 controller에 영향을 줌] → 저장소 전체 참조를 검색해 같은 변경에서 단일 registry token으로 전환한다.
- [프로세스 재기동 테스트가 느려질 수 있음] → 기존 process test의 DB lifecycle과 free-port 도우미를 재사용하고 필요한 한 시나리오만 추가한다.

## Migration Plan

1. runtime registry와 불변성 단위 테스트를 추가한다.
2. AppModule과 메뉴 controller를 단일 registry provider로 전환한다.
3. bootstrap에서 registry를 생성하고 안전한 preflight 오류 formatter를 연결한다.
4. 설정 오류 및 실행 중 변경·재기동 회귀 테스트를 추가한다.
5. 운영 문서를 보완하고 로컬·Docker CI 검증을 실행한다.

롤백은 registry provider와 메뉴 소비 변경을 함께 되돌려 기존 메뉴 배열 주입으로 복귀한다. 외부 설정 형식, 환경변수, Compose와 DB는 바뀌지 않으므로 설정 또는 데이터 migration은 필요하지 않다.
