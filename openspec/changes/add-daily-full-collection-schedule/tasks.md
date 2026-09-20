## 1. 설정과 일정 계산

- [x] 1.1 외부 설정 loader에 엄격한 `collection.schedule` schema와 비활성/default/custom 검증을 추가하고 API 설정 단위 테스트로 생략, 잘못된 키·타입·시간·timezone, 기본값을 확인한다.
- [x] 1.2 다음 현지 실행 instant 계산기를 구현하고 fake clock 단위 테스트로 일반 날짜, timezone 경계, DST gap의 첫 유효 instant, overlap의 첫 instant, 하루 한 번 동작을 확인한다.

## 2. 영속 실행 metadata와 trigger

- [x] 2.1 공통 storage 계약과 collector CLI/process 인자에 `scheduled` trigger, 예정 UTC instant, IANA timezone을 추가하고 잘못된 조합이 거부되는 단위 테스트를 통과시킨다.
- [x] 2.2 PostgreSQL migration과 adapter를 확장하고 실제 PostgreSQL 계약 테스트로 기존 trigger 호환성, scheduled metadata, 실행 결과와 마지막 성공 조회를 확인한다.
- [x] 2.3 MySQL migration과 adapter를 확장하고 실제 MySQL 계약 테스트로 PostgreSQL과 같은 scheduled 실행 의미를 확인한다.
- [x] 2.4 migration 개수를 검증하는 Docker/release fixture를 새 version과 맞추고 migration 검증 스크립트를 통과시킨다.

## 3. API scheduler와 수집 lifecycle

- [x] 3.1 기존 startup process 경계를 재사용하는 scheduled collection 서비스를 구현하고 예정 시각마다 활성 저장형 대상만 독립적으로 spawn하는 테스트를 통과시킨다.
- [x] 3.2 API 기동/종료 lifecycle에 scheduler를 연결하고 테스트로 비활성화, 빈/live-only registry, 재시작 시 no catch-up, timer 취소와 자식 취소 전달을 확인한다.
- [x] 3.3 대상별 spawn/runtime 실패 격리와 scheduled 대 startup·CLI·API·다중 인스턴스 lease 충돌을 자동 테스트해 하나의 대상만 데이터를 확정함을 확인한다.
- [x] 3.4 실패·partial scheduled 수집 뒤 기존 source 데이터, checkpoint와 플랫폼 소유 담당자·수동 상태가 보존되는 회귀 테스트를 통과시킨다.

## 4. 배포와 문서

- [x] 4.1 외부 설정 fixture와 Docker/Compose smoke 검증에 schedule 주입 및 timezone 실행 증거를 추가하고 관련 Docker 테스트를 통과시킨다.
- [x] 4.2 서버·platform DB 운영 문서와 개발 계획에 설정 예시, 기본값, 비활성 범위, 재시작 적용, DST와 누락 일정 규칙을 기록하고 문서 링크/예시를 검토한다.

## 5. 전체 검증

- [x] 5.1 API, collector CLI, platform DB focused 테스트와 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`를 통과시킨다.
- [x] 5.2 `openspec validate add-daily-full-collection-schedule --strict`와 관련 process/Docker 통합 검증을 통과시키고 모든 acceptance scenario에 자동 또는 명시적 smoke 근거가 있는지 확인한다.
