# offline-deployment-bundle Specification

## Purpose

외부 Registry와 소스 tree 없이도 검증된 OSS-SCP 이미지 조합을 폐쇄망 단일 서버로 한 번에 반입하여 최초 설치·업데이트·실패 복구할 수 있게 한다.

## Requirements

### Requirement: 기존 DB용 기본 번들과 PostgreSQL 포함 번들
릴리스는 API·웹 이미지를 포함하고 운영자가 준비한 PostgreSQL 17.6 또는 MySQL 8.4.6에 연결하는 `oss-scp-bundle-<version>.tar.gz`와, 같은 이미지에 고정된 PostgreSQL 17.6 이미지를 추가한 `oss-scp-bundle-<version>-postgresql.tar.gz`를 SHALL 제공해야 한다. 각 번들은 필요한 모든 이미지를 한 번에 load할 수 있는 `images.tar`, 버전 고정 Compose, manifest, 환경 예시, 내부 `SHA256SUMS`, 설치·업데이트·롤백·검증 스크립트와 운영 문서를 MUST 포함해야 한다.

#### Scenario: 기존 DB용 기본 번들 확인
- **WHEN** 운영자가 기본 번들의 manifest와 `images.tar`를 검사한다
- **THEN** API·웹 이미지는 포함되고 DB 이미지는 제외되며 지원되는 기존 PostgreSQL·MySQL 조건이 명시된다

#### Scenario: PostgreSQL 포함 번들 확인
- **WHEN** 운영자가 PostgreSQL 변형의 manifest와 `images.tar`를 검사한다
- **THEN** API·웹과 고정된 PostgreSQL 17.6 이미지 및 영속 DB volume을 사용하는 Compose가 포함된다

#### Scenario: Registry 없는 이미지 적재
- **WHEN** 운영자가 외부 Registry에 접근할 수 없는 호스트에서 번들의 설치 절차를 실행한다
- **THEN** 필요한 이미지를 `images.tar`에서만 load하고 Compose는 원격 pull이나 소스 build를 시도하지 않는다

### Requirement: 검증 가능한 manifest와 내부 무결성
각 번들의 manifest는 schema version, 제품 버전, 전체 Git revision, 번들 변형, 지원 환경·DB 조건과 모든 포함 이미지의 repository·tag·OCI digest를 SHALL 기록해야 한다. 내부 `SHA256SUMS`는 자신을 제외한 번들 파일을 결정적인 순서로 검증해야 하며, 스크립트는 checksum·manifest·실제 이미지 provenance 중 하나라도 일치하지 않으면 적용 전에 MUST 실패해야 한다.

#### Scenario: 전달 후 번들 검증
- **WHEN** 운영자가 압축을 푼 번들을 폐쇄망 서버에서 검증한다
- **THEN** 모든 내부 파일 checksum과 load할 이미지의 version·revision·digest가 manifest와 일치한다

#### Scenario: 변경되거나 혼합된 파일 거부
- **WHEN** 다른 버전 파일이 섞이거나 번들 파일 또는 이미지 metadata가 변경됐다
- **THEN** 스크립트는 migration과 실행 중인 컨테이너 변경 전에 실패 단계와 원인을 반환한다

### Requirement: 운영 설정과 비밀정보의 분리
번들은 비밀번호·토큰, 운영자 관리 플러그인·Connection, TypeScript 원본과 사용자 정의 `.tsx` 화면을 MUST NOT 포함해야 한다. 운영자는 사전 빌드된 가공 JavaScript와 선언형 플러그인·원천·Connection 설정을 별도 경로로 제공해야 하며, 플랫폼은 이를 읽기 전용으로 마운트하고 DB 접속과 migration 전에 SHALL 검증해야 한다.

#### Scenario: 별도 운영 설정으로 설치
- **WHEN** 운영자가 비밀정보를 실행 환경으로 제공하고 호환되는 설정 revision을 별도 디렉터리에 준비한다
- **THEN** 설치는 설정을 이미지 재빌드 없이 읽기 전용으로 주입하고 사전 검증 후 계속된다

#### Scenario: 호환되지 않는 설정 거부
- **WHEN** 외부 설정 revision의 schema나 가공 모듈이 대상 이미지와 호환되지 않는다
- **THEN** 설치 또는 업데이트는 DB와 실행 중인 컨테이너를 변경하기 전에 실패한다

