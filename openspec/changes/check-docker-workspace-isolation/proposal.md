## Why

#21에서 workspace 패키지의 의존성 볼륨 누락으로 Linux Docker 테스트의 임시 소스 정리가 실패했다. #20에 현재 패키지용 볼륨은 반영되었지만 새 패키지를 추가할 때 같은 누락을 차단하는 검사가 필요하다.

## What Changes

- pnpm이 인식하는 전체 workspace와 Compose 병합 결과를 비교해 개발 서비스의 전용 의존성 볼륨 누락·공유를 검사한다.
- Docker 통합 테스트에서 실제 마운트, pnpm store, 호스트 의존성 파일과 종료 후 자원 정리를 확인한다.
- 새 패키지 누락 회귀 검사와 Ubuntu CI 명령, 기여자 안내를 추가한다.
- 플러그인 계약·수집 기능·배포 이미지 동작은 범위에 포함하지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `client-bootstrap`: Docker 개발 의존성 격리와 재현 가능한 정리 검증을 추가한다.

## Impact

개발 Compose, 공통 Docker 테스트 스크립트, CI와 개발 문서에 한정한다. API·schema 호환성 변경은 없다.
