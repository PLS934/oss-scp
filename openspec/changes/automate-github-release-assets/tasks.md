## 1. 릴리스 메타데이터 계약

- [ ] 1.1 태그를 제품 버전과 prerelease 여부로 변환하는 순수 도구를 구현하고 안정 버전·RC·0.x·잘못된 형식 단위 테스트가 통과하는지 확인한다.
- [ ] 1.2 API·웹 Dockerfile에 제품 버전·Git revision·source OCI label 입력을 추가하고 두 테스트 이미지의 `docker image inspect` 결과가 기대값과 일치하는지 확인한다.

## 2. 배포 자산 생성

- [ ] 2.1 개발용 build·mock을 제외하고 `OSS_SCP_VERSION` 하나로 API·웹을 선택하는 배포 Compose template과 비밀값 없는 환경 예시를 추가하며 구조 검사에서 읽기 전용 설정 mount와 DB volume이 확인되는지 검증한다.
- [ ] 2.2 API·웹 image archive, 버전별 Compose·환경 예시와 정렬된 `SHA256SUMS`를 생성하는 로컬 스크립트를 구현하고 0.1.0 파일명·내용·checksum 계약 테스트가 통과하는지 확인한다.
- [ ] 2.3 생성 스크립트가 잘못된 버전·revision, label 불일치, 기존 또는 불완전 output에서 안전하게 실패하고 기존 자산을 덮어쓰지 않는지 회귀 테스트로 확인한다.

## 3. 설치·업데이트 회귀 검증

- [ ] 3.1 생성 자산의 checksum 확인과 `docker load` 후 배포 Compose로 PostgreSQL·API·웹을 기동하고 이미지 내부 migration CLI, health·ready 검사가 소스 빌드 없이 성공하는 smoke test를 추가한다.
- [ ] 3.2 서로 다른 두 테스트 제품 버전 사이에서 `OSS_SCP_VERSION`만 바꿔 업데이트하고 migration 이력·저장 데이터·DB volume·외부 설정 경로가 유지되는지 자동 검증한다.
- [ ] 3.3 동일 이미지의 플러그인 revision 교체 전후 image ID를 비교하고 호환되지 않는 revision의 사전 거부와 이전 이미지·설정 조합 복구를 검증하도록 기존 Docker 검사를 재사용 또는 보강한다.

## 4. GitHub Actions 게시 경로

- [ ] 4.1 기존 통합 CI에 `workflow_call`을 추가하고 PR·main push·수동 trigger 및 네 검증 job이 유지되는지 workflow 구문과 기존 CI 실행으로 확인한다.
- [ ] 4.2 `v*` 태그에서 메타데이터 검증, 재사용 통합 CI, 자산 생성·smoke test 순서로 실행하는 release workflow를 추가하고 게시 전 단계가 PR에서 검증 가능한지 확인한다.
- [ ] 4.3 게시 job에만 `contents: write`를 부여하고 동일 태그 Release 존재 시 실패, draft 자산 업로드 완료 후 prerelease 또는 정식 공개가 되도록 구현하며 workflow 정적 검사와 테스트용 태그 실행 기록으로 확인한다.
- [ ] 4.4 Release 본문에 제품 버전, 전체 Git revision, API·웹 image digest, 지원 환경, migration 주의사항과 알려진 제한이 포함되는지 생성 결과를 검증한다.

## 5. 운영 문서와 전체 확인

- [ ] 5.1 checksum 검증, image load, 외부 설정 준비, 명시적 migration, 최초 기동, 업데이트, 플러그인 교체, 이미지 롤백과 DB 백업 복원 조건을 실행 명령과 함께 문서화하고 링크·명령을 검토한다.
- [ ] 5.2 #71 개별 자산과 #88 단일 폐쇄망 번들의 경계, 0.x·RC prerelease 정책과 기존 Release 비덮어쓰기 정책을 릴리스 문서에 반영하고 OpenSpec 요구사항과 대조한다.
- [ ] 5.3 태그·자산 단위 테스트, 설치·업데이트 Docker smoke test와 기존 typecheck·lint·test·build 및 전체 통합 CI를 실행해 모두 성공하는지 확인한다.
