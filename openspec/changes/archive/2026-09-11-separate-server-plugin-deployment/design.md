## Context

현재 `validateRepository(root)`는 한 저장소 루트 아래의 `plugins/`, `connections/`와 로컬 CSV 경로를 함께 해석한다. 수동 CLI는 현재 작업 디렉터리에서 저장소 루트를 위로 탐색하고, API 이미지는 플러그인·Connection·fixture와 컴파일된 transform을 `/app`에 복사한다. 클라이언트 메뉴는 빌드 전에 생성된 TypeScript 파일을 import한다. 이 결합 때문에 플랫폼 이미지와 운영자 플러그인을 독립적으로 교체할 수 없다.

#52는 메뉴를 `pluginId`, `sourceId`, `dataType` 조회 범위로 정규화하는 계약을 제공했다. 이 change는 메뉴의 의미를 바꾸지 않고 산출물 공급 시점을 빌드에서 API 기동으로 이동한다. 동기는 `proposal.md`를 따른다.

## Goals / Non-Goals

**Goals:**

- 모든 서버 소비자가 하나의 명시적 설정 루트와 동일한 검증 결과를 사용한다.
- 외부 설정의 경로·모듈·버전 오류를 네트워크나 DB 작업 전에 발견한다.
- API 이미지가 운영자 플러그인 파일 없이도 동일한 이미지로 배포된다.
- 클라이언트가 서버가 검증한 메뉴를 사용해 플러그인 revision 교체를 반영한다.
- 배포 전 검증과 롤백에 이미지 digest와 플러그인 Git SHA를 사용한다.

**Non-Goals:**

- 실행 중 registry hot reload 또는 무중단 플러그인 교체
- npm install, TypeScript transpile, 원격 모듈 다운로드
- 신뢰하지 않는 플러그인 코드를 sandbox로 격리
- 사용자 정의 React 번들의 외부 로딩
- 플러그인 revision에 따른 DB 데이터 자동 migration 또는 rollback

## Decisions

### 1. 하나의 명시적 설정 루트를 사용한다

API, 수동 수집 CLI와 설정 검증 CLI는 `OSS_SCP_CONFIG_ROOT`를 공통 입력으로 사용한다. 로컬 개발 명령은 명시적 `--root`로 저장소 루트를 전달할 수 있지만 배포 프로세스는 현재 작업 디렉터리 탐색으로 대체하지 않는다. 설정 루트는 기존 레이아웃인 `plugins/registry.json`, `connections/registry.json`을 유지해 schema churn을 줄인다. 로컬 CSV 경로도 이 루트 안에서만 해석한다.

플러그인과 Connection에 별도 루트를 주는 대안은 독립 관리가 쉽지만 상호 참조 검증과 revision 원자성이 약해진다. MVP에서는 하나의 운영자 Git revision에 두 registry를 함께 고정한다.

### 2. lexical 경계와 realpath 경계를 모두 검증한다

기존 상대 경로 검사는 `resolve` 기반 lexical 이탈만 막는다. 외부 코드 실행 경계에서는 설정 루트와 읽거나 실행할 기존 파일의 `realpath`를 비교해 심볼릭 링크를 통한 이탈도 거부한다. registry entry는 플러그인 루트 안, source와 transform은 해당 플러그인 디렉터리 안에 있어야 한다. 로컬 CSV는 전체 설정 루트 안에 있어야 한다.

심볼릭 링크를 전부 금지하는 대안은 단순하지만 Kubernetes/secret volume 구현과 개발 환경의 안전한 내부 링크까지 막을 수 있다. 실제 대상이 루트 안인 링크만 허용한다.

### 3. 검증과 런타임 로딩을 하나의 preflight 결과로 묶는다

`plugin-config`는 선언 검증 뒤 각 transform JavaScript 모듈을 import하여 요구된 `transform` export를 확인하는 비동기 preflight API를 제공한다. API는 preflight를 DB 연결과 `listen` 전에 수행하고 결과를 메모리에 고정한다. 수동 CLI도 같은 preflight 결과에서 플러그인을 선택한다. import 실패의 원문과 stack은 외부 오류로 전달하지 않고 plugin ID·안정적 오류 코드만 남긴다.

파일 존재만 확인하는 대안은 빠르지만 잘못된 export와 누락 의존성을 실제 수집까지 미룬다. 모든 transform을 import하면 플러그인 코드의 top-level 부작용이 기동 시 실행되므로, 플러그인은 운영자가 검토·승인한 신뢰 코드라는 기존 경계를 문서화한다.

### 4. 메뉴는 API의 읽기 전용 endpoint로 제공한다

