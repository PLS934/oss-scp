# 플러그인 데이터 가공 실행 및 결과 검증 설계

## 목적

Git에 등록되고 빌드된 플러그인의 가공 코드를 실행해 원천 레코드를 플랫폼 데이터 정의에 맞는 레코드와 관계로 변환한다. 모든 결과는 공통 검증을 통과한 뒤에만 저장 경계로 전달한다. 이 설계는 GitHub 이슈 #41의 범위를 다룬다.

실제 PostgreSQL·MySQL 저장, migration, upsert, checkpoint 영속화와 조회 API·화면은 포함하지 않는다.

## 운영 및 신뢰 경계

플러그인은 서비스 운영자가 Git PR로 검토하고 플랫폼과 함께 빌드·배포하는 신뢰 코드다. 런타임에 외부 사용자가 코드를 업로드하거나 문자열을 평가하지 않는다.

TypeScript 가공 코드는 빌드 시 JavaScript로 변환한다. 런타임은 등록·검증된 플러그인 디렉터리 안의 JavaScript 모듈만 Node.js `import()`로 불러온다. 이번 구현은 같은 프로세스에서 실행하므로 비신뢰 코드 샌드박스와 동기 무한 루프의 강제 종료를 보장하지 않는다. 강제 격리가 필요하면 후속 worker thread 또는 별도 프로세스 실행기로 확장한다.

## 플러그인 정의

`plugin.json`은 다음 정보를 단일 원본으로 제공한다.

- 플러그인 식별자, 이름, 버전
- `source.json` 상대 경로
- 빌드된 가공 모듈의 상대 경로
- 데이터 종류별 필드, 타입, 필수 여부와 유일키
- 관계 종류와 양 끝의 허용 데이터 종류

가공 모듈 경로는 절대 경로를 허용하지 않고 플러그인 디렉터리 밖으로 벗어날 수 없다. 런타임 대상은 `.js` 파일이며 모듈은 이름이 고정된 `transform` 함수를 export해야 한다. 설정 로더는 파일 존재 여부, 데이터 정의, 유일키 필드 참조와 관계 정의를 실행 전에 검증한다.

초기 필드 타입은 개발 계획에 따라 `string`, `number`, `boolean`, `datetime`, `object`, `array`를 지원한다. `datetime` 결과는 유효한 ISO 8601 문자열로 정규화한다. 객체와 배열은 선언된 하위 스키마에 따라 재귀 검증하며 명세에서 정한 최대 깊이·요소 수·직렬화 크기를 적용한다.

## 공개 가공 계약

가공 함수는 원천 레코드 한 건마다 한 번 호출한다. 한 원천 레코드가 정규화된 레코드 여러 개와 관계 여러 개를 만들 수 있다.

```typescript
export interface TransformInput {
  record: unknown;
  context: Readonly<{
    pluginId: string;
    sourceId: string;
    collectedAt: string;
    responseMetadata?: Readonly<Record<string, unknown>>;
    signal: AbortSignal;
  }>;
}

export interface TransformRecord {
  type: string;
  values: Record<string, unknown>;
}

export interface RecordReference {
  type: string;
  key: string | number;
}

export interface TransformRelation {
  type: string;
  from: RecordReference;
  to: RecordReference;
}

export interface TransformOutput {
  records: TransformRecord[];
  relations?: TransformRelation[];
}

export type Transform = (
  input: TransformInput,
) => TransformOutput | Promise<TransformOutput>;
```

`context`는 읽기 전용이다. 서비스 운영 DB 객체, NestJS 객체, Connection 비밀, 원천 인증정보와 checkpoint를 전달하지 않는다. `responseMetadata`는 source 계약이 허용한 제한된 비레코드 응답 정보만 포함한다.

## 모듈 로딩

설정 로더가 안전하게 해석한 절대 파일 경로를 `pathToFileURL()`로 변환한 뒤 `import()`한다. 로더는 `transform` export가 함수인지 확인하고 플러그인별로 한 번만 로딩해 캐시한다. 레코드 처리 중에는 모듈을 다시 import하지 않는다.

개발 모드의 파일 변경 감지와 캐시 무효화는 이 작업에 포함하지 않는다. 새 배포 또는 프로세스 재시작 시 새 모듈을 로딩한다.

## 처리 흐름

```text
검증된 플러그인 정의와 수집 묶음
→ transform 모듈 로딩 또는 캐시 조회
→ 원천 레코드를 순서대로 하나씩 transform 호출
→ 반환 구조와 데이터 정의 공통 검증
→ 정상 출력은 제한된 저장 입력 묶음으로 전달
→ 실패한 원천 레코드의 출력 전체 격리 및 오류 기록
→ 다음 원천 레코드 계속 처리
→ 성공 또는 partial 처리 결과 반환
```

플랫폼은 전체 수집 결과를 누적하지 않는다. 저장 소비자의 처리가 완료된 다음에 다음 출력 묶음을 전달해 backpressure를 유지한다. 한 원천 레코드의 출력이 묶음 한도를 초과하면 그 원천 레코드를 격리한다.

