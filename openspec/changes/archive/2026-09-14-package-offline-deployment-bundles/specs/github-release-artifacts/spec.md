## MODIFIED Requirements

### Requirement: 버전 고정 Release 자산
GitHub Release는 제품 버전을 파일명에 포함한 API·웹 압축 image archive, 배포용 Compose, 비밀정보 없는 환경변수 예시, `SHA256SUMS`, 기존 PostgreSQL·MySQL용 `oss-scp-bundle-<version>.tar.gz`와 PostgreSQL 이미지 포함 `oss-scp-bundle-<version>-postgresql.tar.gz`를 SHALL 제공해야 한다. 개별 자산과 두 번들은 같은 검증된 API·웹 이미지 조합을 사용해야 한다(MUST). Compose는 개발용 build와 mock 서비스를 포함하지 않아야 하며(MUST NOT), 하나의 제품 버전 값으로 API·웹 이미지 조합을 선택하고 외부 설정의 읽기 전용 마운트와 DB 영속 volume을 MUST 유지해야 한다.

#### Scenario: 0.1.0 자산 생성
- **WHEN** 제품 버전 `0.1.0`의 산출물 생성이 완료된다
- **THEN** Release 자산은 `oss-scp-api-0.1.0.tar.gz`, `oss-scp-web-0.1.0.tar.gz`, `oss-scp-0.1.0-compose.yaml`, `oss-scp-0.1.0.env.example`, `SHA256SUMS`, `oss-scp-bundle-0.1.0.tar.gz`, `oss-scp-bundle-0.1.0-postgresql.tar.gz`를 포함한다

#### Scenario: checksum 검증
- **WHEN** 사용자가 같은 Release의 네 개별 배포 파일과 `SHA256SUMS`를 내려받아 검증한다
- **THEN** 모든 파일의 SHA-256이 일치하며 checksum 목록은 자신을 포함하지 않는다

#### Scenario: 환경 예시의 비밀정보 경계
- **WHEN** 환경변수 예시와 Compose를 검사한다
- **THEN** 필요한 변수와 비밀번호 제공 방법은 설명되지만 실제 비밀번호나 토큰 값은 포함되지 않는다

#### Scenario: 개별 자산과 번들의 이미지 일치
- **WHEN** 같은 Release의 개별 image archive와 두 번들의 manifest 및 `images.tar`를 비교한다
- **THEN** API·웹의 제품 버전, Git revision과 OCI digest가 모두 일치한다
