## Why

HTTP CSV source와 샘플 플러그인은 구현되어 있지만 공통 수동 CLI가 해당 수집 정의를 선택하지 못해 `unsupported_collector`로 실패한다. API 기동 수집도 같은 CLI 경로를 재사용하므로 등록된 HTTP CSV 데이터가 자동 수집되지 않는 문제를 지금 해결해야 한다.

## What Changes

- 플러그인 작업자가 `source.json`에 선언한 HTTP CSV 형식을 `plugin-config`가 검증된 수집 정의로 만들고, 공통 수동 CLI가 그 정의에 맞는 기존 HTTP CSV source를 자동 선택한다.
- 저장 완료 checkpoint가 있는 재실행에서는 이미 확정된 CSV 행을 건너뛰고 남은 행부터 공통 collection engine으로 전달한다.
- HTTP CSV 묶음의 시작·다음 checkpoint와 완료 metadata를 공통 저장 계약에 맞춰 전달한다.
- 취소·다운로드·파싱·묶음 처리 실패 시 기존 공개 CLI 오류 계약을 유지하고 미확정 checkpoint를 진행하지 않는다.
- 수동 CLI와 API 기동 수집의 HTTP CSV 실행을 단위·통합·Docker 검증 및 운영 문서에 반영한다.

제외 범위는 HTTP CSV 다운로드·파싱 계약 자체의 변경, 새로운 source 형식, 인증 방식, 스케줄러와 웹 수집 실행 UI다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `manual-collection-cli`: 공통 CLI가 HTTP CSV 플러그인을 실행하고 저장 완료 checkpoint에서 안전하게 재개하는 요구사항을 추가한다.

## Impact

- `apps/collector-cli`: HTTP CSV collector 선택, 묶음 변환과 재개 처리
- `@oss-scp/http-csv-source`: collector CLI의 명시적 runtime·build 의존성
- CLI·mock API·Docker 통합 검증 스크립트와 수동 수집 문서
- 공개 API와 plugin/source schema에는 호환성 변경이 없다.
