## MODIFIED Requirements

### Requirement: 버전 고정 Release 자산
GitHub Release는 제품 버전을 파일명에 포함한 기존 PostgreSQL·MySQL용 `oss-scp-bundle-<version>.tar.gz`, PostgreSQL 이미지 포함 `oss-scp-bundle-<version>-postgresql.tar.gz`, 두 번들 archive를 검증하는 외부 `SHA256SUMS`만 SHALL 공개 자산으로 제공해야 한다. API·웹 압축 image archive, 배포용 Compose와 비밀정보 없는 환경변수 예시는 같은 검증된 이미지 조합으로 번들을 생성하는 내부 산출물로 사용할 수 있지만 GitHub Release 공개 자산으로 MUST 게시하지 않아야 한다. 번들에 포함된 Compose는 개발용 build와 mock 서비스를 포함하지 않아야 하며(MUST NOT), 하나의 제품 버전 값으로 API·웹 이미지 조합을 선택하고 외부 설정의 읽기 전용 마운트와 DB 영속 volume을 MUST 유지해야 한다.

#### Scenario: 0.1.0 자산 생성
- **WHEN** 제품 버전 `0.1.0`의 산출물 생성이 완료된다
- **THEN** Release 공개 자산은 `oss-scp-bundle-0.1.0.tar.gz`, `oss-scp-bundle-0.1.0-postgresql.tar.gz`, `SHA256SUMS`만 포함한다

#### Scenario: checksum 검증
- **WHEN** 사용자가 같은 Release의 두 번들과 외부 `SHA256SUMS`를 내려받아 검증한다
- **THEN** 두 번들 archive의 SHA-256이 일치하며 checksum 목록은 자신을 포함하지 않는다

#### Scenario: 외부와 내부 checksum 경계
- **WHEN** 사용자가 Release의 외부 `SHA256SUMS`와 압축을 푼 번들의 내부 `SHA256SUMS`를 각각 검사한다
- **THEN** 외부 목록은 두 번들 archive만 검증하고 내부 목록은 해당 번들에 포함된 파일만 검증한다

#### Scenario: 환경 예시의 비밀정보 경계
- **WHEN** 사용자가 번들에 포함된 환경변수 예시와 Compose를 검사한다
- **THEN** 필요한 변수와 비밀번호 제공 방법은 설명되지만 실제 비밀번호나 토큰 값은 포함되지 않는다

#### Scenario: 내부 산출물 비공개
- **WHEN** GitHub Release의 공개 자산 목록을 검사한다
- **THEN** 개별 API·웹 image archive, 독립 Compose와 환경변수 예시는 존재하지 않는다

#### Scenario: 개별 자산과 번들의 이미지 일치
- **WHEN** 같은 Release의 두 번들 manifest와 `images.tar`를 비교한다
- **THEN** API·웹의 제품 버전, Git revision과 OCI digest가 모두 일치한다
