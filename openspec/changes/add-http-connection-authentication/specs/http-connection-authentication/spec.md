## Purpose

인증이 필요한 외부 HTTP JSON·CSV 원천을 비밀값의 Git 저장 없이 연결하고, 수집 실행 환경에서 자격증명을 안전하게 해석·적용하는 공통 계약을 제공한다.

## ADDED Requirements

### Requirement: HTTP Connection 인증 선언
플랫폼은 HTTP Connection에 선택적 인증 설정을 SHALL 제공해야 하며, API key 사용자 지정 헤더, Bearer token 및 Basic 사용자명·비밀번호 방식을 지원해야 한다. 설정은 실제 자격증명 대신 대문자·숫자·밑줄로 구성된 환경변수 이름만 포함해야 하며(MUST), 인라인 비밀값이나 지원하지 않는 인증 구조를 검증 단계에서 거부해야 한다.

#### Scenario: API key 인증 선언
- **WHEN** 운영자가 유효한 사용자 지정 헤더 이름과 API key 환경변수 참조를 HTTP Connection에 선언한다
- **THEN** 플랫폼은 실제 비밀값 없이 해당 인증 설정을 내부 HTTP 수집 정의에 보존한다

#### Scenario: Bearer 인증 선언
- **WHEN** 운영자가 token 환경변수 참조를 가진 Bearer 인증을 선언한다
- **THEN** 플랫폼은 이미 발급된 token을 사용할 수 있는 유효한 HTTP Connection으로 승인한다

#### Scenario: Basic 인증 선언
- **WHEN** 운영자가 사용자명과 비밀번호의 환경변수 참조를 각각 가진 Basic 인증을 선언한다
- **THEN** 플랫폼은 두 실제 값이 Connection JSON에 없어도 해당 설정을 유효한 인증 선언으로 승인한다

#### Scenario: 인라인 비밀값 거부
- **WHEN** HTTP Connection이 token, API key 또는 비밀번호의 실제 값을 인증 설정에 직접 포함한다
- **THEN** 플랫폼은 외부 요청 전에 허용되지 않은 설정 구조로 검증을 실패한다

### Requirement: 수집 시점 환경변수 해석과 헤더 적용
HTTP JSON offset·single 및 HTTP CSV 수집기는 SHALL 외부 요청 직전에 실제 수집 프로세스의 환경에서 인증 참조를 해석하고 모든 해당 요청에 인증 헤더를 적용해야 한다. API key는 선언된 헤더 이름과 값을, Bearer는 `Authorization: Bearer <token>`을, Basic은 UTF-8 사용자명과 비밀번호를 결합한 표준 Basic Authorization 값을 사용해야 한다.

#### Scenario: JSON API 인증 수집
- **WHEN** 유효한 인증 HTTP Connection을 참조하는 JSON offset 또는 single 수집이 실행되고 필요한 환경변수가 존재한다
- **THEN** 수집기는 선언된 방식의 인증 헤더를 각 HTTP 요청에 포함하고 정상 응답 레코드를 기존 계약대로 전달한다

#### Scenario: HTTP CSV 인증 수집
- **WHEN** 유효한 인증 HTTP Connection을 참조하는 HTTP CSV 수집이 실행되고 필요한 환경변수가 존재한다
- **THEN** 수집기는 동일한 인증 계약으로 CSV 요청 헤더를 구성하고 정상 응답 행을 기존 계약대로 전달한다

#### Scenario: 실행별 환경 분리
- **WHEN** 동일한 Connection 설정을 서로 다른 환경변수 값을 가진 수집 프로세스에서 실행한다
- **THEN** 각 프로세스는 설정 파일 변경 없이 자신의 실행 환경 값을 요청에 사용한다

### Requirement: 자격증명 오류의 요청 전 실패
플랫폼은 필수 인증 환경변수가 없거나 빈 값이거나 HTTP 헤더에 안전하지 않은 개행을 포함하면 외부 요청 전에 해당 수집을 MUST 실패시켜야 한다. 오류는 문제 환경변수 이름과 안정적인 인증 오류 분류를 포함할 수 있지만 실제 값은 포함해서는 안 된다(MUST NOT).

