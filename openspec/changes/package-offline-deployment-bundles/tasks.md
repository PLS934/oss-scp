## 1. 번들 계약과 생성 입력

- [x] 1.1 두 번들의 manifest schema와 parser를 구현하고 schema version, 제품 버전, Git revision, 변형, 지원 환경·DB와 image reference·digest의 정상·오류 단위 테스트를 통과시킨다.
- [x] 1.2 기존 DB와 PostgreSQL 포함 Compose template을 추가하고 build·mock 부재, `pull_policy: never`, 고정 이미지, 읽기 전용 설정 mount와 변형별 DB service·volume 계약을 구조 테스트로 확인한다.
- [x] 1.3 변형별 비밀값 없는 환경 예시와 내부 파일 목록을 정의하고 비밀번호·토큰·운영자 플러그인·Connection·TypeScript·`.tsx`가 포함되지 않는지 자동 검사한다.

## 2. 오프라인 번들 생성

- [x] 2.1 #71 출력의 API·웹 archive를 load하고 제품 버전·Git revision·digest를 재검증한 뒤 단일 `images.tar`를 만드는 생성기를 구현하고 잘못된 조합을 거부하는 테스트를 추가한다.
- [x] 2.2 PostgreSQL 17.6 이미지를 OCI digest로 고정하고 `-postgresql` 변형에만 추가하며 기본 번들에는 DB 이미지가 없음을 image manifest 검사로 확인한다.
- [x] 2.3 Compose, manifest, 환경 예시, 실행 스크립트와 문서를 모아 내부 `SHA256SUMS`를 생성하고 `oss-scp-bundle-<version>.tar.gz` 및 `oss-scp-bundle-<version>-postgresql.tar.gz`를 결정적으로 패키징하는 테스트를 통과시킨다.
- [x] 2.4 기존·부분 출력, 변경된 파일, 잘못된 version·revision·digest에서 최종 자산을 덮어쓰거나 남기지 않고 실패하는 회귀 테스트를 추가한다.

## 3. 설치·업데이트·복구 도구

- [x] 3.1 checksum, manifest, Docker image, 외부 설정, DB 연결, migration, Compose recreate와 상태 확인 단계를 공유하는 shell library를 구현하고 단계별 실패 코드·비밀정보 비노출 테스트를 통과시킨다.
- [x] 3.2 `install.sh`가 기존 DB 사전 조건 또는 포함 PostgreSQL ready를 확인하고 명시적 migration 후 `--pull never`로 API·웹을 기동하며 실제 version·revision·health·ready를 검증하는 smoke test를 통과시킨다.
- [x] 3.3 `update.sh`가 운영자 백업 확인, 새 번들·설정 사전 검증, image load, migration, 강제 재생성과 실제 적용 버전 검사를 순서대로 수행하고 기존 DB 데이터·volume·설정 경로를 보존하는 테스트를 통과시킨다.
- [x] 3.4 `rollback.sh`가 migration 전 실패에서는 현재 배포를 유지하고 migration 이후에는 자동 롤백을 거부하며 DB 복원 확인과 이전 번들·설정이 있을 때만 재기동하는 회귀 테스트를 통과시킨다.
- [x] 3.5 `verify.sh`가 컨테이너 image ID·version·revision, API health·ready, 웹 응답과 선택적 핵심 조회 실패를 구분해 반환하는 테스트를 추가한다.

## 4. 폐쇄망과 DB 복원 통합 검증

- [ ] 4.1 대상 이미지를 제거한 깨끗한 Docker 상태에서 기본 번들만 load하고 별도 fixture 설정과 PostgreSQL 17.6 기존 DB로 migration·기동·대표 수집·저장 목록·상세 조회가 성공하는지 검증한다.
- [x] 4.2 PostgreSQL 포함 번들만으로 Registry pull 없이 DB volume·migration·API·웹을 최초 설치하고 화면 제품 버전이 manifest와 일치하는지 검증한다.
- [ ] 4.3 서로 다른 두 테스트 버전 번들로 업데이트해 PostgreSQL·MySQL 각각의 데이터와 migration 이력·외부 설정 경로가 유지되는지 검증한다.
- [ ] 4.4 migration 전 의도적 실패에서 현재 컨테이너·버전이 유지되고, migration 이후 의도적 실패에서는 PostgreSQL·MySQL 표준 backup·restore 뒤 이전 이미지·설정 조합이 복구되는지 검증한다.

## 5. 릴리스 자동화와 운영 문서

- [x] 5.1 릴리스 workflow가 기존 전체 CI 뒤 개별 자산을 입력으로 두 번들을 생성·검증하고 같은 draft에 모두 업로드한 후에만 공개하도록 수정하며 최소 `contents: write` 권한과 자산 목록을 정적 검사한다.
- [x] 5.2 기존 DB와 PostgreSQL 포함 번들의 선택 기준, 빈 database·계정·권한, 최초 migration, 설정 반입, 업데이트와 실패 단계별 복구를 실행 명령으로 문서화하고 README·개발 workflow 링크를 검토한다.
- [x] 5.3 PostgreSQL·MySQL 표준 백업·복원 예시, GitHub asset digest와 내부 `SHA256SUMS`의 역할, DB·비밀·플러그인·`.tsx` 책임 경계를 문서와 manifest 설명에 반영하고 OpenSpec과 대조한다.

## 6. 전체 확인과 실제 게시

- [ ] 6.1 번들 단위·계약 테스트와 모든 Docker 설치·업데이트·복구 smoke test 및 기존 typecheck·lint·test·build·통합 CI를 실행해 성공 결과를 확인한다.
- [ ] 6.2 병합 후 새 RC 태그에서 두 번들이 prerelease에 게시되고 개별 자산과 API·웹 digest가 일치하며 다운로드한 번들의 checksum·최초 설치·업데이트·복구가 재현되는 실행 기록을 남긴다.
