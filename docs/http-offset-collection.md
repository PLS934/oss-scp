# HTTP offset 수집

`@oss-scp/http-collector`는 검증된 offset source 내부 정의를 사용해 JSON HTTP API를 묶음 단위로 읽습니다. NestJS, 플랫폼 DB와 독립적이므로 테스트·CLI·후속 worker에서 같은 함수를 사용할 수 있습니다.

## 설정 한도

offset 방식의 `source.json`에는 다음 한도를 명시합니다.

```json
{
  "limits": {
    "timeoutMs": 5000,
    "maxResponseBytes": 2097152,
    "maxRecordBytes": 262144
  }
}
```

- `timeoutMs`: 각 HTTP 요청과 응답 본문 수신 제한, 100~300,000ms
- `maxResponseBytes`: 압축 해제 후 실제 응답 본문 제한, 1KiB~100MiB
- `maxRecordBytes`: `JSON.stringify`로 재직렬화한 단일 항목의 UTF-8 크기 제한, 1byte~100MiB
- `maxRecordBytes`는 `maxResponseBytes`보다 클 수 없습니다.

sample1은 5초, 응답 2MiB, 레코드 256KiB를 사용합니다. 한도는 암묵적으로 적용하지 않으며 Git에 저장된 source 설정을 검증합니다.

## API와 처리 경계

```ts
import { collectHttpOffset } from '@oss-scp/http-collector';

const summary = await collectHttpOffset(definition, async (batch) => {
  // 후속 단계: 가공 → 공통 검증 → DB 저장 → checkpoint 확정
  // batch.signal이 취소되면 진행 중인 처리를 협력적으로 중단합니다.
  await processAndCommit(batch.items, batch.signal);
}, { signal });
```

callback이 성공한 뒤에만 다음 offset을 요청합니다. 수집기는 완료한 묶음이나 전체 원천 데이터를 누적하지 않고 `pages`, `records`, `total` 요약만 반환합니다. 첫 응답이 `total: 0`과 빈 목록이면 callback 없이 정상 완료합니다.

최초 `total`은 실행 중 고정됩니다. 각 페이지는 `min(limit, total - offset)`건이어야 하며, 조기 빈 목록·건수 불일치·후속 total 변경은 실패합니다. 마지막 부분 묶음을 처리해 누적 offset이 total에 도달하면 불필요한 빈 페이지를 추가 요청하지 않습니다.

offset 기반 수집 중 원천의 순서가 바뀌면 total이 같아도 중복이나 누락이 생길 수 있습니다. 실제 연동에서는 안정적인 정렬 또는 snapshot 지원을 별도로 확인해야 합니다.

## 오류와 취소

`HttpCollectorError.code`는 다음 값을 제공합니다.

- `http_status`, `timeout`, `cancelled`
- `response_too_large`, `record_too_large`
- `invalid_json`, `invalid_response`
- `total_changed`, `count_mismatch`, `processing`

실패하면 현재 묶음을 전달하지 않거나, 처리 실패 시 다음 요청을 시작하지 않습니다. 오류 메시지는 요청 origin·pathname·offset만 포함하며 기존 query, 응답 본문, header와 Connection 원문을 포함하지 않습니다. 호출자가 취소하면 요청과 본문 읽기를 중단하고 동일한 signal을 callback에 전달합니다. callback이 signal을 무시하는 경우에는 callback 완료를 기다리지만 후속 요청은 수행하지 않습니다.

## 검증

Node.js 24와 pnpm 10을 사용해 저장소 루트에서 실행합니다.

```sh
pnpm install --frozen-lockfile
pnpm test:http-collector
pnpm validate:plugins
```

수집 테스트는 외부 자격증명 없이 실제 loopback HTTP 서버를 시작해 sample1의 72건, 다른 경로·query·응답 구조, chunked/gzip 크기 제한, 오류·timeout·취소와 역압력을 검증합니다. 메모리 검사는 `node --expose-gc` 격리 프로세스에서 5페이지와 50페이지를 비교하며, 큰 실행의 peak heap 증가분이 작은 실행의 2배 또는 16MiB 여유 중 큰 기준을 넘지 않는지 확인합니다.
