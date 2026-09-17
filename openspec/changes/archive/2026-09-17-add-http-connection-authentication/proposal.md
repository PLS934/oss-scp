## Why

현재 HTTP Connection은 base URL만 표현하므로 인증이 필요한 외부 JSON·CSV API를 연결할 수 없다. 운영자가 API key·token·비밀번호를 Git 설정에 저장하지 않고 수집 프로세스의 실행 환경에서 안전하게 주입할 수 있는 공통 인증 계약이 필요하다.

## What Changes

- HTTP Connection에 환경변수 참조만 저장하는 선택적 인증 설정을 추가한다.
- 사용자 지정 API key 헤더, 이미 발급된 Bearer token, Basic 사용자명·비밀번호를 지원한다.
- HTTP JSON offset·single 수집과 HTTP CSV 수집에 동일한 인증 설정을 적용한다.
- 필수 환경변수 누락·빈 값·안전하지 않은 값은 외부 요청 전에 변수명만 포함한 오류로 실패시킨다.
- 설정 검증 결과, 브라우저용 플러그인·메뉴 API, 오류와 로그에 해석된 비밀값이나 인증 헤더가 노출되지 않게 한다.
- 인증 없는 기존 Connection의 동작과 `oss-scp/connection-v1` 호환성을 유지한다.
- 로컬 CLI와 Docker Compose의 환경변수 전달 방법 및 token 발급·갱신 미지원 범위를 문서화한다.
- 로그인 API를 통한 token 발급, OAuth 갱신, 요청별 서명 생성은 범위에서 제외한다.

## Capabilities

### New Capabilities

- `http-connection-authentication`: HTTP Connection의 환경변수 참조 인증 계약, 요청 시점 해석, JSON·CSV 헤더 적용 및 비밀정보 비노출을 정의한다.

### Modified Capabilities

- 없음.

## Impact

- 공통 설정: `packages/plugin-config`의 Connection schema·타입·설정 로더와 인증 해석 기능
- 서버 수집기: `packages/http-collector`, `packages/http-csv-source`
- 운영 문서: `docs/plugin-development.md`, `docs/manual-collection-cli.md`
- 공개 호환성: `auth`는 선택 필드이므로 기존 Connection은 변경 없이 동작한다. 새 인증 설정은 이 기능을 포함한 서버에서만 실행할 수 있다.
- 클라이언트 UI 및 공개 API 응답 구조에는 변경이 없다.