### Requirement: 기존 DB에 대한 명시적 최초 migration
기본 번들은 운영자가 준비한 전용 빈 database와 migration 가능한 계정을 SHALL 요구해야 하며 DB 서버·database·계정·권한을 생성해서는 안 된다(MUST NOT). 설치는 연결과 설정을 검증하고 API 이미지의 migration 도구를 명시적으로 성공시킨 후에만 API·웹을 기동하고 실제 적용 버전과 health·ready를 MUST 확인해야 한다.

#### Scenario: 빈 기존 DB 최초 설치
- **WHEN** 운영자가 지원 DB의 빈 전용 database와 필요한 권한의 계정을 제공한다
- **THEN** migration이 OSS-SCP table·index·이력을 생성하고 API·웹 기동 및 상태 검사가 성공한다

#### Scenario: DB 준비 미완료
- **WHEN** database가 없거나 계정의 연결·migration 권한이 부족하다
- **THEN** 설치는 원인을 표시하고 API·웹을 새 버전으로 기동하지 않는다

### Requirement: PostgreSQL 포함 번들의 최초 설치
PostgreSQL 포함 번들은 사용자가 제공한 비밀번호로 DB container와 영속 volume을 먼저 기동하고 ready 상태에서 명시적 migration을 실행한 뒤 API·웹을 SHALL 기동해야 한다. 번들은 비밀번호 기본값 또는 실제 비밀값을 MUST NOT 제공해야 한다.

#### Scenario: DB가 없는 단일 서버 설치
- **WHEN** 운영자가 새 비밀번호와 외부 설정 경로를 제공해 PostgreSQL 포함 번들을 설치한다
- **THEN** PostgreSQL 17.6, migration, API·웹과 health·ready가 Registry 접근 없이 순서대로 성공한다

### Requirement: 업데이트와 실패 경계
업데이트는 운영자가 DB 표준 도구로 백업하고 외부 설정 revision을 보존했음을 명시적으로 확인한 뒤 checksum·대상 버전·이미지·설정 호환성 검사, image load, migration, `--pull never` 컨테이너 재생성과 상태 확인 순서로 SHALL 수행해야 한다. 배포 스크립트는 DB 백업·복원을 직접 수행해서는 안 되며(MUST NOT), migration 시작 전 실패에서는 현재 컨테이너를 변경하지 않고 migration 중 또는 이후 실패에서는 자동 이미지 롤백이나 DB 복원을 시도하지 않아야 한다(MUST NOT).

#### Scenario: 다음 번들로 업데이트
- **WHEN** 운영자가 백업과 설정 보존을 확인하고 검증된 다음 버전 번들을 적용한다
- **THEN** 새 이미지와 migration이 적용되고 기존 DB 데이터·volume·외부 설정 경로가 유지되며 실제 적용 버전과 상태 검사가 성공한다

#### Scenario: migration 전 실패
- **WHEN** checksum, manifest, DB 연결 또는 설정 사전 검증이 실패한다
- **THEN** 현재 실행 중인 이미지·Compose 버전과 설정 조합은 변경되지 않는다

#### Scenario: migration 이후 실패와 복원
- **WHEN** migration이 시작된 뒤 배포 또는 상태 검사가 실패한다
- **THEN** 자동 롤백 없이 실패 단계가 기록되고 운영자가 문서화된 PostgreSQL 또는 MySQL 백업 복원을 완료한 뒤 이전 번들·설정 조합을 명시적으로 재기동해 검증할 수 있다

### Requirement: 폐쇄망 핵심 사용자 여정 검증
프로젝트는 공개할 번들과 동일한 구조로 기존 DB와 PostgreSQL 포함 변형의 최초 설치, 두 테스트 버전 간 업데이트, migration 전 실패, migration 이후 DB 백업 복원, 대표 수집과 저장된 목록·상세 조회를 SHALL 자동 검증해야 한다.

#### Scenario: 깨끗한 오프라인 환경 검증
- **WHEN** 테스트가 호스트의 대상 이미지를 제거하고 번들 외 Registry·소스 입력 없이 설치를 시작한다
- **THEN** image load부터 migration·기동·수집·조회·버전 확인까지 성공한다

#### Scenario: 복구 경계 검증
- **WHEN** 테스트가 migration 전과 이후에 각각 의도적인 실패를 발생시킨다
- **THEN** 전자는 현재 배포가 유지되고 후자는 문서화된 DB 백업 복원 뒤 이전 이미지·설정 조합으로 복구된다
