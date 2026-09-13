# 폐쇄망 오프라인 번들 설계

## 목적

GitHub Release의 검증된 OSS-SCP API·웹 이미지를 외부 Registry에 접근할 수 없는 단일 서버로 한 번에 반입하고, 소스 빌드 없이 최초 설치·업데이트·실패 복구를 수행할 수 있는 버전 고정 오프라인 번들을 제공한다.

이 설계는 이슈 #88을 다룬다. 플랫폼별 사용자 정의 React 화면의 런타임 로딩, Kubernetes·Helm, 무중단 배포, DB 서버·계정 자동 생성과 DB 백업·복원 자동화는 범위에 포함하지 않는다.

## 배포 변형과 파일명

공개 릴리스는 같은 제품 버전으로 다음 두 자산을 제공한다.

- `oss-scp-bundle-<version>.tar.gz`: API·웹 이미지만 포함하고 운영자가 준비한 PostgreSQL 17.6 또는 MySQL 8.4.6에 연결하는 기본 번들
- `oss-scp-bundle-<version>-postgresql.tar.gz`: API·웹과 고정된 PostgreSQL 17.6 이미지를 포함하는 단일 서버용 번들

기본 번들에서 “기존 DB”는 원격 서버만 의미하지 않는다. 번들이 수명 주기를 관리하지 않는 PostgreSQL 또는 MySQL이면 같은 서버의 DB도 사용할 수 있다. PostgreSQL 포함 번들은 Compose가 DB 컨테이너와 영속 volume을 관리한다.

## 번들 구조

두 자산을 풀면 독립된 최상위 디렉터리가 만들어진다.

```text
oss-scp-bundle-<version>/
├── images.tar
├── compose.yaml
├── manifest.json
├── env.example
├── SHA256SUMS
├── install.sh
├── update.sh
├── rollback.sh
├── verify.sh
└── README.md
```

`images.tar`는 `docker load --input images.tar` 한 번으로 필요한 이미지를 모두 적재할 수 있어야 한다. 기본 번들은 API·웹 이미지만, PostgreSQL 변형은 여기에 고정된 PostgreSQL 이미지를 추가한다. Compose는 `build`를 포함하지 않고 모든 서비스에 `pull_policy: never`를 적용하며 이미지 이름과 제품 버전을 고정한다.

`manifest.json`에는 schema version, 제품 버전, 전체 Git revision, 번들 변형, 생성 시각, 지원 OS·아키텍처·Compose·DB 조건과 각 이미지의 repository·tag·OCI manifest digest 및 config digest를 기록한다. 두 digest를 모두 기록해 Docker Engine별 image ID 표현 차이와 무관하게 archive와 실제 load 결과를 검증한다. PostgreSQL 이미지가 없는 기본 번들은 이를 명시적으로 기록한다. `SHA256SUMS`는 번들 내부 파일을 결정적인 파일명 순서로 검증하며 자신은 포함하지 않는다. GitHub Release가 표시하는 바깥쪽 자산 digest는 압축 파일 자체를, 내부 `SHA256SUMS`는 폐쇄망으로 전달한 뒤 풀린 파일 묶음을 검증한다.

번들에는 비밀번호·토큰 등 비밀정보, 운영자 관리 `plugins/`·`connections/`, TypeScript 원본과 사용자 정의 `.tsx` 화면을 포함하지 않는다. 공통 목록·상세 React 화면은 웹 이미지에 컴파일되어 있고, 운영자는 사전 빌드한 `dist/transform.js`와 선언형 `plugin.json`·`source.json`·Connection 설정을 별도 디렉터리로 반입한다.

## 생성 흐름

#71의 릴리스 자산 생성 결과를 오프라인 번들 생성기의 입력으로 사용한다. 생성기는 다음 순서를 따른다.

1. 제품 버전과 Git revision을 검증한다.
2. 같은 출력의 API·웹 image archive를 `docker load`한다.
3. 이미지의 version·revision OCI label과 기대값이 일치하는지 확인한다.
4. PostgreSQL 변형에서는 digest로 고정한 지원 이미지를 추가한다.
5. 필요한 이미지를 하나의 `images.tar`로 저장한다.
6. 변형별 Compose, manifest, 환경 예시, 스크립트와 문서를 생성한다.
7. 내부 `SHA256SUMS`를 만들고 임시 디렉터리에서 검증한다.
8. 완성된 디렉터리를 `.tar.gz`로 압축한다.

기존 출력 경로나 일부만 생성된 번들을 덮어쓰지 않는다. 생성 실패 시 공개 가능한 최종 파일을 남기지 않으며, 같은 태그 Release를 변경하지 않는 #71의 불변 게시 정책을 유지한다.

## 기존 DB 최초 설치

운영자 또는 DBA는 지원 DB 서버에 OSS-SCP 전용 빈 database와 migration 가능한 계정을 먼저 준비한다. 번들은 DB 서버, database, 계정 또는 권한을 생성하지 않는다. 설치 흐름은 다음과 같다.

1. 번들 압축을 풀고 `sha256sum --check SHA256SUMS`로 내부 파일을 검증한다.
2. `env.example`을 복사해 DB 접속 정보와 외부 설정의 절대 경로를 입력한다.
3. `install.sh`가 manifest·호스트 조건·설정·DB 연결을 사전 검증한다.
4. 스크립트가 `images.tar`를 load하고 API 이미지 안의 migration CLI를 명시적으로 실행한다.
5. migration 성공 후 `docker compose --pull never`로 API·웹을 기동한다.
6. `verify.sh`가 실제 이미지 version·revision, health·ready와 웹 응답을 확인한다.

