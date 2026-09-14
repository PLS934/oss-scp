## Why

보안팀과 개발팀은 많은 자산·취약점 목록에서 점수, 이름, 관측 시각처럼 업무에 맞는 기준으로 결과 순서를 바꿀 필요가 있다. 현재 목록은 저장 시각 기준 고정 정렬만 제공하므로 플러그인이 허용한 필드에 한해 예측 가능한 단일 정렬을 제공한다.

## What Changes

- 플러그인의 최상위 scalar 목록 필드에 선택적 `sortable: true` 선언을 추가하고 런타임 메뉴에는 정렬 가능한 key/label/type만 공개한다.
- `GET /api/v1/records`에 허용된 단일 정렬 필드와 방향을 전달하고, PostgreSQL·MySQL이 필터 이후 페이지 분할 전에 같은 타입별 정렬을 수행한다.
- 전체 건수 옆에 정렬 가능 필드 뱃지를 표시한다. 같은 뱃지는 오름차순, 내림차순, 해제 순으로 순환한다.
- 다른 뱃지를 누르면 기존 정렬을 해제하고 새 필드의 오름차순 정렬만 적용한다. 정렬 변경은 첫 페이지부터 즉시 조회한다.
- null과 잘못된 저장값, 같은 정렬값의 순서를 양쪽 DB에서 결정적으로 맞추고 미허용 정렬 요청은 DB 접근 전에 거부한다.
- 제외 범위: 다중 정렬, 사용자별 정렬 저장, 중첩 object·array 정렬, locale별 자연어 정렬, 정렬 전용 DB index 자동 생성.

## Capabilities

### New Capabilities

- `record-sorting`: 플러그인 선언 기반 단일 필드 정렬, 정렬 뱃지 상호작용과 검색·필터·번호형 페이지 결합을 정의한다.

### Modified Capabilities

- `plugin-source-contract`: scalar 목록 필드의 정렬 가능 선언을 추가한다.
- `plugin-menu-routing`: 클라이언트 메뉴에 최소 정렬 메타데이터를 제공한다.
- `platform-record-query`: 양쪽 DB의 고정 정렬 계약을 허용된 사용자 정렬 계약으로 확장한다.
- `record-query-api`: 목록 API가 단일 정렬 파라미터를 검증하고 전달한다.
- `record-query-client`: 웹 클라이언트가 정렬 파라미터를 직렬화하고 응답 계약을 유지한다.

## Impact

플러그인 설정 타입·검증과 샘플 플러그인, 런타임 메뉴 payload, records API·공통 조회 모델·PostgreSQL/MySQL SQL, React 목록 상태·정렬 뱃지, 브라우저 및 실제 DB 통합 테스트, 플러그인·클라이언트·서버 문서가 변경된다. 기존 `sortable` 미선언 플러그인과 정렬 파라미터 없는 API 호출은 현재 고정 정렬을 유지하며 저장 schema migration과 새 의존성은 없다.
