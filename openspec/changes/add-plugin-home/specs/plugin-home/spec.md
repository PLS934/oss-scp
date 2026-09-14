## ADDED Requirements

### Requirement: 등록 플러그인 정보를 홈에 표시한다
홈은 “플러그인 목록” 제목과 검증된 registry의 등록 정보를 SHALL 표시해야 한다. 이름, 선택 설명, source에서 도출한 유형과 설정상 활성화 여부를 제공하고 비활성 및 메뉴 없는 플러그인도 포함해야 한다(MUST).

#### Scenario: 등록 정보 조회
- **WHEN** 사용자가 홈을 연다
- **THEN** 등록 이름·설명·유형·활성화 정보가 표시되고 설명 누락은 대체 안내를 사용한다

#### Scenario: 공개 정보 경계
- **WHEN** 등록 API를 조회한다
- **THEN** 응답은 id·name·description·enabled·sourceType와 공개 출처 상세(endpoint의 url·method 및 CSV fileName)만 제공하고 서버 파일 경로·Connection 원문·인증정보·쿼리 값·모듈 경로를 포함하지 않으며 화면은 등록을 연결·수집 성공으로 표시하지 않는다

### Requirement: 유효한 조회 메뉴로 이동한다
홈은 활성 플러그인의 검증된 메뉴에만 데이터 보기 링크를 SHALL 제공해야 한다. 복수 메뉴는 제목별로 구분해야 한다(MUST).

#### Scenario: 조회 링크 선택
- **WHEN** 사용자가 메뉴별 데이터 보기를 선택한다
- **THEN** 해당 메뉴의 기존 레코드 목록 경로로 이동한다

#### Scenario: 이동할 수 없는 플러그인
- **WHEN** 플러그인이 비활성이거나 조회 메뉴가 없다
- **THEN** 이동 링크 없이 이유를 안내한다

### Requirement: 조회 상태를 구분한다
홈은 등록 및 메뉴 조회의 로딩·실패를 성공한 빈 결과와 SHALL 구분해야 한다.

#### Scenario: 로딩 및 실패
- **WHEN** 등록 정보 또는 메뉴 조회가 진행 중이거나 실패한다
- **THEN** 해당 상태를 안내하고 확인되지 않은 메뉴 링크를 제공하지 않는다

#### Scenario: 빈 registry
- **WHEN** 등록 조회가 성공했지만 항목이 없다
- **THEN** 등록된 플러그인이 없음을 안내한다

### Requirement: 실제 출처 정보를 표시한다
홈은 HTTP 출처의 주소·요청 경로·메서드와 CSV 파일명을 SHALL 표시해야 한다. HTTP 주소는 userinfo·query·fragment를 제거하고 CSV는 basename만 제공해야 한다(MUST).

#### Scenario: API와 CSV 출처
- **WHEN** 등록된 HTTP JSON, HTTP CSV, 로컬 CSV 플러그인을 표시한다
- **THEN** HTTP 출처는 정제된 endpoint와 GET 메서드를 표시하고 CSV 출처는 파일명을 표시한다

### Requirement: 로컬 CSV 원본을 내려받는다
활성 로컬 CSV 플러그인은 현재 등록 파일 원본 다운로드를 SHALL 제공해야 한다. 파일은 수집 당시 snapshot이 아닌 현재 원본임을 안내해야 한다(MUST). API JSON·HTTP CSV·비활성·미등록 플러그인은 다운로드 대상이 아니다.

#### Scenario: 원본 다운로드
- **WHEN** 사용자가 로컬 CSV의 원본 내려받기를 선택한다
- **THEN** 서버는 설정 루트 안의 등록된 일반 파일만 source maxBytes(생략 시 1 GiB) 이내에서 스트리밍하고 원본 바이트와 파일명으로 attachment를 제공하며 캐시를 방지한다

#### Scenario: 유효하지 않은 다운로드 대상
- **WHEN** 미등록·비활성·HTTP 플러그인을 요청하거나 파일이 누락·루트 이탈·크기 초과·읽기 실패 상태이다
- **THEN** 다운로드를 거부하고 응답에 서버 파일 경로나 원본 오류를 포함하지 않는다
