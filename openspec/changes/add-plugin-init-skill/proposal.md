## Why

OSS-SCP 도입 사용자는 현재 모노레포의 샘플과 빌드 구조를 이해해야 첫 수집 플러그인을 만들 수 있다. GitHub ref로 설치할 수 있는 도구 중립적 스킬과 독립 CLI를 제공해 플랫폼 checkout 없이 초기 설정을 만들고, 선택한 플랫폼 버전의 실제 검증 계약으로 확인할 수 있게 한다.

## What Changes

- `skills/oss-scp-plugin-init`에 Codex와 Claude Code가 함께 사용할 수 있는 `SKILL.md`, 생성·검증 CLI, 템플릿과 참조 문서를 제공한다.
- JSON single, JSON offset, CSV file, CSV HTTP의 네 source 유형에 대해 독립 설정 루트의 plugin/source/transform, registry, 필요한 Connection과 로컬 샘플을 생성한다.
- 생성된 JavaScript transform과 설정을 대상 플랫폼 이미지 또는 동일 revision의 로컬 `@oss-scp/plugin-config` 검증기로 확인한다.
- 잘못된 입력과 설정, 기존 경로 및 symlink 덮어쓰기를 거부하고 기존 데이터를 보존하는 자동 테스트를 추가한다.
- GitHub ref와 플랫폼 버전을 맞추는 설치법, 도구별 설치 위치, AI 없이 사용하는 CLI와 첫 수집 절차를 문서화하고 생성·검증 테스트를 CI에 연결한다.
- 운영 배포, schema 변경, 새 source 계약, 사용자 정의 UI 빌드·배포, 실제 수집·저장·조회 성공 보장은 제외한다.

## Capabilities

### New Capabilities

- `plugin-authoring-bootstrap`: GitHub로 배포되는 공통 스킬과 외부 플러그인 작업 폴더의 안전한 생성 및 대상 플랫폼 계약 검증을 정의한다.

### Modified Capabilities

없음. 기존 plugin/source/transform 계약과 검증기를 변경하지 않고 재사용한다.

## Impact

`skills/oss-scp-plugin-init`, 생성·검증 테스트, 루트 package script, `.github/workflows/integration-ci.yaml`, 사용자 문서가 추가 또는 변경된다. 생성 CLI는 Node.js 표준 라이브러리만 사용하며, 검증에는 사용자가 준비한 버전 고정 플랫폼 이미지 또는 빌드된 동일 revision checkout이 필요하다. 서버, 웹, DB, 공개 API와 기존 schema의 동작은 변경하지 않는다.
