## Why

이슈 #14: 수집 기능 개발자가 외부 시스템과 인증 정보 없이 HTTP 수집을 검증할 원천 서버가 필요하다. 기존 72건·153건 JSON과 53행 CSV를 제공해 후속 수집 구현의 재현 가능한 입력을 확보한다.

## What Changes

- 별도 실행하는 개발용 원천 mock 서버와 실행 명령을 추가한다.
- mock-api Dockerfile과 Compose의 선택적 `mock` 프로필을 추가한다. mock-api 단독 실행과 web·api·mock-api 3개 서비스 실행을 지원하며 Docker 개발 시 소스 변경을 자동 반영한다.
- sample1의 offset·limit 분할 반환, sample2 전체 반환, CSV 원본 다운로드를 제공한다.
- 기본값·경계값·잘못된 요청·원본 일치 자동화 테스트와 CI 실행을 구성한다.
- 실행 방법과 요청·응답 예시를 문서화한다.
- 수집 클라이언트, CSV 파싱, 가공, DB 저장, 화면, 인증, 공개 이미지 배포는 제외한다. 로컬에서 빌드하는 샘플 실행용 Docker 이미지는 포함한다.

## Capabilities

### New Capabilities

- `source-mock-api`: 고정 fixture의 HTTP 제공과 페이지 입력 검증, 독립 실행 계약.

### Modified Capabilities

없음.

## Impact

제안 위치는 `apps/mock-api`이며 pnpm workspace의 기존 NestJS·TypeScript·Vitest 구성을 재사용한다. 루트 실행 명령, 잠금 파일, compose.yaml·compose.dev.yaml, .dockerignore, CI와 fixture 문서를 갱신한다. 기존 업무 API와 웹 응답 계약은 유지한다. 관련 이슈: https://github.com/PLS934/oss-scp/issues/14.
