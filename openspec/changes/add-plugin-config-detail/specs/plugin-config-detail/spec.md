## Purpose

운영자와 개발자가 플랫폼이 실제로 로드한 플러그인의 수집·데이터·변환·화면 구성을 비밀정보 노출이나 실행 상태 변경 없이 웹에서 점검할 수 있게 한다.

## ADDED Requirements

### Requirement: 등록된 플러그인 구성을 조회한다
플랫폼은 registry에 등록되어 검증을 통과한 플러그인 ID에 대해서만 읽기 전용 설정 상세를 SHALL 제공해야 한다. 상세에는 이름·ID·버전·선택 설명, 설정상 활성화 여부, source 종류별 연결 대상·요청 또는 파일 정보·pagination·batch·수집 한도, 데이터 타입별 unique key와 필드, 선언된 관계, 메뉴와 목록·상세 구성을 포함해야 한다(MUST).

#### Scenario: HTTP JSON 설정 조회
- **WHEN** 사용자가 등록된 HTTP JSON 플러그인의 설정 상세를 연다
- **THEN** 화면은 정제된 연결 대상과 요청 메서드·경로·응답 경로, single 또는 offset pagination 및 적용 한도와 함께 실제 로드된 플러그인 구성을 표시한다

#### Scenario: 로컬·HTTP CSV 설정 조회
- **WHEN** 사용자가 등록된 로컬 CSV 또는 HTTP CSV 플러그인의 설정 상세를 연다
- **THEN** 화면은 transport 차이와 등록 파일명 또는 정제된 HTTP 대상·요청 경로, batch 크기와 적용 한도를 구분해 표시한다

#### Scenario: 라이브 DB 설정 조회
- **WHEN** 사용자가 등록된 PostgreSQL 라이브 플러그인의 설정 상세를 연다
- **THEN** 화면은 라이브·비저장 방식, 정제된 DB 대상, 목록·상세 쿼리, query field 매핑, batch와 적용 한도를 표시하되 인증 값은 표시하지 않는다

#### Scenario: 없는 플러그인
- **WHEN** 사용자가 registry에 없는 플러그인 ID의 상세 API 또는 화면을 요청한다
- **THEN** 플랫폼은 not-found 상태를 반환하고 다른 플러그인의 설정을 대신 표시하지 않는다

### Requirement: 데이터 구조와 화면 구성을 보존해 표시한다
설정 상세는 데이터 타입별 필드의 이름·표시명·타입·필수 여부와 unique key를 SHALL 표시해야 한다. object의 하위 필드와 array item을 계층으로 보존하고 관계의 이름·from types·to types 및 메뉴 제목·경로·대상 타입, 목록 컬럼·검색·필터·정렬, 상세 섹션과 필드 순서를 실제 로드된 구성에 맞게 표시해야 한다(MUST).

#### Scenario: 중첩 필드와 관계
- **WHEN** 플러그인 데이터 정의에 object·array 중첩 필드와 관계가 선언되어 있다
- **THEN** 화면은 각 중첩 경로와 타입·필수 여부 및 관계의 양 끝 타입을 구분 가능한 계층으로 표시한다

#### Scenario: 목록과 상세 정의
- **WHEN** 플러그인 메뉴가 목록과 상세 구성을 참조한다
- **THEN** 화면은 검증을 통과한 컬럼·검색·필터·정렬과 상세 섹션을 선언 순서대로 표시한다

### Requirement: 등록된 transform 코드를 안전하게 조회한다
플랫폼은 선택한 플러그인의 등록된 배포 transform과, 해당 플러그인 디렉터리에서 확인된 대응 TypeScript 원본만 SHALL 읽을 수 있다. TypeScript 원본이 있으면 이를 우선 표시하고 없으면 실제 배포 JavaScript를 표시하며 파일 종류를 `typescript-source` 또는 `javascript-runtime`으로 구분해야 한다(MUST).

#### Scenario: TypeScript 원본 표시
- **WHEN** 등록된 배포 transform에 대응하는 플러그인 내부 TypeScript 원본을 읽을 수 있다
- **THEN** 상세 API와 화면은 원본 코드를 `typescript-source`로 표시한다

#### Scenario: 배포 JavaScript fallback
- **WHEN** 대응 TypeScript 원본이 없고 등록된 배포 transform을 읽을 수 있다
- **THEN** 상세 API와 화면은 배포 코드를 `javascript-runtime`으로 표시한다

#### Scenario: 코드 파일 조회 실패
- **WHEN** 선택한 코드 파일이 누락되거나 일반 파일이 아니거나 안전하게 읽을 수 없다
- **THEN** 설정 상세의 다른 섹션은 유지하고 코드 영역에는 `unavailable` 상태와 사용자용 이유를 표시하며 서버 경로나 원본 운영체제 오류를 노출하지 않는다

#### Scenario: 임의 파일 경로 차단
- **WHEN** 클라이언트가 플러그인 ID 외의 파일 경로나 등록되지 않은 transform을 지정하려 한다
- **THEN** API는 파일 경로 입력을 받지 않으며 다른 파일 내용을 반환하지 않는다

### Requirement: 비밀정보와 내부 경로를 노출하지 않는다
상세 API는 connection의 비밀번호·token·secret 참조·인증 사용자 값과 설정 루트·plugin·source·transform의 서버 절대 경로를 MUST 반환하지 않아야 한다. HTTP URL은 userinfo·query·fragment를 제거하고 로컬 파일은 basename만 제공해야 한다(MUST).

#### Scenario: 인증 정보가 있는 연결
- **WHEN** 등록된 연결에 인증 값 또는 secret 참조가 포함되어 있다
- **THEN** 상세 응답과 오류에는 인증 값·참조·환경변수명·secret 파일 경로가 포함되지 않는다

### Requirement: 상세 조회는 실행 상태를 변경하지 않는다
플러그인 설정 상세 조회는 플러그인·source·transform·registry 파일을 쓰거나 수집·재시작·재적용·DB 저장을 실행하지 않아야 한다(MUST).

#### Scenario: 설정 상세 조회
- **WHEN** 사용자가 설정 상세와 transform 코드를 조회한다
- **THEN** 플랫폼은 검증 시 메모리에 로드한 정의와 제한된 파일 읽기만 사용하고 구성 파일·registry·수집 및 저장 상태를 변경하지 않는다

### Requirement: 상세 화면 상태를 구분한다
웹은 설정 상세의 로딩, 성공, not-found, API 조회 실패와 transform 코드만의 조회 실패를 SHALL 구분해 안내해야 한다.

#### Scenario: 상세 API 실패
- **WHEN** 플러그인 설정 상세 요청이 not-found 외의 오류로 실패한다
- **THEN** 화면은 상세 정보를 불러오지 못했음을 표시하고 이전 또는 다른 플러그인의 상세를 표시하지 않는다

#### Scenario: 코드만 조회할 수 없음
- **WHEN** 설정 상세는 성공했지만 transform 코드 상태가 `unavailable`이다
- **THEN** 화면은 나머지 설정을 표시하면서 코드 영역에 해당 실패 이유를 표시한다
