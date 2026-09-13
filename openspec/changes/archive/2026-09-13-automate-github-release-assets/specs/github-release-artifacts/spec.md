## Purpose

검증한 Git 태그와 Docker 이미지의 provenance를 보존하고, 소스 빌드 없이 설치·업데이트할 수 있는 불변 GitHub Release 자산을 안전하게 제공한다.

## ADDED Requirements

### Requirement: 릴리스 태그와 공개 수준 검증
릴리스 자동화는 `v<MAJOR>.<MINOR>.<PATCH>`와 `v<MAJOR>.<MINOR>.<PATCH>-rc.<NUMBER>` 형식만 SHALL 허용해야 한다. 각 숫자는 `0` 또는 0으로 시작하지 않는 양의 정수여야 한다(MUST). 모든 `0.x` 안정 태그와 RC 태그는 prerelease로, `1.0.0` 이후 안정 태그는 정식 Release로 SHALL 분류해야 한다.

#### Scenario: 0.1.0 기술 프리뷰 태그
- **WHEN** `v0.1.0` 태그가 push된다
- **THEN** 자동화는 제품 버전을 `0.1.0`으로 계산하고 GitHub prerelease 게시 대상으로 분류한다

#### Scenario: 정식 안정 태그
- **WHEN** `v1.0.0` 태그가 push된다
- **THEN** 자동화는 제품 버전을 `1.0.0`으로 계산하고 정식 GitHub Release 게시 대상으로 분류한다

#### Scenario: 잘못된 태그
- **WHEN** 지원하지 않는 접미사, build metadata, 선행 0 또는 빈 RC 번호가 포함된 태그가 push된다
- **THEN** 자동화는 이미지 빌드와 Release 생성 전에 실패한다

### Requirement: 태그 commit의 검증과 이미지 provenance
릴리스 자동화는 태그가 가리키는 정확한 commit에서 기존 PostgreSQL·MySQL·로컬·Docker 통합 검증을 다시 실행하고 모두 성공한 경우에만 SHALL 산출물을 생성해야 한다. API·웹 이미지는 같은 제품 버전 태그를 사용하고 제품 버전과 전체 Git revision을 OCI label에 MUST 기록해야 한다.

#### Scenario: 검증된 이미지 생성
- **WHEN** 태그 commit의 전체 통합 검증과 이미지 빌드가 성공한다
- **THEN** API·웹 이미지의 태그와 OCI version·revision label은 태그에서 계산한 제품 버전 및 해당 commit SHA와 일치한다

#### Scenario: 통합 검증 실패
- **WHEN** 태그 commit의 필수 검증 중 하나가 실패한다
- **THEN** 자동화는 Release와 공개 자산을 생성하지 않는다

#### Scenario: 이미지 이름 변경 후 provenance 확인
- **WHEN** 운영자가 릴리스 이미지를 다른 로컬 이름으로 다시 태그한다
- **THEN** 이미지 inspect 결과에는 원래 제품 버전과 Git revision label이 유지된다

### Requirement: 버전 고정 Release 자산
GitHub Release는 제품 버전을 파일명에 포함한 API·웹 압축 image archive, 배포용 Compose, 비밀정보 없는 환경변수 예시와 `SHA256SUMS`를 SHALL 제공해야 한다. Compose는 개발용 build와 mock 서비스를 포함하지 않아야 하며(MUST NOT), 하나의 제품 버전 값으로 API·웹 이미지 조합을 선택하고 외부 설정의 읽기 전용 마운트와 DB 영속 volume을 MUST 유지해야 한다.

#### Scenario: 0.1.0 자산 생성
- **WHEN** 제품 버전 `0.1.0`의 산출물 생성이 완료된다
- **THEN** Release 자산은 `oss-scp-api-0.1.0.tar.gz`, `oss-scp-web-0.1.0.tar.gz`, `oss-scp-0.1.0-compose.yaml`, `oss-scp-0.1.0.env.example`, `SHA256SUMS`를 포함한다

#### Scenario: checksum 검증
- **WHEN** 사용자가 같은 Release의 네 배포 파일과 `SHA256SUMS`를 내려받아 검증한다
- **THEN** 모든 파일의 SHA-256이 일치하며 checksum 목록은 자신을 포함하지 않는다

#### Scenario: 환경 예시의 비밀정보 경계
- **WHEN** 환경변수 예시와 Compose를 검사한다
- **THEN** 필요한 변수와 비밀번호 제공 방법은 설명되지만 실제 비밀번호나 토큰 값은 포함되지 않는다

### Requirement: 기존 자산을 변경하지 않는 게시
릴리스 게시 권한은 자산을 게시하는 단계에만 SHALL 제한되어야 한다. 자동화는 같은 태그의 Release가 이미 존재하면 기존 Release 또는 자산을 변경하지 않고 MUST 실패해야 하며, 모든 자산 업로드가 성공하기 전에 draft를 공개해서는 안 된다(MUST NOT).

#### Scenario: 최초 게시 성공
- **WHEN** 필수 검증과 모든 자산 업로드가 성공하고 같은 태그 Release가 없다
- **THEN** 자동화는 계산한 공개 수준으로 Release를 한 번 공개한다

#### Scenario: 같은 태그 재실행
- **WHEN** 같은 태그의 Release가 존재하는 상태에서 게시를 다시 실행한다
- **THEN** 자동화는 기존 본문과 자산을 덮어쓰지 않고 실패한다

#### Scenario: 자산 업로드 실패
- **WHEN** draft Release의 자산 중 하나라도 업로드되지 않는다
- **THEN** 자동화는 해당 draft를 prerelease 또는 정식 Release로 공개하지 않는다

### Requirement: 소스 빌드 없는 설치와 업데이트 검증
프로젝트는 생성한 자산으로 checksum 확인, `docker load`, 명시적 DB migration, Compose 기동과 health·ready 확인을 SHALL 검증해야 한다. 서로 다른 두 제품 버전 사이의 업데이트는 제품 버전 값만 변경해 수행하고 외부 플러그인·Connection 설정과 플랫폼 DB 데이터를 MUST 보존해야 한다.

#### Scenario: 깨끗한 Docker 환경의 최초 설치
- **WHEN** 빌드된 소스 tree를 사용하지 않고 Release 자산과 별도 테스트 설정 revision으로 설치 검증을 수행한다
- **THEN** checksum, image load, 명시적 migration, API·웹 기동과 health·ready 검사가 성공한다

#### Scenario: 테스트 제품 버전 업데이트
- **WHEN** 첫 테스트 버전이 저장한 데이터와 migration 이력을 가진 상태에서 두 번째 테스트 버전으로 Compose 제품 버전만 변경한다
- **THEN** 새 이미지 조합이 실행되고 기존 DB 데이터·volume과 외부 설정 경로가 유지된다

#### Scenario: 플러그인 revision 독립 교체와 복구
- **WHEN** 같은 이미지에서 설정 revision만 교체하거나 호환되지 않는 revision에서 이전 조합으로 복구한다
- **THEN** 이미지 재빌드 없이 호환되는 변경은 반영되고 호환되지 않는 변경은 기동 전에 거부되며 이전 이미지·설정 조합으로 재기동할 수 있다
