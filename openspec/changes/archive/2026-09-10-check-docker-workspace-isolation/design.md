## Context

개발 서비스는 각각 전체 workspace를 설치한다. `plugin-config` 전용 볼륨은 main에 이미 반영되어 있다. 현재 방식은 새 workspace의 볼륨 선언을 사람이 빠뜨릴 수 있다.

## Goals / Non-Goals

모든 workspace의 의존성과 store를 서비스별로 격리하고, 누락을 Docker 기동 전에 발견하며 Linux에서 임시 소스를 정리할 수 있어야 한다. 수집 기능과 운영 배포는 변경하지 않는다.

## Decisions

명시적 named volume 구성을 유지하고 pnpm의 실제 패키지 목록과 `docker compose config`의 병합 결과로 검사한다. Compose 생성기를 도입하는 대안은 일반 Compose 명령에 사전 생성 단계를 추가하므로 이번 수정에서 선택하지 않는다. 모든 서비스가 같은 볼륨을 사용하는 대안은 동시 설치 충돌 때문에 제외한다.

기동 후에는 컨테이너의 실제 마운트와 store 경로를 확인한다. 깨끗한 fixture에서 `node_modules`와 `.pnpm-store`를 찾아 비어 있는 mountpoint만 허용하고, 종료 후 프로젝트 컨테이너·볼륨이 남지 않는지 검사한다. 정리 오류는 테스트 실패로 전파한다.

## Risks / Trade-offs

볼륨 목록의 수동 갱신은 남지만 새 패키지 추가를 재현하는 회귀 검사와 CI로 누락을 차단한다. macOS Docker Desktop의 파일 소유권은 Linux와 다르므로 Ubuntu CI에서 실제 종료·정리 통과를 별도로 확인한다. 기존 HMR·Nest watch·mock watch·재시작 의존성 설치 테스트를 유지한다.
