# live-db-plugin-source Specification

## Purpose

대규모 PostgreSQL 원천을 플랫폼 DB에 복제하지 않고 제한된 읽기 질의로 조회하여, 운영자가 플러그인 선언만으로 데이터와 화면을 관리할 수 있도록 실행·무저장·실패 계약을 정의한다.

## Requirements

### Requirement: Bounded read-only PostgreSQL execution
라이브 조회는 단일 SELECT 또는 읽기 전용 WITH만 SHALL 허용하고, 다중 문장·변경 CTE·SELECT INTO·잠금 절을 거부해야 한다. 읽기 전용 트랜잭션, 기본 500행의 반환 상한, 기본 5000ms statement timeout, 연결 대기 및 전체 요청 deadline을 MUST 적용해야 한다. 상세에도 같은 제한을 적용하고 실패 시 rollback과 자원 반환을 보장해야 한다.

#### Scenario: Unsafe SQL is rejected
- **WHEN** 운영자가 변경 CTE, 다중 문장, SELECT INTO 또는 잠금 SQL을 등록한다
- **THEN** 설정 검증이 실패하고 SQL을 실행하지 않는다

#### Scenario: Limits and transaction state are enforced
- **WHEN** 상한을 초과하는 목록이나 지연 질의를 요청한다
- **THEN** 반환 행은 설정 상한을 넘지 않고 지연 질의는 제한 시간에 실패하며 후속 요청에 트랜잭션 상태가 남지 않는다

### Requirement: Conditions apply before pagination
라이브 목록은 선언된 scalar 필드에 대해 기존 검색·필터·정렬 입력 검증을 SHALL 재사용하고 페이지 분할 전에 원천 SQL에 적용해야 한다. 값은 바인딩하고 식별자는 선언된 필드 매핑에서만 선택해야 한다. ILIKE의 사용자 입력 %, _, 역슬래시는 literal로 처리해야 한다. 동률은 고유 외부 키로 안정화하고 total과 items는 동일 snapshot에 근거해야 한다.

#### Scenario: Literal search and later-page match
- **WHEN** 사용자가 % 또는 _가 포함된 검색어와 필터·정렬을 요청하고 일치 행이 첫 500행 밖에 있다
- **THEN** 전체 선언된 질의 범위에 조건을 적용한 후 페이지를 나누고 wildcard 확대 없이 해당 행을 조회할 수 있다

### Requirement: Live reads create no platform persistence
라이브 목록·상세·캐시는 플랫폼 레코드·관계·checkpoint·수집 이력·담당자 데이터를 MUST 변경하지 않아야 한다. 무저장 소스의 수동 수집 요청은 원천 연결과 실행 이력 생성 전에 명시적으로 거부해야 한다.

#### Scenario: Storage remains unchanged
- **WHEN** 라이브 목록·상세 성공, 실패, 캐시 적중 및 수동 수집 시도를 반복한다
- **THEN** 플랫폼 저장 호출이 없고 관련 테이블의 행 수와 값이 변하지 않는다

### Requirement: Watchlist cache has bounded lifetime
watchlist로 지정한 조회의 캐시는 프로세스 메모리에만 SHALL 존재하고 성공 결과 생성 후 최대 600초에 만료해야 한다. 범위·조건·페이지·설정 revision별로 분리하고 크기를 제한해야 하며 실패 응답 및 만료 데이터를 정상 결과로 제공해서는 안 된다.

#### Scenario: Expiry and configuration change
- **WHEN** 600초가 경과하거나 설정 revision이 바뀐다
- **THEN** 이전 캐시를 사용하지 않고 원천을 다시 읽으며 실패 시 명시적 오류를 반환한다

### Requirement: Plugin deployment changes queries without image rebuild
운영자는 SQL·transform·선언형 화면을 외부 플러그인 폴더와 registry 배포 및 API 재기동으로 SHALL 적용할 수 있어야 한다. 조회자는 기존 접근 경계를 따르며 Connection·SQL·비밀 설정을 응답으로 받지 않아야 한다.

#### Scenario: Update external plugin
- **WHEN** 동일 이미지에 검증된 새 플러그인 설정을 마운트하고 재기동한다
- **THEN** 새 질의와 컬럼이 적용되며 이미지 재빌드는 필요하지 않다

### Requirement: Example combines source kinds without identity collisions
예제 플러그인은 프로젝트·컴포넌트·SSCS 합성 테이블을 동일 타입의 공통 컬럼으로 투영한 UNION ALL 목록을 SHALL 제공하고 종류별로 구분된 고유 외부 키를 사용해야 한다. transform은 조회 필드와 식별자를 보존하는 1행 1레코드 변환이어야 한다.

#### Scenario: Same local ID in different tables
- **WHEN** 세 테이블에 동일한 로컬 ID가 존재한다
- **THEN** 통합 목록은 세 레코드를 별도로 표시하고 각각 올바른 원천 상세를 반환한다

#### Scenario: Transform changes query semantics
- **WHEN** transform이 행을 제거·분리하거나 검색 필드·외부 키를 변경한다
- **THEN** 잘못된 페이지를 성공으로 반환하지 않고 질의를 실패 처리한다
