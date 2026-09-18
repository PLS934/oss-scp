## Purpose

플랫폼 이미지와 독립적으로 사용자 정의 React 화면을 제작·검증·배포하면서, 기존 플러그인 설치 흐름과 서버 API 권한 경계를 유지하는 공통 계약을 제공한다.

## ADDED Requirements

### Requirement: 사용자 정의 UI는 선택적 사전 빌드 입력이다
플러그인 제작 도구는 정해진 목록·상세 React 진입점을 선택적으로 입력받아 배포용 ESM 번들과 manifest를 SHALL 생성해야 한다. 사용자 정의 UI 원본이 없는 플러그인은 UI 빌드 없이 기존 선언형 목록·상세를 계속 사용할 수 있어야 한다(MUST).

#### Scenario: 사용자 정의 UI가 있는 플러그인 빌드
- **WHEN** 플러그인 제작자가 지원되는 목록 또는 상세 진입점을 포함해 공통 빌드 명령을 실행한다
- **THEN** 명령은 transform과 함께 검증 가능한 UI 번들·manifest를 포함한 운영 배포 디렉터리를 생성한다

#### Scenario: 선언형 화면만 있는 기존 플러그인 빌드
- **WHEN** 플러그인에 사용자 정의 UI 진입점이 없다
- **THEN** UI 원본이나 UI 빌드를 요구하지 않고 기존 선언형 화면용 배포물을 생성할 수 있다

### Requirement: 운영 배포물은 실행 준비가 끝난 파일만 포함한다
운영 플러그인 배포물은 plugin·source 선언, 사전 빌드 transform과 선택적 사전 빌드 UI 산출물을 SHALL 포함해야 한다. 플랫폼은 운영 중 TypeScript·React 원본을 변환하거나 플러그인 의존성을 설치해서는 안 된다(MUST NOT).

#### Scenario: 소스와 개발 의존성 제외
- **WHEN** 공통 빌드가 운영 배포 디렉터리를 생성한다
- **THEN** 결과에는 실행에 필요한 파일만 포함되고 TypeScript·TSX 원본, `node_modules`와 개발용 package manifest는 포함되지 않는다

#### Scenario: 운영 중 미빌드 UI 발견
- **WHEN** 등록 플러그인이 UI 원본만 제공하거나 실행에 필요한 UI 산출물이 누락되어 있다
- **THEN** 플랫폼은 이를 빌드하거나 의존성을 설치하지 않고 기동 전 검증을 실패한다

### Requirement: UI manifest는 화면과 호환성 및 무결성을 고정한다
UI manifest는 플러그인 ID, UI revision, UI 계약 major, 지원 React 범위, 제공하는 목록·상세 화면, content hash가 포함된 ESM·선택적 CSS 상대 경로와 각 파일의 SHA-256을 SHALL 선언해야 한다. 선언 경로는 같은 플러그인 배포 디렉터리 내부의 일반 파일만 참조해야 한다(MUST).

#### Scenario: 완전한 UI manifest
- **WHEN** 목록과 상세 화면을 제공하는 UI를 빌드한다
- **THEN** manifest는 두 화면, 호환성 범위와 모든 런타임 파일의 경로·SHA-256을 결정적으로 기록한다

#### Scenario: 디렉터리 이탈 또는 원격 URL 참조
- **WHEN** UI manifest가 플러그인 디렉터리 밖의 경로, symlink 이탈 또는 원격 URL을 참조한다
- **THEN** 플랫폼은 파일을 읽거나 전달하지 않고 기동 전 검증을 실패한다

#### Scenario: 파일 변조
- **WHEN** UI manifest에 기록된 SHA-256과 실제 번들 또는 CSS 파일의 내용이 다르다
- **THEN** 플랫폼은 해당 플러그인을 부분 활성화하지 않고 전체 기동을 거부한다

### Requirement: 최소 UI 공개 API와 공유 React 계약을 사용한다
사용자 정의 UI는 플랫폼이 제공하는 React runtime과 UI 계약 major에 대응하는 공개 타입·레코드 조회 API를 SHALL 사용해야 한다. UI 공개 API는 검증된 메뉴 context, 상세 record ID, 목록·단건 조회 경계만 제공하고 Connection·비밀정보·서버 내부 객체 또는 플랫폼 라우터 구현을 제공해서는 안 된다(MUST NOT).

#### Scenario: 지원되는 계약으로 로드
- **WHEN** UI manifest의 계약 major와 React 범위를 현재 플랫폼이 지원한다
- **THEN** 사용자 정의 화면은 플랫폼과 같은 React runtime 및 해당 major의 공개 UI API로 실행된다

#### Scenario: 지원하지 않는 계약
- **WHEN** UI manifest가 지원하지 않는 UI 계약 major 또는 현재 React와 맞지 않는 범위를 선언한다
- **THEN** 플랫폼은 호환되는 것으로 추정하지 않고 기동 전 검증을 실패한다

