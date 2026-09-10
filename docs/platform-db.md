# 플랫폼 DB 접속 설정

`@oss-scp/platform-db`는 운영자가 입력한 DB 주소·포트·계정·비밀번호를 읽고 검사하는 공통 패키지입니다. 정상 입력은 연결 코드가 사용할 설정으로 반환하고, 잘못된 입력은 수정할 항목을 알리는 `PlatformDbConfigError`를 반환합니다.

현재는 설정 검사 함수와 연결 코드의 인터페이스를 제공합니다. API 시작 과정에서 아직 호출하지 않으므로 `.env`를 작성해도 DB 접속을 시작하지 않습니다. PostgreSQL 실제 연결·설치는 #27, MySQL은 #28, 업무 테이블·저장·조회는 #29~#31에서 추가합니다. 별도의 설정 화면이나 검사 CLI는 제공하지 않습니다.

## 운영자가 작성할 입력

로컬 PostgreSQL용 형식 예시입니다. 주소·계정·비밀번호를 자신의 환경에 맞춰 제공하며 비밀번호 예시를 그대로 운영에 사용하지 않습니다.

```dotenv
PLATFORM_DB_TYPE=postgres
PLATFORM_DB_HOST=localhost
PLATFORM_DB_PORT=5432
PLATFORM_DB_NAME=oss_scp
PLATFORM_DB_USER=oss_scp_app
PLATFORM_DB_PASSWORD=replace-with-your-password
PLATFORM_DB_TLS_MODE=disable
```

비밀번호 파일을 사용하려면 `PLATFORM_DB_PASSWORD`를 제거하고 다음을 지정합니다. 파일에는 비밀번호만 적습니다. 경로는 플랫폼 프로세스에서 읽을 수 있는 절대 경로입니다.

```dotenv
PLATFORM_DB_PASSWORD_FILE=/run/secrets/platform_db_password
```

두 방식을 동시에 지정하면 오류입니다. 파일 끝의 LF 또는 CRLF 하나만 제거하며 비밀번호의 공백은 보존합니다. 빈 값, 남은 CR/LF, NUL과 16 KiB를 넘는 값은 거부합니다. 파일 크기 제한에는 마지막 개행도 포함됩니다. 파일은 UTF-8 일반 파일 또는 일반 파일을 가리키는 심볼릭 링크여야 합니다.

`.env`는 Git에서 제외되어 있습니다. 별도 비밀번호 파일도 저장소 밖에서 관리하고 이미지에 넣지 않습니다. 공통 패키지는 `.env`를 자동으로 읽지 않으며 호출 프로그램이 환경을 로드해 전달합니다. 원천 수집용 `connections/`와 플랫폼 운영 DB 설정은 서로 별개입니다.

## 설정 항목

선택값의 기본값은 **변수를 생략했을 때만** 적용됩니다. 빈 문자열은 잘못된 설정입니다.

| 변수 | 규칙·기본값 |
|---|---|
| PLATFORM_DB_TYPE | 필수. 호출자가 등록한 DB 어댑터 ID |
| PLATFORM_DB_HOST | 필수. 호스트명/IP, URL 형식 불가 |
| PLATFORM_DB_PORT | 등록 어댑터의 기본 포트. 지정 시 십진 정수 1~65535 |
| PLATFORM_DB_NAME | 필수. 사용할 데이터베이스 이름 |
| PLATFORM_DB_USER | 필수. DB 접속 계정 |
| PLATFORM_DB_PASSWORD | 직접 비밀번호. 파일 방식과 하나만 선택 |
| PLATFORM_DB_PASSWORD_FILE | 비밀번호 파일의 절대 경로. 최대 16 KiB |
| PLATFORM_DB_POOL_MAX | 기본 10. 십진 정수 1~100 |
| PLATFORM_DB_CONNECT_TIMEOUT_MS | 기본 5000. 연결 확보 대기 시간, 십진 정수 1~60000 ms |
| PLATFORM_DB_TLS_MODE | 기본 verify-full. disable 또는 verify-full |
| PLATFORM_DB_TLS_CA_FILE | 선택. UTF-8 PEM 인증서 파일의 절대 경로, 최대 1 MiB |

DB 종류·주소·이름·계정은 비어 있거나 앞뒤 공백·제어문자를 포함하면 거부합니다. 숫자는 부호·소수·지수·공백을 허용하지 않습니다. 초기 제품 ID는 `postgres`, `mysql`이며 기본 포트 5432, 3306은 해당 어댑터가 등록할 값입니다. 현재 패키지에 실제 어댑터가 내장되어 있지는 않습니다.

## 암호화 연결 설정

`verify-full`은 암호화와 서버 인증서 체인·접속 호스트명 검증을 요구합니다. 사설 CA가 필요하면 `PLATFORM_DB_TLS_CA_FILE`에 인증서 또는 인증서 묶음을 지정합니다. 생략 시 실행 환경의 기본 신뢰 저장소를 사용합니다.

