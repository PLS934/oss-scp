## Context

동기는 `proposal.md`를 따른다. 현재 `@oss-scp/plugin-config`는 `--root`로 외부 설정을 검증하고, 플랫폼 런타임은 사전 빌드된 JavaScript transform을 로드한다. 반면 기존 샘플의 TypeScript transform과 빌드 명령은 pnpm workspace에 묶여 있어 플랫폼 저장소 밖에서 첫 플러그인을 시작하기 어렵다. 새 도구는 파일 경로와 이미지 참조 같은 불신 입력을 처리하고 Docker bind mount 및 외부 프로세스 경계를 통과하므로 안전한 실패와 기존 데이터 보존이 설계의 핵심 제약이다.

## Goals / Non-Goals

**Goals:**

- 스킬 폴더만 설치한 환경에서 Node.js로 네 가지 source의 독립 설정 루트를 생성한다.
- 별도 검증 규칙을 복제하지 않고 선택한 플랫폼 버전의 기존 검증기로 생성물을 확인한다.
- 경로 탈출, symlink 추적, 옵션·명령 주입, 기존 파일 손상, 임의 이미지 pull과 쓰기 가능한 Docker mount를 방지한다.
- 같은 revision의 실제 플랫폼 preflight와 플랫폼 이미지 검증을 자동 회귀 테스트에 연결한다.

**Non-Goals:**

- 생성된 설정의 운영 자동 배포 또는 기존 registry 자동 병합
- 원천 데이터 자동 추론, 새 source/schema/인증 계약, TypeScript SDK 배포 체계
- 사용자 정의 UI의 독립 빌드·배포 또는 실제 수집·저장·조회 성공 보장

## Decisions

### 스킬 폴더를 자체 완결된 배포 단위로 사용한다

`skills/oss-scp-plugin-init` 안에 공통 `SKILL.md`, `scripts`, `assets`, `references`를 두고 생성 코드는 Node.js 표준 라이브러리만 사용한다. 별도 npm 패키지는 설치 단계를 늘리고 플랫폼 workspace 결합을 다시 만들기 때문에 사용하지 않는다. Codex·Claude Code 설치 위치와 AI 없이 실행하는 명령은 사용자 문서에서 분리해 설명한다.

### 새 출력 루트만 원자적으로 생성한다

생성기는 출력의 부모를 확인하고 대상이 존재하거나 symlink이면 거부한다. 임시 sibling 디렉터리에 전체 트리를 만든 뒤 최종 경로로 rename하며, 실패 시 자신이 만든 임시 경로만 제거한다. ID는 제한된 소문자 영숫자·하이픈 형식으로 받아 템플릿 경로로 직접 탈출할 수 없게 한다. 기존 registry 병합은 부분 수정과 충돌 시 복구가 어려워 제외한다.

### 실행 가능한 ESM JavaScript transform을 생성한다

초기 transform은 `item`의 문자열 `id`·`name`을 반환하는 ESM JavaScript로 만들고 생성 루트의 `package.json`에 module 형식을 선언한다. TypeScript는 별도 SDK와 빌드 환경을 요구하므로 고급 개발 문서로 연결한다. 원천 필드와 형변환은 예제임을 명확히 하며 플랫폼의 담당자 데이터에는 관여하지 않는다.

### 격리된 플랫폼 이미지의 기존 검증기만 호출한다

검증 CLI는 `--image`를 요구하고 명시적 버전 tag 또는 digest와 로컬 이미지 존재를 먼저 확인한 뒤 `--pull=never`, `--network=none`, `--read-only`, 읽기 전용 bind mount로 기존 검증기를 실행한다. POSIX 비루트 호스트에서는 생성기가 보존한 `0700` 설정 루트를 권한 완화 없이 읽도록 컨테이너에 호스트 UID/GID를 지정한다. root 실행에서는 권한 상승을 명시하지 않고 이미지의 비루트 기본 사용자를 유지한다. `--platform-root`는 checkout의 `packages/plugin-config/dist/cli.js`와 transform을 호스트 권한으로 실행하며 pathname 검사 후 실행 사이에 파일·symlink·상위 경로가 교체될 수도 있으므로 제거한다. pathname 사전검사와 재개방을 모두 없애 TOCTOU를 구조적으로 배제한다. 독립 schema 복제는 계약 drift를 만들기 때문에 채택하지 않는다.

### 생성 테스트와 실제 이미지 테스트를 분리한다

빠른 테스트는 임시 디렉터리에 스킬 폴더만 복사하여 네 유형의 생성, 플랫폼 검증, transform 실행, 입력 오류와 경로 보호를 확인한다. Docker 테스트는 현재 revision의 API 이미지를 사용해 네 유형 성공과 손상 설정 실패를 확인하며 통합 CI의 Docker 환경에서 실행한다. 명령 구성 단위 테스트만으로는 이미지 안의 실제 검증기와 파일 권한을 증명하지 못하므로 둘 다 유지한다.

## Risks / Trade-offs

- [스킬 ref와 플랫폼 이미지 버전 불일치] → 같은 release ref와 이미지 버전을 선택하도록 문서화하고 실제 대상 검증기를 반드시 실행한다. 자동 호환성 판정은 보장하지 않는다.
- [템플릿과 플랫폼 계약 drift] → 네 생성 유형을 같은 revision에서 import한 실제 preflight와 현재 revision 이미지 양쪽에서 검증한다.
- [구조 검증을 실제 수집 성공으로 오해] → 결과 문구와 문서에서 계약 검증과 원천 호출·수집·저장·조회 검증을 분리한다.
- [Docker 미설치 환경] → 생성과 같은 revision의 개발 테스트는 Docker 없이 동작하지만, 외부 checkout의 CLI 검증은 호스트 코드 실행보다 안전을 우선해 지원하지 않는다.
- [엄격한 새 경로 정책이 기존 프로젝트 도입을 제한] → 기존 운영 설정 자동 병합보다 데이터 보존을 우선하며 병합은 명시적으로 후속 범위로 둔다.

## Migration Plan

기존 설정과 런타임을 변경하지 않는 추가 기능이다. 같은 Git ref에서 스킬 폴더를 설치하고 대응 플랫폼 검증기를 선택한다. 롤백은 설치한 스킬과 CI 연결을 제거하는 방식이며, 사용자가 이미 생성한 독립 설정은 자동 삭제하지 않는다.
