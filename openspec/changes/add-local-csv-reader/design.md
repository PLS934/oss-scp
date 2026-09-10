## Context

현재 mock API는 CSV 원본 바이트를 제공하지만 CSV 행 파서는 없다. 기존 공통 패키지의 TypeScript·Vitest 구성을 재사용한다. 목적은 proposal.md를 따른다.

## Goals / Non-Goals

**Goals:** Node.js 24에서 파일 입력과 바이트 스트림 파싱을 분리하고 AsyncGenerator<Record<string, string>>로 소비한다.

**Non-Goals:** 이번 반환값은 원천 행이며 업무 데이터가 아니다. 유일키·가공·checkpoint·중복 갱신·DB·담당자·조회 권한은 후속 수집 계층 책임이다.

## Decisions

- `@oss-scp/csv-reader`의 `readCsvFile(path, options)`와 `parseCsv(readable, options)`를 제공한다. NestJS나 HTTP에 의존하지 않는다.
- 직접 상태 머신 구현이나 줄 split 대신 csv-parse를 사용한다. 검증된 인용·청크 경계 처리와 backpressure를 활용한다.
- UTF-8 fatal 디코딩과 누적 바이트 제한을 입력 단계에 적용한다. 파서 max_record_size로 단일 행 버퍼를 제한한다. 제한 값은 첫 기능의 보수적인 기본값이며 운영 규모 보장이 아니다.
- 헤더를 별도 검증한 후 Object.fromEntries로 매핑하여 __proto__ 같은 이름도 데이터로 보존한다.
- 파일 descriptor를 읽기 전용으로 열고 일반 파일인지 검사한다. 종료 시 descriptor 및 경로 stat을 시작 값과 비교하고 실제 읽은 바이트 수도 확인한다.
- 오류는 고정 코드·메시지로 제공해 원문 필드와 경로를 오류 로그에 복제하지 않는다. 스트림 pipeline 종료와 소비 중단 시 정리를 보장한다.

## Risks / Trade-offs

- 일부 행 이후 실패 가능 → 소비자는 정상 끝까지 순회한 경우만 전체 성공으로 취급한다. 재시도는 처음부터 읽는다.
- stat 비교는 스냅샷 보장이 아님 → 읽는 동안 변경하지 않는 완성된 파일을 입력한다. 변경을 은폐하는 파일시스템 동작까지 검출한다고 보장하지 않는다.
- 한도는 메모리 사용량과 동일하지 않음 → 생성형 대량 입력에서 선행 읽기와 조기 정리, 큰 단일 행 거부를 자동 검증한다.

## Migration Plan

추가 패키지이므로 기존 앱·schema·DB migration은 없다. pnpm 잠금 파일을 포함해 설치하고 기존 재귀 CI 검사에 포함한다. 패키지 제거로 되돌릴 수 있다.