Migration은 지정한 전용 database 안에 OSS-SCP 테이블·인덱스·migration 이력을 생성한다. 다른 database, DB 서버 설정과 기존 업무 테이블은 변경하지 않는다. 수집 실행 전에는 업무 데이터가 없으며, 운영자가 별도로 반입한 플러그인 설정으로 수집한 뒤 플랫폼 DB에 데이터가 저장된다.

## PostgreSQL 포함 번들 최초 설치

PostgreSQL 변형은 운영자가 별도 DB를 준비하지 않는 흐름이다. 환경 파일에 새 DB 비밀번호와 외부 설정 경로를 입력하면 `install.sh`가 PostgreSQL volume과 컨테이너를 먼저 만들고 ready를 기다린 뒤 같은 migration·API·웹 기동·검증 순서를 수행한다. 비밀번호 기본값이나 실제 비밀값은 번들에 포함하지 않는다.

## 업데이트와 백업 책임

`update.sh`는 새 번들을 검증하고 대상 버전이 현재 버전보다 다른지 확인한 뒤 다음 순서로 실행한다.

1. 운영자가 DB 제품의 표준 도구로 백업하고 외부 설정 revision을 보존했음을 명시적으로 확인한다.
2. 새 번들의 checksum·manifest·이미지 provenance와 호환성을 검사한다.
3. 새 `images.tar`를 load한다.
4. 외부 플러그인 설정을 새 이미지로 사전 검증한다.
5. 명시적 migration을 실행한다.
6. `docker compose --pull never`로 API·웹을 강제 재생성한다.
7. 실제 적용된 이미지 version·revision, health·ready와 핵심 조회를 확인한다.

배포 스크립트는 운영 DB의 백업이나 복원을 직접 수행하지 않는다. 문서는 PostgreSQL·MySQL 표준 도구를 사용한 예시와 검증 방법을 제공하고, CI는 동일한 절차로 백업·복원이 실제 동작하는지 확인한다.

## 실패와 복구 경계

모든 스크립트는 checksum, manifest, Docker, 설정, DB 연결, migration, recreate, health·ready 중 실패 단계를 식별할 수 있는 메시지와 non-zero exit code를 반환한다. 비밀번호·토큰·Connection 본문은 로그에 출력하지 않는다.

- migration 시작 전 실패: 실행 중인 컨테이너를 변경하지 않는다. 이미 load한 새 이미지는 남아도 현재 Compose 버전과 외부 설정은 유지한다.
- migration 실행 중 또는 이후 실패: 자동으로 이전 이미지를 시작하거나 DB를 복원하지 않는다. 서비스 상태와 실패 단계를 기록하고 운영자가 검증된 DB 백업을 복원하게 한다.
- DB 복원 후: `rollback.sh`는 복원 완료의 명시적 확인과 이전 번들·설정 revision을 요구한 뒤 이전 이미지로 컨테이너를 재생성하고 검증한다.
- migration이 적용되지 않았고 이전 이미지가 현재 schema와 호환됨을 확인한 경우: `rollback.sh`로 이전 이미지·설정 조합을 복구할 수 있다.

스크립트는 현재·대상 제품 버전과 이미지 ID/digest를 실행 전후에 출력하고, 컨테이너 inspect 결과가 manifest와 다르면 성공으로 보고하지 않는다.

## 검증 전략

정적·단위 검증은 다음을 확인한다.

- 두 변형의 이름, 구조와 manifest schema
- 기본 번들에 DB 이미지가 없고 PostgreSQL 변형에 고정 이미지가 있는지
- Compose에 build·mock·Registry pull 경로가 없고 `pull_policy: never`인지
- 비밀정보와 운영자 플러그인·Connection·`.tsx`가 포함되지 않는지
- 기존·부분 출력, 잘못된 버전·revision·digest에서 안전하게 실패하는지

Docker smoke test는 서로 다른 두 테스트 제품 버전의 번들을 만든 뒤 로컬 이미지를 제거하고 오프라인 조건에서 다음을 검증한다.

1. 번들 하나만으로 이미지 load와 최초 설치가 성공한다.
2. 별도 fixture 설정을 읽기 전용으로 주입해 대표 수집과 저장된 목록·상세 조회가 성공한다.
3. 새 버전으로 업데이트해 DB volume·데이터·migration 이력·외부 설정 경로가 유지된다.
4. migration 전 의도적 실패가 현재 컨테이너와 버전을 바꾸지 않는다.
5. migration 이후 의도적 실패에서 자동 롤백하지 않고, 문서화된 PostgreSQL·MySQL 백업 복원 후 이전 조합이 성공한다.
6. 실제 컨테이너 이미지와 화면의 제품 버전이 manifest의 대상 버전과 일치한다.

릴리스 workflow는 기존 전체 통합 CI가 성공한 뒤 두 오프라인 번들을 생성·smoke test하고, 개별 #71 자산과 함께 같은 draft Release에 업로드한 후 공개한다. PR에서는 테스트 버전 번들로 게시 이전 경로를 모두 검증한다. 실제 태그 게시 검증은 병합 후 새 RC 태그에서 수행하고 실행 기록을 #88 완료 근거로 남긴다.

## 완료 판단

PR에서는 번들 계약 테스트, 두 변형의 최초 설치, 두 테스트 버전 업데이트, migration 전 실패 복구, migration 이후 DB 백업 복원, 대표 수집·조회와 기존 전체 CI가 모두 성공해야 한다. 병합 후에는 새 RC 태그로 실제 Release에 두 번들이 게시되고 다운로드한 자산으로 같은 검증이 재현되는지 확인한다.
