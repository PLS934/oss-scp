## 1. 재발 방지

- [x] 1.1 기존 수정과 관련 명세를 확인하고 전체 workspace 기반 Compose 볼륨 검사를 추가한다.
- [x] 1.2 새 패키지 누락·서비스별 볼륨 누락·공유·호스트 파일 생성 회귀 검사를 추가한다.
- [x] 1.3 웹·mock Docker 검사에 실제 마운트·store·호스트 경로·자원 정리 검증을 연결한다.
- [x] 1.4 동일 검사를 Ubuntu CI에 연결하고 새 workspace 추가 절차를 문서화한다.

## 2. 검증

- [x] 2.1 workspace 회귀 검사·lint와 웹·서버·mock Docker 검사를 실행한다.
- [x] 2.2 Ubuntu CI에서 실제 Docker 실행과 임시 fixture 정리 통과를 확인한다.

검증: macOS 로컬의 모든 대상 검사와 [Ubuntu CI 실행](https://github.com/PLS934/oss-scp/actions/runs/34440210703)이 통과했다. CI는 workspace 회귀 검사·웹·서버·mock Docker 실행 및 정리와 전체 로컬 개발·배포 빌드 검사를 포함한다.