#### Scenario: 누락된 환경변수
- **WHEN** 인증 설정이 참조하는 환경변수가 수집 프로세스에 존재하지 않는다
- **THEN** 플랫폼은 외부 서버에 요청하지 않고 해당 변수 이름을 식별하는 인증 설정 오류를 반환한다

#### Scenario: 빈 환경변수
- **WHEN** 인증 설정이 참조하는 환경변수 값이 빈 문자열이다
- **THEN** 플랫폼은 빈 credential을 전송하지 않고 외부 요청 전에 인증 설정 오류로 실패한다

#### Scenario: 안전하지 않은 헤더 값
- **WHEN** 해석된 인증 값에 HTTP 헤더 경계를 깨뜨릴 수 있는 개행 문자가 포함된다
- **THEN** 플랫폼은 해당 값을 헤더에 넣지 않고 실제 값을 노출하지 않는 인증 설정 오류로 실패한다

### Requirement: 인증 비밀정보 비노출
플랫폼은 해석된 credential과 생성된 인증 헤더를 설정 검증 출력, 브라우저용 플러그인·메뉴 API, 수집 오류 및 운영 로그에 포함해서는 안 된다(MUST NOT). 외부 서버가 인증을 거부하거나 네트워크 요청이 실패해도 안전한 상태 코드·원천 위치·환경변수 이름 외의 인증 값을 노출하지 않아야 한다.

#### Scenario: 브라우저 공개 설정
- **WHEN** 인증 HTTP Connection을 사용하는 플러그인의 메뉴·상세 정보를 브라우저 API로 조회한다
- **THEN** 응답에는 환경변수 참조, 해석된 credential 및 Authorization·API key 헤더가 포함되지 않는다

#### Scenario: 외부 인증 거부
- **WHEN** 외부 서버가 인증 헤더가 포함된 요청에 비성공 HTTP 상태를 반환한다
- **THEN** 수집 오류와 로그는 실제 credential이나 전체 인증 헤더 없이 안전한 HTTP 오류만 제공한다

#### Scenario: 설정 및 실행 오류 직렬화
- **WHEN** 인증 환경변수 해석 또는 인증된 요청이 실패하고 오류가 클라이언트 결과나 로그로 직렬화된다
- **THEN** 직렬화된 내용에는 실제 API key, token, 사용자명·비밀번호 또는 원본 하위 오류의 비밀 문자열이 없다

### Requirement: 기존 Connection 호환성과 운영 주입 문서
인증 설정을 생략한 기존 HTTP Connection은 SHALL 인증 헤더 없이 기존 JSON·CSV 수집 동작을 유지해야 한다. 프로젝트 문서는 로컬 CLI와 Docker Compose에서 선언된 환경변수를 수집 프로세스에 전달하는 방법, 설정 파일과 이미지에 실제 값을 저장하지 않는 원칙, token 발급·OAuth 갱신·요청별 서명 미지원 범위를 명시해야 한다.

#### Scenario: 인증 없는 기존 Connection
- **WHEN** 기존 HTTP Connection이 base URL만 선언하고 인증 설정을 생략한다
- **THEN** 플랫폼은 추가 환경변수를 요구하지 않고 기존 JSON·CSV 수집을 동일하게 실행한다

#### Scenario: 로컬 CLI 환경변수 전달
- **WHEN** 운영자가 문서화된 로컬 CLI 예제에 Connection이 참조하는 환경변수를 제공한다
- **THEN** 수집 프로세스는 Git 설정이나 CLI 인자에 비밀값을 기록하지 않고 인증된 요청을 실행할 수 있다

#### Scenario: Docker Compose 환경변수 전달
- **WHEN** 운영자가 문서화된 Compose 환경 매핑 또는 일회성 `docker compose run` 환경변수 전달 방식을 사용한다
- **THEN** API 또는 수동 수집 프로세스가 이미지와 Connection JSON에 비밀값을 포함하지 않고 인증 값을 받을 수 있다
