## Why

OSS-SCP 도입 사용자는 현재 모노레포 샘플과 빌드 구조를 알아야 첫 플러그인을 만들 수 있다. GitHub 설치형 공통 스킬과 독립 CLI로 외부 설정 폴더 생성·검증을 제공한다. 관련 이슈는 #109다.

## What Changes

- 도구 중립적 `oss-scp-plugin-init` 스킬과 네 가지 source 초기 설정 생성기를 제공한다.
- 대상 플랫폼의 기존 검증기를 Docker 또는 로컬 checkout에서 호출한다.
- 버전 고정 GitHub 설치, Codex·Claude Code 설치 위치, CLI와 첫 수집 절차를 안내한다.
- 기존 설정 덮어쓰기 방지와 정상·실패 계약 테스트를 CI에 추가한다.
- 운영 배포·DB 변경·사용자 정의 UI·새 source 계약은 제외한다.

## Capabilities

### New Capabilities

- `plugin-authoring-bootstrap`: GitHub로 배포되는 공통 스킬과 외부 플러그인 작업 폴더 생성·검증 계약.

### Modified Capabilities

없음. 기존 plugin/source/transform 계약을 그대로 사용한다.

## Impact

`skills/`, 사용자 가이드, 루트 package script, CI와 생성기 테스트가 추가된다. 서버·웹·DB·API·schema의 동작 변경은 없다. 생성에는 Node.js만 필요하며 검증에는 준비된 대상 플랫폼 이미지 또는 빌드된 같은 revision의 checkout이 필요하다.
