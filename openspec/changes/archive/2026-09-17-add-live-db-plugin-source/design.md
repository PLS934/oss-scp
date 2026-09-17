## Context

현재 Connection은 HTTP만 지원하고 registry 정의는 CollectionDefinition에 묶여 있다. RecordQueryService는 입력 검증 후 플랫폼 DB로 전달하며 상세는 UUID만 받는다. 기존 transform은 레코드 분리를 허용하므로 그대로 페이지 처리 후 적용하면 건수와 조건의 의미가 달라질 수 있다. watchlist 구현은 현재 저장소에서 찾지 못했다.

사용자는 실제 운영 스키마 대신 예제를 만들고 UNION 계열 질의를 사용하는 방향을 지정했다. 이 설계의 검증 대상은 실제 PostgreSQL에 구성한 예제 데이터이며 운영 DB 검증을 주장하지 않는다.

## Goals / Non-Goals

**Goals:** SQL 투영으로 조회 가능한 공통 레코드를 만들고 기존 선언형 화면과 조건 검증을 재사용한다. 저장형 동작을 보존하고 무저장 경계를 테스트한다.

**Non-Goals:** transform 이후 전체 데이터를 메모리에서 검색·정렬하지 않는다. 플랫폼 담당자 정보를 원천 값으로 덮어쓰지 않는다. 임의 사용자 SQL 실행이나 무중단 reload는 제공하지 않는다.

## Decisions

### UNION ALL로 원천 종류를 공통 투영한다

예제에는 projects, components, sscs 세 테이블을 만든다. `listQuery`는 각 SELECT의 컬럼·타입을 동일하게 맞춘 UNION ALL을 사용한다. `entity_kind`, `external_key`, `name`, `severity`, `updated_at`을 공통으로 내보내고 없는 값은 명시적 타입의 NULL을 사용한다. external_key는 `project:<id>`, `component:<id>`, `sscs:<id>`로 구분한다. 기본적으로 하나의 공통 dataType을 쓰고 entity_kind 필터로 분류한다. 이 예제의 SSCS는 합성 fixture이며 실제 도메인 스키마를 의미하지 않는다.

UNION은 동일 행을 제거하는 비용과 의미 변화가 있으므로 UNION ALL을 권장한다. 별도 source 세 개 방식은 가능하지만 이번 예제의 통합 목록에는 사용하지 않는다. 사용자 조건·정렬·LIMIT/OFFSET은 UNION의 각 분기가 아니라 전체를 감싼 파생 테이블에 적용한다. COUNT는 같은 조건을 가진 전체 파생 테이블에 적용하며 반환 행 cap을 전체 검색 범위 cap으로 오해하지 않는다.

### 설정과 실행 경계

`SourceConfig`에 `type: db-postgres`, `persistence: none` 분기를 추가하고 registry에서 저장형과 라이브형을 판별한다. `source-loaders/db.ts`는 검증된 라이브 정의를 반환하고 수집 runner로 보내지 않는다. 실행기는 앱의 별도 라이브 조회 모듈에 둔다. 기존 플랫폼 DB adapter의 무원천 호출 계약은 유지한다.

source는 listQuery, detailQuery, batchSize(1~500), limits(rowCap 기본 500·최대 500, timeoutMs 기본 5000·최대 5000, 응답 bytes 한도), 고유 키 컬럼과 scalar queryFields 매핑을 선언한다. 페이지 크기는 기존 20·50·100·200을 유지하며 cap보다 크면 거부한다. batchSize는 드라이버 읽기 묶음 크기이며 전체 결과를 모으지 않는다. 전체 COUNT는 단일 scalar이고 상세는 최대 두 행을 읽어 중복 키를 실패로 구분한다.

Connection `connector: postgres`에 host·port·database·user·TLS 설정과 passwordRef를 둔다. passwordRef는 환경변수 이름 또는 운영자가 허용한 secret root 내 파일 참조 중 하나다. 경로 탈출·symlink 탈출·크기 초과를 거부한다. 비밀 해석은 서버 실행 시에만 수행하며 응답, 로그, revision에 비밀 값을 넣지 않는다. 인라인 password와 자격증명이 포함된 URI는 허용하지 않는다.

### SQL 검증과 자원 제한

단순 SELECT 접두사 검사 대신 PostgreSQL 문법을 해석할 수 있는 parser를 사용한다. 구현 시작 시 지원 버전·WITH/UNION AST 처리를 fixture로 검증한 후 의존성을 고정한다. 허용되는 단일 SELECT/읽기 WITH 하위 트리를 재귀 검사하며 변경 CTE, SELECT INTO, 잠금, 다중 문장 및 지원하지 않는 구문은 거부한다. detailQuery는 외부 키 값 하나만 `$1`로 받고 listQuery는 사용자 placeholder를 받지 않는다.

