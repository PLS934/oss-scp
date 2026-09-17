# PostgreSQL 라이브 플러그인

`db-postgres` source는 원천 PostgreSQL을 조회 시점에 읽고 플랫폼 DB에는 레코드, 관계, checkpoint 또는 수집 이력을 저장하지 않는다. 현재 PostgreSQL 원천만 지원한다.

## 예제 범위

`plugins/dependency-track-db`와 `fixtures/postgres/dependency-track.sql`은 projects, components, sscs 합성 테이블을 `UNION ALL`로 통합하는 실행 가능한 예제다. 실제 Dependency Track 운영 스키마를 의미하지 않으며 운영 적용 전 컬럼, 인덱스와 부하를 별도로 검토해야 한다. 서로 다른 테이블의 같은 ID는 `project:1`, `component:1`, `sscs:1`처럼 종류 접두사로 구분한다.

검색·필터·정렬은 `queryFields`에 등록된 UNION 결과 컬럼에만 적용된다. 플랫폼은 사용자 값을 parameter로 바인딩하고 UNION 전체를 감싼 뒤 조건, 안정화 정렬, LIMIT/OFFSET 순으로 적용한다. SQL은 단일 읽기 전용 SELECT, WITH, UNION 또는 UNION ALL이어야 한다. 여러 독립 문장, 변경 CTE, `SELECT INTO`, 잠금 절은 설정 검증에서 거부된다.

## 비밀과 권한

Connection에는 평문 비밀번호나 자격증명 URI를 넣지 않는다. `passwordRef.env`에 환경변수 이름을 지정하거나 `passwordRef.file`에 `${OSS_SCP_CONFIG_ROOT}/secrets` 아래의 상대 경로를 지정한다. 파일 경로 탈출, 심볼릭 링크와 64 KiB 초과 파일은 거부된다.

원천 계정에는 대상 테이블의 SELECT만 부여한다. 실행기는 최대 5개의 연결, 연결 대기 제한, 읽기 전용 repeatable-read 트랜잭션, 최대 5초 statement timeout, 최대 500행과 응답 byte 한도를 적용한다. 오류 응답에는 SQL, 비밀번호와 드라이버 오류를 포함하지 않는다.

## 캐시와 배포

`cache.kind: watchlist`가 선언된 목록은 프로세스 메모리에서 600초 동안만 캐시한다. 키에는 설정 revision, 범위, 검색·필터·정렬과 페이지가 포함되며 실패 응답은 저장하지 않는다. 캐시는 최대 100개 또는 16 MiB이며 오래된 항목부터 제거된다. 상세 조회는 캐시하지 않는다.

플러그인 SQL, transform 또는 선언형 화면을 바꾸려면 외부 설정 폴더를 갱신하고 `pnpm validate:plugins`로 검증한 뒤 API를 재기동한다. 애플리케이션 이미지를 다시 빌드할 필요는 없다. 현재 registry는 기동 시 snapshot이므로 무중단 reload는 지원하지 않는다. 롤백은 registry에서 라이브 플러그인을 제거하고 이전 외부 설정으로 API를 재기동한다. 플랫폼 DB migration이나 원천 데이터 변경은 발생하지 않는다.
