## 1. 선행 계약과 실행 모델

- [ ] 1.1 외부 runtime registry가 활성 수집 대상과 비밀 제외 결정적 설정 revision을 제공하도록 선행 loader 계약을 연결하고 같은 내용·다른 경로와 변경된 내용의 revision 테스트를 통과시킨다.
- [ ] 1.2 수동 CLI가 사용하는 공통 collection-engine의 full 실행 진입점, 대상 키, trigger, 상태·오류 결과 타입을 정리하고 CLI 회귀 테스트로 API와 독립적인 재사용 경계를 확인한다.
- [ ] 1.3 대상별 collector→transform→검증→묶음 upsert→checkpoint 경로가 idempotent하며 저장 실패 시 checkpoint가 진행하지 않는 통합 테스트를 통과시킨다.

## 2. 실행 이력과 DB 실행권

- [ ] 2.1 `collection_runs`, 대상 실행 및 coordination lease를 위한 additive PostgreSQL·MySQL migration과 공통 storage-adapter 타입을 추가하고 양쪽 빈 DB migration 테스트를 통과시킨다.
- [ ] 2.2 상위·대상 실행 등록, 상태 집계, 비밀정보 없는 오류·건수·시각·revision·checkpoint 조회와 최종화를 구현하고 success·partial·failed·skipped 상태 전이 계약 테스트를 통과시킨다.
- [ ] 2.3 DB clock 기반 acquire·renew·release와 단조 generation fencing을 양쪽 어댑터에 구현하고 동시 acquire에서 단일 승자, lease 만료 회수 및 owner 불일치 거부 테스트를 통과시킨다.
- [ ] 2.4 묶음 upsert와 checkpoint 확정에 owner token·generation 조건을 적용하고 lease를 잃은 이전 실행의 늦은 저장·최종화가 양쪽 DB에서 거부되는 계약 테스트를 통과시킨다.

## 3. 공통 전체 수집 orchestration

- [ ] 3.1 활성 대상이 없으면 run을 만들지 않고, 대상이 있으면 상위·대상 run을 등록한 뒤 제한된 동시성으로 실행하는 공통 요청 서비스를 구현해 빈 registry와 다중 대상 단위 테스트를 통과시킨다.
- [ ] 3.2 동일 대상·범위의 실행권 경쟁을 기존 실행 참조가 있는 skipped 결과로 처리하고 서로 다른 대상은 독립 실행되는 동시성 테스트를 통과시킨다.
- [ ] 3.3 대상별 오류를 격리해 나머지 수집을 계속하고 모든 대상 종료 후 상위 상태를 idempotent하게 집계하여 전체 성공·일부 실패·전체 실패·레코드 격리 시나리오를 검증한다.
- [ ] 3.4 lease heartbeat와 AbortSignal을 원천 요청·transform·저장에 연결하고 정상 종료, lease 상실, 강제 중단 뒤 만료 회수에서 미완료 실행을 성공으로 기록하지 않는 fake-clock 및 프로세스 테스트를 통과시킨다.

## 4. API 기동과 상태 조회

- [ ] 4.1 NestJS bootstrap에 DB 연결·registry 검증·기동 run 등록 후 listen하고 실제 수집을 비동기로 시작하는 lifecycle을 연결해 등록 실패 시 listen 전 종료와 느린 원천에서 빠른 health 응답을 프로세스 테스트로 확인한다.
- [ ] 4.2 최초 실행과 성공·실패 이력이 있는 재시작마다 활성 대상 full 수집이 요청되고 누락 일정 검사를 하지 않는지 프로세스 테스트로 확인한다.
- [ ] 4.3 API 종료 hook에서 로컬 실행을 취소·정리하고 강제 종료 후 새 인스턴스가 만료된 실행권을 회수하는 재시작 테스트를 통과시킨다.
- [ ] 4.4 원천에 접근하지 않는 읽기 전용 수집 상태 API를 추가해 uncollected·running·success·partial·failed·skipped, revision, 시작·종료 시각과 비밀정보 없는 오류 응답 계약 테스트를 통과시킨다.
- [ ] 4.5 수집 중 원천을 중단해도 기존 플랫폼 DB 목록·상세와 health·상태 조회가 계속 응답하고 실패 대상의 이전 데이터·checkpoint가 보존되는 통합 테스트를 통과시킨다.

## 5. PostgreSQL·MySQL 및 Docker 검증

- [ ] 5.1 Testcontainers로 같은 최초 기동·재기동·동시 두 인스턴스·수동 full 중복·lease 만료·늦은 결과 시나리오를 PostgreSQL과 MySQL에 실행해 공통 계약을 확인한다.
- [ ] 5.2 외부 자격증명 없는 mock 원천과 빈/다중 registry Docker fixture를 추가하고 Compose 최초 기동, 수집 중 조회, 일부 실패 격리, 재기동 전체 수집 및 컨테이너 정리를 자동 검증한다.
- [ ] 5.3 `.github/workflows/integration-ci.yaml`의 Docker 빌드 및 실행 job에 새 workspace·migration·기동 수집 검증을 연결하고 기존 workspace 격리, web, API, mock Docker 검사를 모두 통과시킨다.
- [ ] 5.4 수동 CLI와 기동 수집의 공통 동작, 상태 API, 설정 revision, 다중 인스턴스 실행권, 종료·복구와 운영상 한계를 서버·플러그인 문서에 반영하고 깨끗한 임시 환경에서 문서 명령을 재현한다.
- [ ] 5.5 전체 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, 프로세스 검사, Docker CI 명령과 `openspec validate add-startup-full-collection --strict`를 실행해 모두 통과시킨다.
