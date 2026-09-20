## 1. 원인 재현 및 측정 경계 분리

- [x] 1.1 기존 Node.js 24.19.0 메모리 worker를 실행해 약 8.34 MiB 보관 현상과 응답 payload 크기의 관계를 기록하고, 수정 전 회귀 검사가 실패하는지 확인한다.
- [x] 1.2 loopback 응답 생성 서버를 collector 메모리 측정 프로세스에서 분리하고, 하위 프로세스 종료 상태와 구조화된 측정 출력을 검사하는 자동 테스트로 격리를 검증한다.
- [x] 1.3 warm-up 및 복수 GC/event-loop turn 뒤 작은 입력과 큰 입력을 독립 실행으로 측정하도록 worker를 수정하고, 반복 실행에서 측정값이 안정적으로 수집되는지 확인한다.

## 2. 제한 보관 회귀 검증

- [x] 2.1 큰 입력의 완료 후 보관량이 원천 응답 크기에 비례하지 않음을 검출하는 회귀 assertion을 추가하고, 전체 응답 참조를 의도적으로 보관하는 진단 변형에는 실패하는지 확인한다.
- [x] 2.2 격리된 측정에서 제품 참조 보관이 입증되는 경우에만 `collectHttpSingle`의 해당 참조 경로를 제거하고, 제품 코드 수정 유무와 약 8.34 MiB의 근본 원인을 테스트 또는 변경 기록에 남긴다.

## 3. 검증

- [x] 3.1 Node.js 24.19.0에서 `pnpm --filter @oss-scp/http-collector test`를 반복 실행해 모두 통과하는지 확인한다.
- [x] 3.2 Node.js 24.19.0에서 `pnpm test`, `pnpm typecheck`, `pnpm lint`를 실행해 워크스페이스 회귀가 없는지 확인한다.
- [x] 3.3 `openspec validate fix-http-single-memory-retention-test --strict`와 `git diff --check`를 실행해 계획·변경 산출물을 검증한다.
