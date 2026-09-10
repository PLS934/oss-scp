## ADDED Requirements

### Requirement: Docker workspace 의존성 격리 검증

프로젝트는 workspace 설치를 수행하는 모든 개발 서비스에서 루트 및 전체 workspace 패키지의 node_modules와 pnpm store를 서비스별 전용 named volume에 격리하도록 SHALL 검증한다. 새 패키지의 볼륨 누락·공유는 컨테이너 기동 전에 검사 실패로 보고해야 한다.

#### Scenario: 새 workspace의 볼륨 누락
- **WHEN** pnpm이 인식하는 새 패키지를 추가하고 개발 서비스의 의존성 볼륨을 추가하지 않는다
- **THEN** 검사 명령은 0이 아닌 종료 코드와 누락된 서비스·경로를 보고한다

#### Scenario: 개발 실행과 정리
- **WHEN** 깨끗한 임시 소스에서 개발 서비스를 실행하고 HMR·watch·의존성 재설치 검사를 마친다
- **THEN** 실제 의존성 마운트와 store는 전용 볼륨을 사용하고 호스트의 의존성 경로에는 파일이 남지 않는다
- **AND** 테스트 종료 후 해당 Compose 프로젝트의 컨테이너·볼륨과 임시 소스가 정리되며 실패는 숨기지 않는다

#### Scenario: Linux 회귀 검증
- **WHEN** Ubuntu CI에서 workspace 회귀 검사와 웹·서버·mock Docker 검사를 실행한다
- **THEN** 볼륨 누락·공유·호스트 의존성 파일 생성을 탐지하고 실제 설치·변경 반영·정리 결과를 검증한다
