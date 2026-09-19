# GitHub에서 설치하는 플러그인 초기 설정 스킬

OSS-SCP 도입 사용자가 별도 폴더에 첫 수집 플러그인을 만들고 플랫폼 규칙으로 검증하는 스킬이다. 공통 `SKILL.md`와 Node.js CLI를 제공하며 Codex와 Claude Code의 설치 위치만 다르다. AI 없이도 같은 CLI를 사용할 수 있다.

## 준비

- 생성: Node.js 24 LTS. pnpm이나 외부 패키지는 필요 없다.
- GitHub 설치: Git과 접근 가능한 네트워크. 폐쇄망이면 연결 가능한 환경에서 폴더를 준비해 옮긴다.
- 검증: 대상 릴리스 번들에서 load한 API 이미지와 Docker, 또는 같은 revision에서 빌드한 플랫폼 checkout.

스킬이 포함된 릴리스 태그와 동일 버전의 플랫폼을 선택한다. 예제의 `v0.1.0`은 형식 예시이며 그 태그의 존재나 스킬 포함을 보장하지 않는다. 릴리스 전 개발 검증에는 스킬이 들어 있는 commit SHA와 그 commit으로 빌드한 플랫폼을 사용한다. 이동 가능한 branch인 `main`을 ref로 고정하거나 과거 릴리스 이미지와 섞지 않는다.

## GitHub ref를 고정해 설치

새 준비 폴더에서 다음 명령을 실행한다. `OSS_SCP_REF`를 실제 release tag 또는 40자리 commit SHA로 지정한다. 전체 소스를 빌드하지 않고 스킬 폴더만 복사한다.

```sh
set -eu
OSS_SCP_REF='v0.1.0' # 스킬이 포함된 실제 대상 tag 또는 commit SHA로 변경
OSS_SCP_SKILL_DEST="$HOME/.codex/skills/oss-scp-plugin-init"
# Claude Code는 위 값을 "$HOME/.claude/skills/oss-scp-plugin-init"로 변경

git clone --filter=blob:none --no-checkout https://github.com/PLS934/oss-scp.git oss-scp-skill-source
git -C oss-scp-skill-source fetch origin "$OSS_SCP_REF"
git -C oss-scp-skill-source checkout --detach FETCH_HEAD
node --input-type=module - "$OSS_SCP_SKILL_DEST" "$OSS_SCP_REF" <<'NODE'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
const [destination, ref] = process.argv.slice(2);
const commit = execFileSync('git', ['-C', 'oss-scp-skill-source', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
mkdirSync(dirname(destination), { recursive: true });
mkdirSync(destination); // 기존 설치가 있으면 덮어쓰지 않고 실패
cpSync('oss-scp-skill-source/skills/oss-scp-plugin-init', destination, { recursive: true });
writeFileSync(`${destination}/metadata.source.json`, `${JSON.stringify({ ref, commit }, null, 2)}\n`);
NODE
```

설치 폴더에는 `SKILL.md`, `scripts`, `assets`, `references`가 함께 있어야 한다. 준비용 checkout은 실행에 필요하지 않다. 업데이트할 때는 기존 설치를 별도 위치에 보관한 뒤 새 ref를 설치한다. 생성한 플러그인 폴더는 별도 사용자 데이터이므로 보존한다.

## AI 도구에서 사용

| 도구 | 개인 설치 위치 | 요청 예시 |
| --- | --- | --- |
| Codex | `~/.codex/skills/oss-scp-plugin-init` | `$oss-scp-plugin-init 로컬 CSV용 첫 플러그인을 만들어줘` |
| Claude Code | `~/.claude/skills/oss-scp-plugin-init` | `/oss-scp-plugin-init 로컬 CSV용 첫 플러그인을 만들어줘` |

프로젝트에 함께 배포하려면 Codex는 저장소의 `.agents/skills/`, Claude Code는 `.claude/skills/`에 같은 폴더를 둔다. 새 세션에서 스킬 인식을 확인한다. 공통 지침과 CLI를 공유하지만 두 도구의 대화 실행 결과가 완전히 같다고 보장하지 않는다.

## AI 없이 생성·검증

```sh
OSS_SCP_SKILL="$HOME/.codex/skills/oss-scp-plugin-init"
node "$OSS_SCP_SKILL/scripts/init.mjs" \
  --root ./my-plugins --id company-assets --source csv-file
node "$OSS_SCP_SKILL/scripts/validate.mjs" \
  --root ./my-plugins --image oss-scp-api:0.1.0
```

이미지 버전은 위에서 선택한 플랫폼으로 변경한다. 자동 pull은 하지 않으며 semantic version tag 또는 digest가 필수다. Docker 검증은 네트워크와 컨테이너 쓰기를 비활성화하고 설정을 읽기 전용으로 mount한다. 실제 플랫폼 검증기가 설정·교차 참조·transform export를 확인한다.

생성 경로는 존재하지 않아야 하고 부모 폴더는 미리 준비한다. `json-single`, `json-offset`, `csv-file`, `csv-http`를 지원한다. 로컬 CSV는 바로 읽을 예제를 포함하며 HTTP는 실제 서버 주소와 응답 경로를 수정해야 한다.

개발 checkout으로 검증하려면 해당 checkout에서 의존성과 검증기를 준비한다.

```sh
pnpm install --frozen-lockfile
pnpm --filter @oss-scp/plugin-config build
node "$OSS_SCP_SKILL/scripts/validate.mjs" \
  --root /absolute/path/my-plugins --platform-root "$PWD"
```

검증 실패는 0이 아닌 종료 코드로 전달한다. 검증기를 빌드하지 않았거나 Docker 또는 로컬 이미지를 준비하지 않았다면 성공으로 처리하지 않는다.

## 첫 수집과 검증 한계

생성 폴더 README와 스킬의 작성 계약을 읽고 실제 샘플에 맞춰 source·필드·유일키·transform·목록·상세를 수정한다. JavaScript 예제는 별도 빌드가 필요 없다. TypeScript 개발은 [플러그인 개발 가이드](plugin-development.md)의 SDK와 사전 빌드 절차를 따른다.

설정 검증은 실제 원천 호출, 수집, DB 저장, 목록·상세 조회를 실행하거나 성공을 보장하지 않는다. 테스트 환경에서 [수동 수집](manual-collection-cli.md)과 목록·상세 조회를 확인한다. 운영 반영은 [폐쇄망 번들 가이드](offline-bundle.md)의 설정 주입 절차를 따른다. 기존 registry를 새 예제로 덮어쓰지 않고 충돌을 확인해 병합한 뒤 전체 설정을 검증한다.
