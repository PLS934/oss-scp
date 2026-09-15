## Context

기존 `plugin-config`는 `--root`로 외부 설정을 검증하고 플랫폼 이미지는 사전 빌드 JavaScript transform을 실행한다. SDK와 TypeScript 예제는 workspace 내부 패키지에 의존한다. 동기는 proposal.md를 따른다.

## Goals / Non-Goals

**Goals:** 스킬 폴더만 설치한 환경에서 네 가지 source 초기 설정을 만들고 기존 검증기로 검증한다.

**Non-Goals:** 자동 운영 배포, 실제 외부 데이터 형식 추정, 인증 계약 확장, 새 SDK 배포 시스템, UI 독립 빌드.

## Decisions

- `skills/oss-scp-plugin-init`에 공통 SKILL.md, scripts, assets, references를 둔다. Codex 전용 도구 호출을 포함하지 않는다. 도구별 설치 위치는 사용자 가이드에 설명한다.
- 생성은 Node.js 표준 라이브러리만 사용한다. 초기 transform은 ESM JavaScript로 만들고 package.json에 모듈 형식을 명시한다. TypeScript 강제는 별도 SDK 배포와 빌드 환경을 요구하므로 기존 SDK 기반 고급 개발 안내로 연결한다.
- 출력 루트는 새 경로만 허용한다. 기존 운영 설정을 자동 합치면 registry 충돌과 부분 변경이 생길 수 있으므로 첫 생성에 집중한다. 실패 시 이번 실행에서 만든 출력만 정리한다.
- 기본 데이터 모델은 `item`의 문자열 `id`·`name`, 유일키 `id`다. 원천 샘플은 설명용이며 실제 유일키·누락·형변환 정책은 사용자의 입력을 확인해 수정한다. 플랫폼 담당자 관리에는 관여하지 않는다.
- 별도 검증 규칙을 만들지 않는다. 릴리스 사용자는 이미 load한 버전 고정 API 이미지를 `--image`로 전달한다. 읽기 전용 설정 mount, 네트워크 없음, 자동 pull 없음으로 기존 preflight CLI를 실행한다. 개발자는 빌드한 checkout의 CLI를 `--platform-root`로 선택한다.
- 버전 고정 설치는 Git checkout ref와 스킬 폴더 복사로 제공한다. 폐쇄망에서는 온라인 준비 환경에서 스킬과 이미지를 확보한 뒤 옮긴다. 설치 대상에 기존 스킬이 있으면 덮어쓰지 않는다.

## Risks / Trade-offs

- 스킬 ref와 이미지가 어긋날 수 있음 → 같은 릴리스 ref와 이미지를 선택하도록 안내하고 실제 플랫폼 검증을 필수 단계로 둔다. 자동 호환성 보장은 하지 않는다.
- 템플릿 계약 drift → 네 가지 출력 모두 실제 plugin-config와 transform 출력 검증 테스트에 연결한다.
- 구조 검증은 실제 수집 성공을 보장하지 않음 → 결과 의미를 분리하고 수집·화면 확인 명령은 후속 사용자 단계로 안내한다.
- Docker가 없는 환경 → 동일 revision 로컬 checkout 검증 경로 제공. 생성 자체에는 Docker·pnpm이 필요 없다.

## Migration Plan

기존 설정 변경 없이 스킬·문서·테스트를 추가한다. 같은 Git ref에서 폴더를 설치하며 기존 사용자는 영향을 받지 않는다. 제거 시 설치한 스킬만 제거하고 생성된 사용자 설정은 보존한다.
