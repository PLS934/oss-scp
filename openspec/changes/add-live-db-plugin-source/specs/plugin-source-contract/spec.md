## ADDED Requirements

### Requirement: PostgreSQL live source declaration
설정 검증은 `type: db-postgres`, `persistence: none`, `connectionRef`, `listQuery`, `detailQuery`, `batchSize` 및 한도를 가진 source를 SHALL 허용해야 한다. PostgreSQL Connection은 host·port·database·user와 비밀번호 비밀 참조를 제공해야 하며 인라인 비밀번호를 금지한다. 환경변수 또는 파일 참조는 실행 시 해석하고 검증 CLI는 비밀 값이나 DB 연결 없이 구조와 교차 참조를 검증해야 한다. HTTP source와 Connection의 기존 계약은 유지해야 한다.

#### Scenario: Mixed registry validates offline
- **WHEN** PostgreSQL 라이브 소스와 기존 HTTP·CSV 소스가 올바른 Connection을 참조한다
- **THEN** DB 접속 없이 schema와 CLI 검증이 성공한다

#### Scenario: Invalid secret or connector
- **WHEN** 평문 비밀번호·다른 connector 참조·persistence 저장 모드·유효하지 않은 한도를 선언한다
- **THEN** 비밀을 출력하지 않고 해당 선언을 거부한다

#### Scenario: Secret resolution failure
- **WHEN** 실행에 필요한 비밀 환경변수나 허용된 파일을 읽을 수 없다
- **THEN** 원천 질의를 실행하지 않고 비밀 없는 설정 오류를 반환한다
