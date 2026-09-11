# 공통 collection runner

`@oss-scp/collection-engine`의 `runCollection`은 수집 방식과 실행 진입점에 독립적으로 collector, 플러그인 transform과 `RecordStorage`를 연결한다. CLI, NestJS API와 후속 worker는 이 함수를 호출하는 진입점만 제공하고 수집·가공·저장 순서를 다시 구현하지 않는다.

## 실행 순서

1. 실행 범위의 저장된 checkpoint를 `RecordStorage.getCheckpoint`로 읽는다.
2. 배포에 포함된 transform 모듈을 로드한다.
3. `RecordStorage.startRun`으로 실행 이력을 시작한다.
4. collector에 checkpoint와 동일한 `AbortSignal`을 전달한다.
5. collector가 전달한 한 묶음을 가공·검증하고 정상 레코드, 관계와 격리 오류를 모은다.
6. 한 번의 `RecordStorage.commitBatch`로 결과와 다음 checkpoint를 원자적으로 확정한다.
7. commit 완료 후에만 다음 collector 묶음을 처리한다.
8. 격리 오류가 없으면 `success`, 있으면 `partial`로 실행을 종료한다. 실행 전체 오류와 취소는 `failed`로 기록한다.

```typescript
import {
  runCollection,
  type CollectionCollector,
} from '@oss-scp/collection-engine';

const collector: CollectionCollector = async ({ checkpoint, signal }, onBatch) => {
  // source 고유 로직은 opaque checkpoint를 해석하고 제한된 묶음을 만든다.
  const page = await readSourcePage(checkpoint, signal);
  await onBatch({
    records: page.items,
    startCheckpoint: checkpoint,
    nextCheckpoint: page.nextCheckpoint,
    collectedAt: new Date().toISOString(),
    responseMetadata: page.metadata,
  });
  // onBatch가 resolve된 시점에는 데이터와 nextCheckpoint 저장이 완료되었다.
};

const result = await runCollection({
  plugin,
  scope,
  collector,
  storage,
  signal,
});
```

## Collector 계약

- checkpoint는 runner가 해석하지 않는 JSON 값이다. `null`은 저장된 재개 위치가 없다는 뜻이며 `nextCheckpoint`는 `null`일 수 없다.
- 각 묶음의 `startCheckpoint`는 직전 저장 checkpoint와 같아야 한다. 불연속 묶음은 `collection` 오류로 거부한다.
- collector는 `onBatch` Promise를 반드시 기다려야 한다. 이를 통해 느린 storage consumer가 다음 원천 요청에 backpressure를 건다.
- 한 collector 묶음은 checkpoint 원자 단위다. 가공 후 레코드·관계·격리 오류가 기존 storage 제한 안에 들도록 입력 크기를 제한한다.
- 원천 페이지보다 작은 재개 단위가 필요하면 collector 어댑터가 재현 가능한 세부 checkpoint를 정의한다. runner는 저장 전에 묶음을 나누거나 checkpoint를 앞당기지 않는다.
- handler에서 반환된 runner 오류는 감싸거나 원천 오류로 바꾸지 않고 그대로 전파해야 저장·취소 단계가 보존된다.

## 오류와 취소

공개 오류는 `module_load`, `collection`, `transform_consumer`, `storage`, `cancelled` 코드만 제공한다. 하위 예외 메시지, 원천 응답, Connection 비밀과 DB driver 오류는 복사하지 않는다. 개별 원천 레코드의 transform·검증 오류는 제한된 issue로 저장하고 실행을 계속한다.

같은 AbortSignal을 collector와 transform에 전달한다. 취소 후에는 새 요청·가공·저장을 시작하지 않는다. 이미 시작한 storage commit은 `RecordStorage`에 물리적 취소 계약이 없으므로 완료를 기다린 뒤 후속 처리를 중단한다.

## 현재 제외 범위

HTTP offset/single 및 CSV 어댑터, 수동 CLI, NestJS 실행 API, 스케줄러, Redis와 worker는 후속 작업이다. 이 runner는 원천 부재 판정, 자동 보관, 재시도와 동시 실행 잠금을 수행하지 않는다.

## 검증

```bash
pnpm build:plugin-transforms
pnpm --filter @oss-scp/csv-reader build
pnpm --filter @oss-scp/collection-engine test
pnpm typecheck
pnpm lint
pnpm test
```

workspace CI의 `pnpm test`가 runner의 성공·부분 성공·실패·취소·checkpoint·backpressure·다수 묶음 회귀 테스트를 실행한다.
