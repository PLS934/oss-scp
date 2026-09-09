## Purpose

외부 시스템과 실제 인증 정보 없이 수집 기능을 개발하고 검증할 수 있도록, 저장소의 JSON·CSV 원천 샘플을 재현 가능한 HTTP 응답으로 제공한다. 플랫폼의 저장 데이터 조회와 원천 응답 제공을 구분한다.

## ADDED Requirements

### Requirement: 독립 실행

서버는 SHALL 별도 명령 `pnpm dev:mock`으로 인증·DB 없이 실행되며 기본 주소는 `127.0.0.1:3001`이다. `MOCK_HOST`·`MOCK_PORT`로 변경할 수 있고 잘못된 포트, 포트 점유, 필수 fixture 읽기·JSON 파싱 실패 시 비정상 종료한다.

#### Scenario: 기본 실행
- **WHEN** 의존성을 설치하고 `pnpm dev:mock`을 실행한다
- **THEN** 업무 API·웹을 실행하지 않아도 세 원천 경로에 접근할 수 있다

#### Scenario: 시작 실패
- **WHEN** 포트가 유효하지 않거나 이미 점유되어 있거나 필수 fixture를 읽을 수 없다
- **THEN** 성공 시작을 표시하지 않고 비정상 종료하며 비밀정보 없이 원인을 알린다

### Requirement: 분할 JSON 응답

서버는 SHALL `GET /sample1`에서 원본 rows의 순서를 유지한 `{ total: 72, rows: [...] }`와 HTTP 200, JSON 콘텐츠 유형을 반환한다. offset 기본값은 0이며 0 이상의 안전한 정수이고 limit 기본값은 1000, 허용 범위는 1~1000이다. 값은 십진 숫자로만 구성된 단일 쿼리 값이어야 하며 빈 값·반복 키·배열·음수·소수·공백·지수 표기·문자는 HTTP 400 JSON 오류로 거부한다. 관련 없는 쿼리 키는 무시한다.

#### Scenario: 네 페이지 병합
- **WHEN** limit=20과 offset=0·20·40·60을 요청한다
- **THEN** 각각 20·20·20·12건과 total=72를 반환하며 합친 rows가 원본과 순서·내용이 같다

#### Scenario: 기본값과 경계값
- **WHEN** 파라미터를 생략하거나 limit=1·1000 또는 offset=72 이상을 요청한다
- **THEN** 생략한 값에는 기본값을 적용하고 유효한 한도를 지키며 범위 밖 offset에는 빈 rows와 total=72를 반환한다

#### Scenario: 잘못된 쿼리
- **WHEN** offset=-1, offset=1.5, offset=abc, limit=0, limit=1001, limit=, limit=1e2, limit=1&limit=2 또는 안전한 정수를 초과한 값을 요청한다
- **THEN** HTTP 400 JSON 오류를 반환하고 서버는 후속 정상 요청을 처리한다

### Requirement: 전체 JSON 응답

서버는 SHALL `GET /sample2`에서 HTTP 200과 JSON 콘텐츠 유형으로 sample2.json 전체를 반환하며 items 153건, 중첩 객체·배열, 최상위 test_field6의 값과 타입을 유지한다. 쿼리는 결과를 변경하지 않는다.

#### Scenario: 원본 일치
- **WHEN** `/sample2`를 요청한다
- **THEN** 파싱한 응답 전체가 원본 JSON과 깊은 비교로 일치한다

### Requirement: CSV 다운로드