API는 preflight 결과의 비민감 `menus` 배열을 읽기 전용 endpoint에서 반환한다. React 앱은 시작 시 이를 요청하고 성공한 결과로 route를 구성한다. 실패 시 빌드된 registry나 localStorage로 fallback하지 않는다. 직접 URL 접근은 메뉴 로드가 끝난 뒤 기존 route matching을 적용한다.

웹 이미지 시작 시 JSON 파일을 생성·공유하는 대안은 API와 웹 컨테이너 사이 공유 볼륨 또는 별도 배포 산출물을 요구한다. API endpoint가 현재 same-origin proxy와 #52의 메뉴 타입을 그대로 재사용하므로 더 작다.

### 5. API 이미지는 실행 코드만 포함한다

API Dockerfile은 저장소 plugin package manifest, plugin·Connection·fixture와 transform 빌드 단계를 제거한다. 런타임에는 CLI와 검증 schema를 포함하되 운영 설정은 `/config` 읽기 전용 mount로만 제공한다. Compose의 API 서비스는 `OSS_SCP_CONFIG_ROOT=/config`를 설정하고 호스트의 명시적 `PLUGIN_CONFIG_PATH`를 `/config:ro`로 마운트한다. 상대 또는 비어 있는 host path가 예상치 않게 생성되지 않도록 Compose 정적 검사와 문서의 사전 디렉터리 확인 절차를 둔다.

샘플을 별도 공식 plugin 이미지로 제공하는 대안은 배포 단위를 늘린다. 현재는 저장소의 샘플을 운영자 설정 디렉터리 예제로 복사·빌드하는 문서 경로만 제공한다.

### 6. 호환 조합은 동일 이미지의 검증 명령으로 판정한다

배포 전 대상 API image digest로 컨테이너를 일회 실행하여 `/config`의 preflight 명령을 수행한다. 배포 기록에는 image digest와 plugin Git SHA를 함께 남긴다. schema/API 호환성은 런타임이 지원하는 고정 버전과 전체 모듈 preflight로 판정한다. DB migration은 별도 명령이며 플러그인 교체가 자동 실행하거나 역행시키지 않는다.

별도 호환성 matrix 파일을 도입하는 대안은 아직 공개 버전 조합이 하나뿐인 단계에서 이중 원본을 만든다. 복수 API 버전 지원이 생길 때 명시적 범위 선언을 추가한다.

### 7. 개발 플랜과 기존 샘플 흐름을 함께 이관한다

개발 플랜은 #52 다음에 이 배포 분리를 두고 #53·#54 renderer가 외부 registry 경계를 사용하도록 갱신한다. 저장소 샘플의 TypeScript는 개발 입력으로 유지하되 운영 fixture는 빌드된 JavaScript와 선언 파일로 구성한다. 기존 단위 테스트는 임시 외부 설정 루트를 사용하도록 바꾸고, 외부 자격증명 없는 샘플 통합 검증은 유지한다.

## Risks / Trade-offs

- [플러그인 top-level 코드가 preflight에서 실행됨] → 승인된 Git revision만 사용하고 읽기 전용 mount, 비루트 컨테이너, 비민감 오류 경계를 유지한다.
- [API가 메뉴를 제공하면서 클라이언트 초기 표시가 네트워크에 의존함] → 명시적 loading/error 상태와 동일 출처 endpoint를 사용하며 실패한 registry로 화면을 구성하지 않는다.
- [단일 설정 루트가 Connection과 플러그인의 독립 revision을 제한함] → MVP에서는 검증 가능한 원자적 조합을 우선하고 필요 시 상위 저장소/submodule로 revision을 고정한다.
- [읽기 전용 mount 여부를 Node.js가 이식성 있게 증명하기 어려움] → Compose 설정을 자동 검사하고 런타임은 설정 파일에 쓰지 않는 테스트로 보완한다.
- [플러그인 변경이 저장 데이터 계약과 맞지 않을 수 있음] → 기존 API/schema 및 정의 검증으로 미지원 변경을 막고 DB migration·재가공은 별도 배포 절차로 유지한다.

## Migration Plan

1. 운영 플러그인 저장소에서 TypeScript transform을 JavaScript로 빌드하고 전체 설정 검증을 통과시킨다.
2. 대상 플랫폼 이미지 digest와 플러그인 Git SHA를 고정한다.
3. 대상 이미지의 preflight 명령으로 해당 SHA의 설정 디렉터리를 읽기 전용 mount하여 검증한다.
4. 필요한 DB migration을 별도 단계에서 실행한다.
5. API 서비스에 같은 디렉터리를 `/config:ro`로 주입하고 재기동한 뒤 메뉴·수동 수집·저장·조회 smoke test를 수행한다.
6. 실패 시 DB를 자동 역행하지 않고 이전 image digest·plugin SHA 조합으로 재기동하며, 데이터 변경이 있으면 검증된 별도 복구 절차를 따른다.
