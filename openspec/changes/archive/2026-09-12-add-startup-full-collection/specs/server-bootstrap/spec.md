## MODIFIED Requirements

### Requirement: 상태 확인 API 계약
서버는 인증 없이 `GET /api/v1/health` 요청에 HTTP 200, JSON 본문 `{"status":"ok"}`, JSON 콘텐츠 유형을 반환해야 한다(SHALL). 이 상태는 서버 HTTP 처리 가능 여부만 의미하며 DB·원천 수집처의 상태, 기동 수집 완료 또는 데이터 최신성을 의미하지 않는다. 내부 설정·비밀정보는 노출하지 않아야 한다.

#### Scenario: 익명 호출
- **WHEN** 로그인이나 자격증명 없이 실행 중인 서버의 상태 확인 API를 호출한다
- **THEN** HTTP 200과 정의된 JSON 응답을 받는다

#### Scenario: 기동 수집 진행 중 호출
- **WHEN** 서버가 HTTP 수신을 시작했고 하나 이상의 기동 수집이 진행 중이다
- **THEN** 상태 확인 API는 HTTP 처리 가능 여부에 따라 정의된 응답을 반환하며 수집 완료까지 대기하지 않는다

#### Scenario: 존재하지 않는 경로
- **WHEN** 정의되지 않은 API 경로를 호출한다
- **THEN** 서버는 HTTP 404를 반환하며 정상 상태 확인 응답으로 대체하지 않는다
