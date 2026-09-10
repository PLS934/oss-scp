# PostgreSQL Platform DB Specification

## Purpose

PostgreSQL을 플랫폼 운영 DB로 안전하게 연결하고, 내장 또는 외부 DB 설치에서 같은 준비 상태와 명시적 migration 계약을 제공한다.

## Requirements

### Requirement: PostgreSQL 연결 수명주기
플랫폼은 등록된 `postgres` 어댑터로 공통 플랫폼 DB 설정을 사용해 제한된 연결 풀을 생성해야 한다(SHALL). 최초 연결은 설정된 timeout 안에 성공해야 하며 TLS `verify-full`은 인증서 체인과 설정 호스트명을 검증해야 한다. 연결 종료는 새 작업을 거부하고 대기 중인 연결 자원을 정리하며 반복 호출할 수 있어야 한다(SHALL).

#### Scenario: 정상 연결과 종료
- **WHEN** 올바른 인증 정보와 접근 가능한 PostgreSQL을 설정하고 연결한다
- **THEN** 준비 상태 검사가 성공하고 종료 후 풀의 연결 자원이 남지 않는다

#### Scenario: 최초 연결 실패
- **WHEN** 인증 정보가 잘못되었거나 DB에 접속할 수 없거나 TLS 검증이 실패한다
- **THEN** 플랫폼은 제한 시간 안에 시작을 실패시키고 비밀번호·인증서·원본 드라이버 오류를 공개하지 않으며 생성한 자원을 정리한다

### Requirement: API liveness와 readiness 분리
API는 시작 전에 플랫폼 DB 설정과 최초 연결을 완료해야 한다(SHALL). liveness는 API 프로세스의 생존만 나타내고, readiness는 제한 시간 안의 DB 검사 결과를 포함해야 한다(SHALL). 시작 후 DB 장애가 발생해도 liveness는 성공하고 readiness는 실패해야 한다.

#### Scenario: 준비된 API
- **WHEN** API가 PostgreSQL 연결을 완료하고 DB가 응답한다
- **THEN** liveness와 readiness가 모두 성공한다

#### Scenario: 실행 중 DB 장애
- **WHEN** 시작을 완료한 API의 PostgreSQL이 응답하지 않는다
- **THEN** liveness는 성공을 유지하고 readiness는 서비스 준비 안 됨을 반환한다

### Requirement: 명시적 버전 migration
플랫폼은 순번이 붙은 내장 SQL migration을 명시적 명령으로 적용하고 적용 버전·이름·checksum·시각을 DB 이력에 기록해야 한다(SHALL). 실행은 DB 단위 잠금으로 직렬화하고 각 migration과 이력 기록을 한 트랜잭션에서 처리해야 하며, 이미 적용한 동일 migration은 다시 실행하지 않아야 한다(SHALL). 적용 이력의 checksum 불일치와 순번 중복은 변경 전에 거부해야 한다.

#### Scenario: 최초 실행과 재실행
- **WHEN** 빈 DB에서 migration을 실행한 뒤 같은 명령을 다시 실행한다
- **THEN** 첫 실행은 미적용 migration을 순서대로 한 번씩 적용하고 두 번째 실행은 DB를 변경하지 않는다

#### Scenario: migration 실패
- **WHEN** SQL 실행 중 하나가 실패한다
- **THEN** 해당 migration과 이력 기록은 rollback되고 이후 migration은 실행되지 않으며 명령은 실패한다

#### Scenario: 변경된 적용 파일
- **WHEN** 적용 이력과 같은 버전의 SQL 파일 checksum이 다르다
- **THEN** 플랫폼은 새 SQL을 실행하지 않고 명시적인 불일치 오류를 반환한다

### Requirement: 내장 PostgreSQL Compose 설치
기본 Compose 설치는 고정된 지원 PostgreSQL 버전, 전용 DB·계정, healthcheck와 명명된 영속 볼륨을 제공해야 한다(SHALL). API는 DB가 준비된 뒤 시작하며 비밀번호는 이미지나 Git에 포함하지 않고 실행 환경의 값 또는 secret 파일로 받아야 한다. 일반적인 컨테이너 재생성은 DB 데이터를 보존해야 한다(SHALL).

#### Scenario: 함께 설치
- **WHEN** 설치자가 예시 설정으로 기본 Compose를 시작하고 migration을 실행한다
- **THEN** PostgreSQL과 API가 준비 상태가 되고 컨테이너 재생성 후 migration 이력 데이터가 유지된다

### Requirement: 외부 PostgreSQL 설치
설치자는 독립된 외부 DB용 Compose 진입점으로 API와 웹만 시작하고, 이미 실행 중인 PostgreSQL의 주소·TLS·자격증명을 주입해 동일한 API 및 migration 계약을 사용해야 한다(SHALL). 이 경로는 내장 DB 서비스나 볼륨을 정의·시작하지 않아야 하며 oss-scp는 외부 PostgreSQL 인스턴스의 생성·기동·종료·삭제를 수행하지 않아야 한다(SHALL). 가이드는 DB와 전용 계정 준비, 연결 권한과 migration에 필요한 스키마 권한, TLS CA 전달 방법을 제공해야 한다.

#### Scenario: 외부 DB 사용
- **WHEN** 설치자가 내장 DB 없이 지원 버전의 외부 PostgreSQL 설정을 제공한다
- **THEN** `docker compose -f compose.external-db.yaml up`은 API와 웹만 시작하고 API와 migration 명령은 외부 DB에만 연결하며 해당 DB의 실행 상태나 데이터를 소유·변경하지 않는다

### Requirement: 실제 PostgreSQL 호환성 검증
지원 PostgreSQL 버전과 드라이버 버전은 실제 DB 통합 테스트를 통과한 조합으로 문서와 잠금 파일에 고정해야 한다(SHALL). 자동 검증은 정상 연결, 인증 실패, 접속 불가, TLS 검증 실패, 정상 종료, migration 최초 실행·재실행·실패를 포함해야 한다.

#### Scenario: 지원 조합 검증
- **WHEN** CI가 고정된 PostgreSQL 이미지와 의존성으로 통합 검증을 실행한다
- **THEN** 연결·실패·자원 정리·migration 계약이 실제 DB에서 통과하고 검증한 버전이 문서에 기록된다
