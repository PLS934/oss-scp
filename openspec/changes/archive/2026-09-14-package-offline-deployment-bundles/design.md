## Context

#71은 태그 commit에서 API·웹 이미지를 빌드·검증하고 개별 archive, PostgreSQL Compose, 환경 예시와 checksum을 불변 GitHub Release에 게시한다. #88은 이 동일 이미지 조합을 Registry가 없는 단일 서버로 한 번에 반입하는 계층이며, 승인된 상세 설계는 `docs/superpowers/specs/2026-09-13-offline-bundle-design.md`에 있다.

현재 API 이미지는 PostgreSQL·MySQL migration CLI와 설정 검증 코드를 포함하고, 웹 이미지는 공통 React 화면과 제품 버전을 포함한다. 플러그인 화면은 선언형 메뉴·목록·상세 계약이며 사용자 정의 `.tsx`는 런타임 확장점이 아니다.

## Goals / Non-Goals

**Goals:**

- #71의 API·웹 archive를 재빌드하지 않고 두 폐쇄망 번들의 공통 입력으로 사용한다.
- 기존 DB와 PostgreSQL 포함 설치를 별도 자산으로 구분하되 같은 스크립트 계약과 검증 단계를 유지한다.
- migration 전후 실패 경계를 보수적으로 유지하고 실제 적용 이미지와 상태를 확인한다.
- 번들 생성과 설치·업데이트·복구를 PR Docker test에서 재현한다.

**Non-Goals:**

- DB 서버·database·계정·권한 또는 운영 비밀정보를 자동 생성하지 않는다.
- 운영 DB 백업·복원과 down migration을 자동화하지 않는다.
- 운영자 플러그인·Connection, TypeScript 원본이나 사용자 정의 React 화면을 배포하지 않는다.
- Registry, Kubernetes·Helm, 다중 서버와 무중단 배포를 지원하지 않는다.

## Decisions

### 두 개의 명시적 번들을 제공한다

기본 `oss-scp-bundle-<version>.tar.gz`는 API·웹만 포함하고 기존 PostgreSQL·MySQL에 연결한다. `-postgresql` 변형만 고정 PostgreSQL 이미지를 포함한다. 모든 사용자에게 큰 DB 이미지를 전달하는 단일 범용 번들보다 용량과 관리 책임이 명확하고, `external-db` 같은 이름이 원격 DB로 오해되는 문제를 피한다.

### 개별 archive를 load한 뒤 하나의 images.tar로 다시 저장한다

번들 생성기는 #71 출력의 API·웹 archive를 load하고 label을 재검증한 후 `docker save` 한 번으로 합친다. 이미지를 다시 build하는 대안은 개별 자산과 번들의 digest가 달라질 위험이 있어 사용하지 않는다. PostgreSQL 변형은 지원 tag와 digest로 고정한 공식 이미지를 CI의 온라인 생성 단계에서 준비한다.

### manifest를 기계 판독 가능한 배포 계약으로 사용한다

JSON manifest는 schema version, 제품 버전, Git revision, 변형, 지원 환경과 image reference·digest를 가진다. 생성기와 스크립트가 같은 parser를 사용해 문자열 치환의 불일치를 막는다. 내부 checksum은 압축 해제 후 전달된 묶음을 검증하고 GitHub asset digest는 바깥 `.tar.gz`를 검증한다.

### Compose와 스크립트는 번들 디렉터리에 상대적으로 동작한다

두 Compose template은 build와 mock을 제거하고 `pull_policy: never`로 Registry 접근을 금지한다. 스크립트는 실행 위치와 무관하게 자신의 디렉터리를 기준으로 manifest·Compose·환경 파일을 찾으며, 외부 설정은 운영자가 제공한 절대 경로만 읽기 전용으로 마운트한다.

### 단계별 명령은 공유 라이브러리를 사용한다

