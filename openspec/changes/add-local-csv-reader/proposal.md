## Why

#13의 로컬 CSV 입력을 제공해 운영자와 연동 개발자가 준비된 샘플을 행 단위로 읽을 수 있게 한다. #14 mock API는 완료됐으며 이번 기능은 HTTP·DB 없이 실행한다.

## What Changes

- 파일 획득과 재사용 가능한 스트리밍 CSV 파서를 분리한 공통 패키지 추가.
- 문자열 보존, 형식·파일 오류, 크기 제한과 파일 변경 감지 구현.
- 샘플·오류·스트리밍 테스트와 사용 문서 추가.
- 플러그인 등록, 다운로드, 가공 실행, DB 저장, 화면은 제외한다.

## Capabilities

### New Capabilities

- `local-csv-reader`: 로컬 CSV를 제한된 메모리로 읽고 문자열 객체를 반환한다.

### Modified Capabilities

없음.

## Impact

`packages/csv-reader`, 의존성 잠금 파일, `docs/local-csv-reader.md`, README 링크와 OpenSpec change. 기존 API와 플러그인 schema는 변경하지 않는다. 최신 main 기반 feature/local-csv-reader에서 작업한다.