한 요청의 COUNT와 page는 동일 연결의 읽기 전용 repeatable-read 트랜잭션에서 수행한다. 바인딩된 로컬 timeout을 설정하고 연결 획득·요청 전체에도 deadline과 취소를 둔다. 성공/실패 모두 transaction과 client를 정리하며 취소 후 정리가 불확실한 연결은 pool에서 폐기한다. pool 크기와 대기열을 제한한다. 원천 계정은 대상 테이블 SELECT만 부여하고 쓰기 가능한 함수 권한을 제거한다. 읽기 전용 트랜잭션만으로 임의 함수의 외부 부작용까지 막는다고 주장하지 않는다.

### 조건·변환·식별

서버는 기존 normalizeRecordConditions와 선언형 필드 검증을 재사용하되 SQL 생성은 JSON 저장 컬럼과 분리한다. queryFields는 검증된 SELECT 출력 컬럼만 가리킨다. 사용자 값은 전부 바인딩하고 ILIKE는 역슬래시·%·_를 escape하여 명시적 ESCAPE 절과 함께 사용한다. 기존 검색의 ASCII 비교와 정렬/null 의미를 fixture로 대조한다. 사용자가 SQL 표현식이나 컬럼명을 직접 주입할 수 없다.

SQL 투영이 검색·정렬할 최종 값을 결정한다. 라이브 transform은 1행→1레코드로 제한하고 식별자·queryFields 값을 변경하거나 행을 버리거나 분리하지 못한다. 위반하면 전체 요청이 실패한다. 추가 상세 값 정규화는 허용한다. 동일 종류·키 중복은 설정/원천 계약 위반이며 샘플 SQL에서 유일성을 보장하고 상세 다중 결과를 검출한다.

라이브 응답은 별도 discriminated union으로 저장형과 구분한다. `mode: live`와 queriedAt을 사용하고 firstSeenAt/lastSeenAt을 저장된 값처럼 생성하지 않는다. 목록은 기존 URL에서 분기하되 상세는 `/api/v1/live-records/detail`과 범위·외부 키로 읽는다. 새 탭·새로고침에서도 동작하며 서버 메모리에 ID 매핑을 저장하지 않는다. 원천 삭제는 404, 연결/질의/transform 실패는 503, 잘못된 입력은 400으로 처리한다.

### 캐시와 배포

watchlist 원본이 없으므로 예제 source의 명시적 `cache: { kind: watchlist, ttlSeconds: 600 }` 설정을 제안한다. 캐시는 성공한 목록 응답에만 적용하고 기본 목록/상세는 캐시하지 않는다. 설정 revision·범위·조건·정렬·페이지를 키로 사용하고 600초 TTL, LRU 항목 수·전체 byte 제한을 적용한다. 같은 키의 동시 요청을 합치고 실패·만료 응답을 반환하지 않는다. 이 범위는 검토 대상이며 알려지지 않은 기존 watchlist 동작을 재현했다고 간주하지 않는다.

외부 plugin 폴더·Connection·registry를 검증해 마운트하고 API를 재기동한다. SQL·transform·선언형 화면 변경에 이미지 재빌드는 필요 없다. registry는 현재 불변 snapshot이므로 자동 reload를 암시하지 않는다.

## Risks / Trade-offs

- 큰 UNION의 COUNT 및 OFFSET 비용 → 적절한 예제 인덱스, 제한 시간 및 명시적 오류. 전수 메모리 적재로 대체하지 않는다.
- 요청 사이 원천 변경 → 각 응답은 snapshot으로 일관되지만 페이지 간 고정 snapshot은 보장하지 않는다.
- 저장형과 다른 상태·상세 응답 → 클라이언트 타입을 분리하고 저장형 회귀 테스트를 유지한다.
- SQL parser의 지원 차이 → 허용 구문 fixture와 실패 폐쇄 검증을 구현 게이트로 둔다.
- watchlist 의미 미제공 → 위 캐시 범위를 검토받고 합성 예제임을 문서화한다.

## Migration Plan

schema와 실행기·클라이언트를 함께 배포한 뒤 예제 PostgreSQL의 세 테이블을 읽는 플러그인을 외부 등록한다. 이전 이미지와 설정으로 복귀할 때는 db-postgres registry 항목을 제거한다. 플랫폼 DB migration이나 원천 데이터 변경은 없다. 동일 이미지에서 플러그인 SQL/화면 변경 후 재기동 검증을 수행한다.