`install.sh`, `update.sh`, `rollback.sh`, `verify.sh`는 사용자 진입점으로 유지하되 checksum, manifest, Docker, 설정, DB, migration, recreate, 상태 확인 로직은 하나의 내부 shell library에서 공유한다. 단일 거대 스크립트의 mode 분기보다 사용자 목적이 명확하고, 네 파일의 중복 구현보다 실패 처리 일관성이 높다.

### DB 수명 주기와 데이터 보호는 운영자 책임으로 유지한다

기본 번들은 전용 빈 database와 migration 계정을 사전 조건으로 요구하고 API 이미지의 CLI로 schema만 생성한다. PostgreSQL 변형은 Compose가 DB container·volume만 관리한다. 업데이트는 운영자가 표준 도구로 백업했음을 명시적으로 확인하지만 스크립트가 백업 파일을 만들거나 복원하지 않는다. CI는 PostgreSQL과 MySQL의 표준 backup·restore 명령을 실행해 문서 계약을 검증한다.

### migration 전후를 복구 경계로 삼는다

Checksum·manifest·설정·DB 연결 검사는 migration 전에 끝내고 이 구간 실패는 현재 컨테이너를 건드리지 않는다. Migration이 시작된 뒤 실패하면 schema 호환성을 추측해 이전 이미지를 자동 실행하지 않는다. 운영자가 백업을 복원한 뒤 `rollback.sh`에 복원 완료와 이전 번들을 명시해야 이전 조합을 재생성한다.

### 릴리스 게시 job 안에서 생성·검증·업로드한다

기존 tag workflow의 전체 CI 이후 publish job이 개별 자산을 만든 다음 두 번들을 생성하고 smoke test한다. 모든 파일이 준비된 뒤 한 draft Release에 함께 업로드하므로 부분 공개를 막는다. PR에서는 두 테스트 버전으로 동일 경로를 검증하고 실제 게시는 병합 후 새 RC 태그에서 확인한다.

## Risks / Trade-offs

- [API·웹과 PostgreSQL을 합친 자산이 커져 Release 업로드 시간이 늘어난다] → 두 변형을 분리하고 gzip 결과 크기와 job timeout을 관찰한다.
- [공식 PostgreSQL tag가 이동하면 재생성 결과가 달라진다] → 생성 입력과 manifest에 OCI digest를 고정하고 불일치 시 실패한다.
- [사용자의 Docker daemon에 같은 tag의 다른 이미지가 남아 있을 수 있다] → load 후 image ID·OCI label·manifest digest를 모두 대조한다.
- [기존 DB 백업 완료 확인은 실제 백업 품질을 보장하지 않는다] → 자동 백업을 가장하지 않고 제품별 복원 검증 명령과 운영자 책임을 문서화한다.
- [Migration 이후 자동 롤백 부재로 복구가 수동이다] → 데이터 손상을 피하는 보수적 경계이며 CI에서 백업 복원 후 이전 조합을 검증한다.
- [두 버전·두 DB·두 변형 검증이 Docker CI를 늘린다] → 공통 이미지 build 결과를 재사용하고 중복하지 않는 최소 시나리오로 구성한다.

## Migration Plan

1. Manifest schema, 두 Compose template과 번들 파일 계약을 추가한다.
2. #71 출력 디렉터리를 입력으로 두 번들을 만드는 로컬 생성기를 구현한다.
3. 공통 shell library와 설치·업데이트·롤백·검증 진입점을 구현한다.
4. 기존 DB와 PostgreSQL 포함 최초 설치, 업데이트와 실패 복구 smoke test를 추가한다.
5. PostgreSQL·MySQL 백업·복원과 운영 설정 반입 문서를 추가한다.
6. 릴리스 workflow와 Release 본문을 두 새 자산 및 digest 정보로 확장한다.
7. PR 전체 CI 후 병합하고 새 RC 태그에서 실제 게시와 다운로드 자산을 검증한다.

이미 공개된 Release나 태그는 수정하지 않는다. 문제가 발견되면 새 commit과 새 RC 태그로 다시 검증한다.