서버는 SHALL `GET /vulnerabilities.csv`에서 원본 파일과 바이트 단위로 같은 응답을 제공한다. 응답은 HTTP 200, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="vulnerabilities.csv"`를 포함한다.

#### Scenario: 다운로드 보존
- **WHEN** CSV를 다운로드한다
- **THEN** 헤더와 53개 데이터 행, 숫자의 문자열 표기와 줄바꿈을 포함해 원본 바이트를 유지한다

### Requirement: 정의되지 않은 경로

서버는 SHALL 등록되지 않은 GET 경로에 HTTP 404 JSON 오류를 반환한다.

#### Scenario: 잘못된 경로
- **WHEN** `/missing`을 요청한다
- **THEN** HTTP 404를 반환하고 이후 세 정상 경로는 계속 응답한다

### Requirement: 재현 가능한 검증 및 문서

저장소는 SHALL 각 경로와 오류 조건의 자동화 HTTP 테스트를 CI에서 실행하며 설치·실행·설정·엔드포인트·요청 및 응답 예시를 제공한다.

#### Scenario: 문서로 실행
- **WHEN** 깨끗한 checkout에서 문서의 설치 및 실행 명령을 수행한다
- **THEN** 외부 인증 정보 없이 세 경로를 호출하고 자동화 테스트를 실행할 수 있다

### Requirement: Docker 이미지 독립 실행

프로젝트는 SHALL 호스트 Node.js·pnpm·외부 자격증명 없이 Docker와 Compose만으로 mock-api를 빌드·실행할 수 있게 한다. 이미지는 빌드된 서버·운영 의존성·세 fixture를 포함하며 소스 마운트 없이 비루트 사용자로 실행하고 HTTP health 상태를 제공한다. 컨테이너에서도 JSON·CSV·입력 오류 계약은 동일하다.

#### Scenario: 이미지 단독 실행
- **WHEN** 이미지를 빌드하고 소스 볼륨 없이 컨테이너를 실행한다
- **THEN** 세 경로의 원본 일치와 잘못된 쿼리의 HTTP 400을 확인할 수 있고 health 상태가 정상으로 전환된다

### Requirement: 선택적 Compose 실행과 서비스 간 접근

프로젝트는 SHALL `mock` 프로필로 mock-api를 선택 실행할 수 있게 한다. 기본 Compose는 api·web을 실행하며, 프로필을 켠 전체 실행에서는 web·api·mock-api 세 서비스가 실행된다. mock-api만 지정하면 다른 두 서비스를 요구하지 않는다. 호스트 공개 주소는 기본 127.0.0.1:3001이며 MOCK_PUBLISHED_PORT로 포트를 변경할 수 있다. api 컨테이너에서는 `http://mock-api:3001`로 접근한다.

#### Scenario: mock 단독 검증
- **WHEN** `docker compose --profile mock up --build -d mock-api`를 실행한다
- **THEN** mock-api만으로 세 응답 경로를 검증할 수 있다

#### Scenario: 세 서비스 통합 실행
- **WHEN** `docker compose --profile mock up --build -d`를 실행한다
- **THEN** 세 서비스가 실행되고 웹의 기존 health 연결과 api 컨테이너에서 mock-api로 보내는 HTTP 요청이 성공한다

#### Scenario: mock 선택 해제 및 중단
- **WHEN** mock 프로필 없이 새 Compose 환경을 실행하거나 3개 서비스 실행 중 mock-api를 중단한다
- **THEN** api·web의 기존 health 기능은 mock-api 없이 정상 동작한다

### Requirement: Docker 개발 변경 반영

프로젝트는 SHALL compose.yaml과 compose.dev.yaml을 함께 사용하는 mock 개발 경로를 제공하고 호스트 소스와 fixture 변경을 컨테이너에 자동 반영한다. 개발 서비스의 의존성은 호스트 및 다른 서비스와 격리한다.

#### Scenario: 개발 코드와 fixture 변경
- **WHEN** Docker 개발 모드에서 mock 소스 또는 fixture를 수정한다
- **THEN** 이미지를 다시 빌드하거나 컨테이너를 수동 재시작하지 않아도 재시작된 서버의 응답에 변경이 반영된다

#### Scenario: Docker 실행 문서와 CI
- **WHEN** 문서의 Docker 단독·통합·개발 명령과 CI의 Docker 검사를 실행한다
- **THEN** 로컬 Node.js 설치 없이 샘플 서버를 실행할 수 있으며 이미지 응답·내부 네트워크·기존 기능 유지·개발 변경 반영을 검증하고 생성한 자원을 정리한다
