# server-plugin-deployment Specification

## Purpose

플랫폼 이미지와 운영자 서버 플러그인 revision을 분리하면서도 검증된 조합만 기동·수집·화면 구성에 사용하도록 안전한 배포 계약을 제공한다.

## Requirements

### Requirement: 외부 서버 플러그인 설정 루트
플랫폼은 plugin·Connection registry, 선언 파일과 사전 빌드된 JavaScript 모듈을 포함하는 외부 설정 루트를 SHALL 입력받아야 한다. 배포 환경에서 설정 루트는 플랫폼 이미지 밖의 운영자 관리 디렉터리여야 하며(MUST), 읽기 전용으로 주입되어야 한다(MUST).

#### Scenario: 외부 설정 루트로 기동
- **WHEN** 운영자가 유효한 외부 설정 루트를 읽기 전용 볼륨으로 주입하고 API를 시작한다
- **THEN** 플랫폼은 이미지 내부 샘플 파일이 아니라 주입된 registry와 플러그인으로 기동한다

#### Scenario: 설정 루트 누락
- **WHEN** 배포 API 또는 수동 수집 명령에 외부 설정 루트가 주입되지 않았거나 읽을 수 없다
- **THEN** 플랫폼은 원천 연결이나 DB 쓰기 전에 안정적인 설정 오류로 종료한다

### Requirement: 전체 기동 전 검증
플랫폼은 등록된 모든 plugin·source·Connection 선언, API/schema 버전, 파일 참조, 고유 ID, 메뉴 경로와 JavaScript 모듈 export를 API listen 전에 SHALL 검증해야 한다. 하나라도 유효하지 않으면 전체 기동을 MUST 거부하고 비밀정보·원본 모듈 오류·stack을 응답이나 표준 오류에 포함하지 않아야 한다(MUST NOT).

#### Scenario: 유효한 외부 플러그인 조합
- **WHEN** 모든 등록 선언과 사전 빌드 모듈이 지원 계약을 충족한다
- **THEN** 플랫폼은 검증된 수집 정의와 메뉴 산출물만 사용해 API를 시작한다

#### Scenario: 선언과 코드 불일치
- **WHEN** 가공 모듈이 없거나 JavaScript가 아니거나 요구된 export를 제공하지 않거나 로드할 수 없다
- **THEN** 플랫폼은 외부 요청과 DB 연결 전에 해당 플러그인을 식별하는 비민감 오류로 기동을 거부한다

#### Scenario: 지원하지 않는 계약 버전
- **WHEN** 플러그인·source·Connection 중 하나가 현재 플랫폼이 지원하지 않는 API/schema 버전을 선언한다
- **THEN** 플랫폼은 호환되는 것으로 추정하지 않고 전체 설정을 거부한다

### Requirement: 플랫폼과 플러그인 revision 독립 운영
배포 절차는 플랫폼 이미지를 정확한 릴리스 태그 또는 digest로, 외부 플러그인 구성을 정확한 Git revision으로 SHALL 고정해야 한다. 운영자는 배포 전에 대상 이미지의 검증 명령으로 해당 설정 revision을 검사하고, 이미지 또는 플러그인 어느 한쪽만 교체하거나 이전의 검증된 조합으로 롤백할 수 있어야 한다(SHALL).

#### Scenario: 이미지 재빌드 없는 플러그인 교체
- **WHEN** 운영자가 같은 플랫폼 이미지에 호환되는 다른 플러그인 revision을 주입하고 사전 검증 후 재기동한다
- **THEN** 플랫폼 이미지를 다시 빌드하지 않고 새 registry·수집 정의·선언형 메뉴를 사용한다

#### Scenario: 검증된 조합으로 롤백
- **WHEN** 새 이미지 또는 플러그인 revision 조합의 배포를 되돌린다
- **THEN** 운영자는 DB migration을 자동 역행시키지 않고 이전에 기록한 이미지 digest와 플러그인 Git revision 조합으로 재기동한다

### Requirement: 운영 시 코드 생성과 동적 설치 금지
플랫폼은 운영 시점에 TypeScript를 transpile하거나 플러그인별 의존성을 설치하거나 원격 코드를 다운로드해서는 안 된다(MUST NOT). 운영 중 웹 UI를 통한 플러그인 설치·수정·교체도 제공하지 않아야 한다(MUST NOT).

#### Scenario: TypeScript 모듈 등록
- **WHEN** 운영 플러그인이 TypeScript 파일을 실행 모듈로 참조한다
- **THEN** 플랫폼은 이를 변환하거나 실행하지 않고 사전 빌드된 JavaScript가 필요하다는 설정 오류로 거부한다

#### Scenario: 선언되지 않은 런타임 의존성
- **WHEN** 사전 빌드 모듈이 플랫폼 이미지에 없는 패키지를 import한다
- **THEN** 플랫폼은 패키지를 설치하지 않고 기동 전 모듈 검증을 실패한다

### Requirement: 사용자 정의 React 화면의 빌드 결합 유지
외부 서버 플러그인은 선언형 메뉴·목록·상세 정의만 제공해야 하며(MUST), `List.tsx`·`Detail.tsx` 또는 임의 프론트엔드 번들을 런타임에 로드해서는 안 된다(MUST NOT).

#### Scenario: 선언형 화면 사용
- **WHEN** 외부 플러그인이 유효한 메뉴와 기본 목록·상세 정의를 제공한다
- **THEN** 플랫폼은 공통 클라이언트 renderer에서 해당 정의를 사용할 수 있다

#### Scenario: 외부 React 화면 참조
- **WHEN** 외부 플러그인이 사용자 정의 React 화면이나 프론트엔드 번들을 참조한다
- **THEN** 플랫폼은 해당 파일을 브라우저에 전달하거나 실행하지 않는다