## 결과 검증

공통 검증기는 가공 결과를 신뢰하지 않고 다음을 검사한다.

- 반환값과 `records`, `relations`의 구조
- 선언된 데이터 종류와 관계 종류만 사용했는지
- 필수 필드 존재 여부와 선언된 타입
- 알 수 없는 필드의 처리 규칙
- 유일키 필드의 존재, 허용 타입과 비어 있지 않은 값
- 같은 처리 범위에서의 중복 유일키
- 관계 양 끝이 유효한 데이터 종류와 키를 참조하는지
- 필드·레코드·관계 개수, 중첩 깊이, 요소 수와 직렬화 크기 제한

정확한 수치 제한은 sample1 fixture를 기준으로 OpenSpec에서 확정하고 설정 가능한 상한과 플랫폼의 절대 상한을 구분한다.

## 오류와 부분 완료

가공 함수 예외, Promise 거부, 취소, 잘못된 반환 구조와 결과 검증 실패는 해당 원천 레코드 단위로 격리한다. 한 원천 레코드가 만든 레코드나 관계 중 하나라도 실패하면 그 호출에서 생성된 출력 전체를 저장 경계에 전달하지 않는다. 이 원자성으로 부분 저장 때문에 관계가 끊어지는 것을 막는다.

다른 원천 레코드는 계속 처리한다. 하나 이상의 레코드가 격리되었고 실행 전체 오류가 없다면 처리 결과는 `partial`이다. 모듈 로딩 실패, 플러그인 정의 오류 또는 저장 소비자 실패처럼 실행을 계속할 수 없는 오류는 전체 실행을 중단한다.

오류에는 다음의 제한된 진단 정보만 기록한다.

- 플러그인 ID와 원천 레코드 순번
- 비밀이 아닌 유일키 후보가 안전하게 확인된 경우 제한된 식별 힌트
- 안정적인 오류 코드
- 가공 결과의 필드 경로
- 운영자를 위한 비민감 메시지

원천 레코드 전체, 비밀정보와 임의 객체 덤프를 오류에 포함하지 않는다.

`AbortSignal`을 가공 함수에 전달하고 호출 전후에 취소를 확인한다. 비동기 호출에는 제한 시간을 적용할 수 있지만 같은 프로세스에서 실행되는 동기 무한 루프를 강제로 중단할 수 없다는 제약을 문서화한다.

## 저장 경계

가공 실행기는 검증된 레코드·관계, 격리 오류 요약과 처리 상태를 DB 제품에 독립적인 묶음 인터페이스로 제공한다. #29는 이 인터페이스를 받아 데이터와 checkpoint를 트랜잭션으로 저장한다.

이번 작업은 DB에 직접 쓰지 않으며 PostgreSQL, MySQL, NestJS와 특정 HTTP·CSV 수집 방식에 의존하지 않는다. JSON API, 로컬 CSV와 HTTP CSV가 같은 가공 실행기를 사용할 수 있어야 한다.

## 첫 샘플

`sample1-offset-api` 플러그인에 데이터 정의와 `transform.ts` 예제를 추가한다. 샘플 가공 코드는 fixture의 원천 필드를 선언된 플랫폼 필드로 매핑하고 필요한 문자열 값을 업무 타입으로 변환한다. sample1의 필드명과 72건이라는 개수는 공통 로더·실행기·검증기에 하드코딩하지 않는다.

## 검증 전략

- 설정 테스트: 가공 경로 이탈·누락, export 오류, 잘못된 데이터·유일키·관계 정의
- 모듈 로딩 테스트: 정상 import, 캐시, 잘못된 export와 로딩 실패
- 가공 테스트: 동기·비동기 결과, 여러 레코드·관계 생성, 메타데이터와 취소 신호
- 검증 테스트: 필수 필드, 타입, datetime, 중첩 객체·배열, 유일키, 관계와 모든 크기 제한
- 격리 테스트: 한 레코드의 예외·검증 실패가 정상 레코드를 막지 않고 `partial`을 반환하는지
- 원자성 테스트: 한 원천 레코드의 출력 일부가 실패해도 그 호출의 모든 출력이 제외되는지
- 흐름 테스트: sample1 묶음을 순서대로 가공하고 제한된 소비자에게 전달하는지
- 자원 테스트: 고정된 묶음 크기에서 전체 건수 증가에 비례해 메모리가 늘어나지 않는지

단위 및 통합 검증을 기존 pnpm 테스트·타입 검사·빌드와 CI에 연결하고 플러그인 가공 코드 작성 방법과 런타임 제약을 문서화한다.

## 후속 확장

- worker thread 또는 별도 프로세스 기반 비신뢰 코드 격리와 동기 강제 종료
- 개발 모드 transform 모듈 hot reload
- 가공 정의 변경에 따른 기존 저장 데이터 재가공·migration
- 저장된 격리 오류의 운영 UI와 재처리 흐름