```dotenv
PLATFORM_DB_TLS_MODE=verify-full
PLATFORM_DB_TLS_CA_FILE=/run/secrets/platform_db_ca.pem
```

로컬 평문 DB에서는 `disable`을 명시하고 CA 파일 항목을 생략합니다. `disable`과 CA 파일을 함께 지정하면 오류입니다. 이번 함수는 설정과 PEM 형식을 검사하며 실제 서버의 인증서 검증은 후속 DB 어댑터에서 수행합니다. 검증 실패 시 평문 연결로 자동 전환하는 동작은 허용하지 않습니다.

## 정상·오류 결과

| 입력 | 결과 |
|---|---|
| 등록된 DB와 올바른 필수값 | 기본값을 보충한 설정 반환 |
| `PLATFORM_DB_PORT=abc` | INVALID_PORT, PLATFORM_DB_PORT와 허용 정수 범위 안내 |
| DB 계정 누락 | REQUIRED, PLATFORM_DB_USER 안내 |
| 비밀번호 값/파일 동시 지정 또는 모두 누락 | PASSWORD_SOURCE |
| 파일을 읽을 수 없거나 UTF-8/크기/경로 조건 위반 | INVALID_FILE |
| 파일에서 읽은 비밀번호가 빈 값·CR/LF·NUL 포함 | INVALID_PASSWORD |
| 미등록 DB 종류 | UNREGISTERED_ADAPTER, 파일 읽기 전 거부 |
| 잘못된 TLS 모드 / disable과 CA 함께 지정 | INVALID_TLS / TLS_CA_CONFLICT |
| 잘못된 PEM 인증서 | INVALID_CA |

오류는 `code`, `setting`, 고정된 `message`로 처리합니다. 입력 비밀번호·파일 경로·원본 파일 시스템 오류를 포함하지 않습니다. 정상 반환 설정에는 비밀번호가 있으므로 설정 객체 전체를 로그나 HTTP 응답에 출력하지 않습니다.

설정 검사 성공은 DB 접속 성공을 뜻하지 않습니다. 비밀번호가 실제 DB와 일치하는지, 호스트가 응답하는지는 후속 연결 단계에서 확인합니다.

## 서버·수집 CLI에서 사용할 공통 API

공개 진입점은 다음과 같습니다.

```typescript
import {
  readPlatformDbConfig,
  selectPlatformDbAdapter,
  type PlatformDbAdapterFactory,
} from '@oss-scp/platform-db';

// 서버와 CLI의 시작 코드가 빌드에 포함된 실제 어댑터 목록을 전달합니다.
function readSettings(adapters: readonly PlatformDbAdapterFactory[]) {
  const config = readPlatformDbConfig(process.env, adapters);
  const adapter = selectPlatformDbAdapter(config.type, adapters);
  return { config, adapter };
}
```

파서는 네트워크 연결이나 동적 모듈 로딩을 수행하지 않습니다. 등록 목록은 DB별 연결 코드가 제공하는 고유 `id`, `contractVersion: 1`, `defaultPort`, `connect(config)`로 구성됩니다. 중복 ID·잘못된 포트·미지원 계약 버전·연결 함수 누락을 거부합니다. 테스트용 어댑터는 테스트에서만 사용합니다.

`connect`가 반환하는 연결은 `checkReady(): Promise<boolean>`와 `close(): Promise<void>`를 제공합니다. 어댑터는 대기 시간·연결 풀·TLS 검증을 집행하고, 준비 상태 검사는 `connectTimeoutMs` 안에 반환하며 DB 장애는 false로 표현합니다. 종료는 반복 호출 가능해야 합니다. 연결 도중 실패한 자원은 연결 코드가 정리하고, 외부로 공개하는 연결 오류에도 비밀정보를 포함하지 않아야 합니다.

후속 서버 연결에서는 설정/최초 연결 실패를 시작 실패로 처리합니다. 실행 중 DB 장애는 준비 상태(readiness) 실패이며, 서버 생존(liveness)과 구분합니다. 현재 `/api/v1/health`는 HTTP 처리 가능 여부만 반환하고 DB 상태를 의미하지 않습니다.

## 개발·검증

저장소 루트에서 [서버 가이드](server-development.md)의 Node.js 24 LTS와 pnpm 10.34.5를 준비한 뒤 실행합니다.

```sh
pnpm install --frozen-lockfile
pnpm --filter @oss-scp/platform-db test
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

패키지 테스트는 임시 파일과 테스트 어댑터로 실행되며 외부 DB·자격증명·Docker가 필요하지 않습니다. 기존 GitHub Actions의 `pnpm test`, 타입 검사·린트·빌드에 자동으로 포함됩니다. 실제 DB·Docker 연결 검증은 #27·#28의 범위입니다. DB 데이터나 스키마를 변경하지 않아 이번 패키지 추가에는 migration 실행이 필요하지 않습니다.
