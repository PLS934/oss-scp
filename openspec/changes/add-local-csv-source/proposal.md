## Why

공통 CSV 파서는 로컬 파일을 안전하게 스트리밍할 수 있지만, 플러그인 source 설정과 실행 경로가 없어 CSV 파일을 플랫폼 수집 입력으로 등록할 수 없다. 첫 CSV 샘플을 설정만으로 연결해 HTTP JSON 외의 수집 경로에서도 플러그인 확장 계약을 검증해야 한다.

## What Changes

- 로컬 CSV 파일 경로와 파서 옵션, 묶음 크기를 선언하는 source 계약을 추가한다.
- 플러그인 설정 로더가 HTTP JSON source와 로컬 CSV source를 구분해 내부 수집 정의를 생성하게 한다.
- 공통 CSV 파서를 재사용해 행 객체를 제한된 묶음으로 전달하고 완료·오류·취소 상태를 구분하는 실행 경로를 추가한다.
- `fixtures/csv/vulnerabilities.csv`를 사용하는 샘플 플러그인과 등록 항목을 추가한다.
- 설정·실제 파일 통합 테스트와 지원 형식·한도·실행 방법 문서를 추가한다.
- 브라우저 업로드, HTTP CSV 다운로드, 가공 실행, DB 저장, checkpoint 영속화, 메뉴·화면은 제외한다.

## Capabilities

### New Capabilities

- `local-csv-source`: 등록된 플러그인이 로컬 CSV 파일을 안전하게 스트리밍하고 제한된 행 묶음으로 전달하는 설정 및 실행 계약

### Modified Capabilities

- `plugin-source-contract`: 기존 JSON offset source와 함께 로컬 CSV source를 검증하고 형식별 내부 수집 정의를 생성하도록 확장

## Impact

- `packages/plugin-config`의 source schema, 타입, 설정 로딩 결과가 확장된다.
- `packages/csv-reader`를 사용하는 로컬 CSV 수집 실행 패키지 또는 모듈이 추가된다.
- 플러그인 registry에 CSV 샘플이 추가되고 검증 출력이 복수 source 형식을 포함한다.
- 기존 `oss-scp/source-v1`의 JSON offset 설정은 그대로 유효하며 호환성을 유지한다.