#### Scenario: 서버 권한 경계 유지
- **WHEN** 사용자 정의 UI가 공개 API로 저장 레코드를 조회한다
- **THEN** 요청은 기존 same-origin API로 전달되고 서버의 조회 범위와 권한 검사를 동일하게 적용받는다

### Requirement: 검증된 UI만 same-origin에서 불변 URL로 제공한다
플랫폼은 기동 시 검증한 UI 파일만 플러그인 ID·revision·content hash로 식별되는 same-origin URL에서 SHALL 제공해야 한다. 해당 파일 응답은 불변 캐시가 가능해야 하며(MUST), UI descriptor와 시작 문서는 새 revision을 재검증할 수 있어야 한다(MUST).

#### Scenario: 검증 완료 UI 요청
- **WHEN** 클라이언트가 서버가 공개한 검증 완료 descriptor의 UI 파일을 요청한다
- **THEN** 서버는 검증 시 고정한 파일을 적절한 script 또는 style content type과 불변 캐시 정책으로 제공한다

#### Scenario: revision 교체
- **WHEN** 운영자가 다른 플러그인 revision으로 재기동한다
- **THEN** 새 UI 파일 URL은 이전 content hash URL과 구분되고 브라우저는 이전 번들을 새 revision으로 오인하지 않는다

#### Scenario: 임의 UI 경로 요청
- **WHEN** 클라이언트가 검증 완료 descriptor에 없는 플러그인 UI 경로를 요청한다
- **THEN** 서버는 해당 파일을 제공하지 않는다

### Requirement: UI 코드·스타일 실패를 플러그인 route에 격리한다
클라이언트는 UI 번들의 다운로드·import·export·렌더링 실패를 해당 플러그인의 활성 route 영역에 SHALL 격리해야 한다. 오류가 발생해도 애플리케이션 shell, 다른 플러그인 메뉴와 이후 탐색을 계속 사용할 수 있어야 하며(MUST), 원본 예외·내부 경로·번들 소스를 사용자 메시지에 포함하지 않아야 한다(MUST NOT).

#### Scenario: UI 번들 로드 실패
- **WHEN** 검증된 사용자 정의 UI 번들을 다운로드하거나 import할 수 없다
- **THEN** 활성 route에 안전한 실패 안내를 표시하고 다른 메뉴 탐색을 유지한다

#### Scenario: 다른 플러그인으로 이동
- **WHEN** 실패한 사용자 정의 화면에서 사용자가 다른 플러그인 메뉴로 이동한다
- **THEN** 새 route의 사용자 정의 화면 또는 공통 화면을 정상적으로 표시한다

#### Scenario: 전역 CSS 사용
- **WHEN** 사용자 정의 UI 원본이 전역 문서 selector 또는 외부 CSS import를 사용한다
- **THEN** 공통 빌드는 해당 스타일을 배포 번들에 포함하지 않고 검증 가능한 오류로 실패한다

### Requirement: 신뢰 코드 경계와 금지 동작을 명시한다
사용자 정의 UI는 운영자가 검토·고정한 신뢰 코드로서 플랫폼과 같은 브라우저 realm에서 실행하며 비신뢰 코드 sandbox를 제공하지 않아야 한다(MUST NOT). UI 번들은 원격 script·style 또는 런타임 의존성을 다운로드해서는 안 되며(MUST NOT), CSP는 검증된 same-origin 정적 모듈과 기존 API 경계만 허용해야 한다(MUST).

#### Scenario: 원격 런타임 의존성
- **WHEN** UI 번들이 외부 origin의 script·module·style을 런타임에 요구한다
- **THEN** 빌드 또는 기동 전 검증이 실패하고 플랫폼은 원격 코드를 다운로드하지 않는다

#### Scenario: 신뢰되지 않은 제3자 UI
- **WHEN** 운영자가 검토·고정하지 않은 제3자 UI 코드를 실행하려 한다
- **THEN** 이 계약은 보안 sandbox를 제공하지 않으며 해당 코드를 설치 가능한 것으로 취급하지 않는다

### Requirement: 플러그인 revision 단위로 배포하고 롤백한다
서버 설정·transform과 선택적 UI 산출물은 하나의 플러그인 revision으로 SHALL 검증·배포·롤백해야 한다. 플랫폼 이미지와 플러그인 revision은 독립적으로 고정할 수 있어야 하며(SHALL), 실행 중 파일 교체는 서버 재기동과 전체 검증 성공 전까지 반영해서는 안 된다(MUST NOT).

#### Scenario: 플랫폼 이미지 재빌드 없는 UI 교체
- **WHEN** 운영자가 현재 플랫폼과 호환되는 새 플러그인 revision을 검증하고 재기동한다
- **THEN** 플랫폼 웹 이미지를 다시 빌드하지 않고 새 사용자 정의 화면을 사용한다

#### Scenario: 이전 플러그인 revision으로 롤백
- **WHEN** 새 사용자 정의 UI 배포를 되돌린다
- **THEN** 운영자는 이전에 검증한 플러그인 전체 revision으로 재기동하며 DB migration을 역행하지 않는다
