## Why

현재 CSV 수집은 플랫폼 실행 환경의 로컬 파일만 지원하므로, CSV 다운로드 API를 제공하는 외부 수집처를 같은 파서와 플러그인 계약으로 연결할 수 없다. HTTP 획득을 공통 CSV 파싱과 분리해 추가하면 원천별 코어 수정 없이 다운로드 CSV를 제한된 메모리로 수집할 수 있다.

## What Changes

- HTTP GET 응답을 CSV 바이트 스트림으로 획득하는 source 설정과 내부 수집 정의를 추가한다.
- 환경별 base URL은 기존 HTTP Connection에서, 요청 경로와 CSV 묶음·한도는 source에서 관리한다.
- HTTP 응답 스트림을 기존 공통 CSV 파서에 연결하고 소비자의 처리 속도에 맞춰 제한된 행 묶음으로 전달한다.
- HTTP 상태, timeout, 취소, 중도 종료, 길이 불일치, 다운로드·해제 후·레코드 크기 초과, CSV 형식 및 묶음 처리 실패를 구분하고 불완전 입력을 완료로 표시하지 않는다.
- mock API의 `vulnerabilities.csv`를 사용하는 별도 샘플 플러그인과 자동화 테스트·운영 문서를 추가한다.
- 로컬 CSV 파서 재구현, 브라우저 업로드, 가공 실행, DB 저장, checkpoint 영속화, 메뉴·화면은 포함하지 않는다.

## Capabilities

### New Capabilities

- `http-csv-source`: HTTP CSV 다운로드, 공통 파서 연결, 제한된 묶음 전달과 완료·실패·취소 계약을 정의한다.

### Modified Capabilities

- `plugin-source-contract`: 등록된 플러그인이 HTTP Connection을 참조하는 CSV source를 선언하고 검증된 내부 정의로 변환할 수 있게 한다.

## Impact

- `packages/plugin-config`: HTTP CSV source schema, 타입, 로더와 registry 검증이 확장된다.
- 새 HTTP CSV 실행 패키지가 기존 `packages/csv-reader`와 HTTP Connection 계약을 재사용한다.
- `plugins/registry.json`, `connections/registry.json`에 별도 샘플 플러그인과 Connection이 추가된다.
- mock API CSV endpoint를 사용하는 통합·오류·메모리 테스트와 플러그인 개발 문서가 추가된다.
- 기존 JSON offset·single 및 로컬 CSV 설정과 실행 계약은 호환성을 유지한다.
