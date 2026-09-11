# MySQL Platform DB Specification

## Purpose

MySQL을 플랫폼 운영 DB로 안전하게 연결하고, PostgreSQL과 동일한 외부 상태·명시적 migration 계약을 내장 또는 외부 MySQL 설치에서 제공한다.

## Requirements

### Requirement: MySQL 연결 수명주기
플랫폼은 등록된 `mysql` 어댑터로 공통 플랫폼 DB 설정을 사용해 제한된 연결 풀을 생성해야 한다(SHALL). 최초 연결과 준비 상태 검사는 설정된 timeout 안에 완료되어야 하며 TLS `verify-full`은 인증서 체인과 설정 호스트명을 검증해야 한다. 연결 종료는 새 작업을 거부하고 풀 자원을 정리하며 반복 호출할 수 있어야 한다(SHALL).

#### Scenario: 정상 연결과 종료
- **WHEN** 올바른 인증 정보와 접근 가능한 지원 버전의 MySQL을 설정하고 연결한다
- **THEN** 준비 상태 검사가 성공하고 종료 후 풀의 연결 자원이 남지 않는다

#### Scenario: 최초 연결 실패
- **WHEN** 인증 정보가 잘못되었거나 DB에 접속할 수 없거나 TLS 검증이 실패한다
- **THEN** 플랫폼은 제한 시간 안에 시작을 실패시키고 비밀번호·인증서·원본 드라이버 오류를 공개하지 않으며 생성한 자원을 정리한다

### Requirement: 제품 독립적인 API 상태 계약
API와 migration 명령은 빌드에 등록된 PostgreSQL·MySQL 어댑터 중 공통 설정에서 선택한 하나만 사용해야 한다(SHALL). API는 선택한 MySQL의 최초 연결을 listen 전에 완료해야 하며 liveness는 프로세스 생존만, readiness는 제한 시간 안의 선택 DB 검사 결과를 나타내야 한다(SHALL). DB 제품별 조건이나 드라이버 오류를 HTTP 응답에 노출하지 않아야 한다.

#### Scenario: MySQL로 준비된 API
- **WHEN** `PLATFORM_DB_TYPE=mysql`로 API가 MySQL 연결을 완료하고 DB가 응답한다
- **THEN** 기존 liveness 응답과 공통 readiness 성공 응답을 반환하며 PostgreSQL 연결을 시도하지 않는다

#### Scenario: 실행 중 MySQL 장애
- **WHEN** 시작을 완료한 API의 MySQL이 응답하지 않는다
- **THEN** liveness는 성공을 유지하고 readiness는 PostgreSQL과 같은 서비스 준비 안 됨 응답을 반환한다

### Requirement: MySQL용 명시적 버전 migration
플랫폼은 기존 순번·이름·checksum 규칙의 내장 SQL migration을 MySQL에 명시적 명령으로 적용하고 적용 버전·이름·checksum·시각을 제품별 이력에 기록해야 한다(SHALL). 실행은 DB 범위의 제한 시간 있는 잠금으로 직렬화하고, 적용에 성공한 migration만 이력에 기록하며, 이미 적용한 동일 migration은 다시 실행하지 않아야 한다(SHALL). 적용 이력의 checksum 불일치와 순번 중복은 새 migration 실행 전에 거부해야 한다.

MySQL에서 암묵적 commit을 일으키는 DDL은 실패 시 자동 rollback을 보장하지 않으므로 migration 파일은 재실행 가능한 전진 변경으로 작성해야 하며, 실패한 버전은 적용 이력에 기록하지 않고 이후 migration을 실행하지 않아야 한다(SHALL). 앱 시작은 migration을 자동 실행하지 않는다.

#### Scenario: 최초 실행과 재실행
- **WHEN** 빈 MySQL DB에서 migration을 실행한 뒤 같은 명령을 다시 실행한다
- **THEN** 첫 실행은 미적용 migration을 순서대로 한 번씩 적용하고 두 번째 실행은 DB를 변경하지 않는다

#### Scenario: migration 실패
- **WHEN** MySQL migration 하나의 SQL 실행이 실패한다
- **THEN** 실패한 버전의 적용 이력을 기록하지 않고 이후 migration을 실행하지 않으며 명령은 비밀정보 없는 오류로 실패한다

#### Scenario: 변경된 적용 파일
- **WHEN** 적용 이력과 같은 버전의 SQL 파일 checksum이 다르다
- **THEN** 플랫폼은 새 SQL을 실행하지 않고 명시적인 불일치 오류를 반환한다

### Requirement: 내장 MySQL Compose 설치
MySQL용 Compose 설치 진입점은 고정된 지원 MySQL 버전, 전용 DB·계정, healthcheck와 PostgreSQL과 분리된 명명 영속 볼륨을 제공해야 한다(SHALL). API는 MySQL이 준비된 뒤 시작하며 비밀번호는 이미지나 Git에 포함하지 않고 실행 환경의 값 또는 secret 파일로 받아야 한다. 일반적인 컨테이너 재생성은 MySQL 데이터와 migration 이력을 보존해야 한다(SHALL).

#### Scenario: MySQL과 함께 설치
- **WHEN** 설치자가 MySQL용 Compose 예시 설정을 사용해 시작하고 migration을 실행한다
- **THEN** MySQL과 API가 준비 상태가 되고 컨테이너 재생성 후 기록한 migration 이력이 유지되며 PostgreSQL 서비스나 볼륨은 생성되지 않는다

### Requirement: 외부 MySQL 설치
설치자는 외부 MySQL용 Compose 진입점으로 API와 웹만 시작하고, 이미 실행 중인 지원 버전 MySQL의 주소·TLS·자격증명을 주입해 동일한 API 및 migration 계약을 사용해야 한다(SHALL). 이 경로는 내장 DB 서비스나 볼륨을 정의·시작하지 않아야 하며 oss-scp는 외부 MySQL 인스턴스의 생성·기동·종료·삭제를 수행하지 않아야 한다(SHALL). 가이드는 DB와 전용 계정 준비, 연결 및 migration에 필요한 권한, 인증 방식과 TLS CA 전달 방법을 제공해야 한다.

#### Scenario: 외부 MySQL 사용
- **WHEN** 설치자가 내장 DB 없이 지원 버전의 외부 MySQL 설정을 제공한다
- **THEN** 외부 MySQL용 Compose는 API와 웹만 시작하고 API와 migration 명령은 해당 외부 DB에만 연결하며 DB의 실행 상태나 데이터를 소유하지 않는다

### Requirement: 실제 MySQL 및 PostgreSQL 회귀 검증
지원 MySQL 버전과 드라이버 버전은 실제 DB 통합 테스트를 통과한 조합으로 문서와 잠금 파일에 고정해야 한다(SHALL). 자동 검증은 정상 연결, 인증 실패, 접속 불가, TLS 인증서 또는 호스트명 검증 실패, 정상 종료, migration 최초 실행·재실행·실패와 내장 설치 영속성을 포함해야 한다. 기존 PostgreSQL 연결·readiness·migration·설치 검증도 계속 통과해야 한다(SHALL).

#### Scenario: 두 제품의 공통 계약 검증
- **WHEN** CI가 고정된 MySQL과 PostgreSQL 이미지 및 의존성으로 통합 검증을 실행한다
- **THEN** 각 제품의 연결·실패·자원 정리·migration 계약이 실제 DB에서 통과하고 검증한 버전이 문서에 기록되며 제품별 조건이 API 업무 코드에 나타나지 않는다
