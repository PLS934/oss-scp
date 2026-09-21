# OpenSpec 문서 안내

합의된 기능 계약은 `specs/`, 진행 중인 변경의 제안·설계·작업은 `changes/<change>/`, 완료 당시의 변경 이력과 검증 기록은 `changes/archive/`에서 확인한다. 아카이브는 이후 변경을 반영한 현재 명세가 아니다. 제품의 장기 방향과 미구현 범위는 [개발 계획](../docs/plans/development-plan.md)을 참고한다.

## 구현 상태와 검토 기준

2026-09-21 원격 main `bbb493f0`의 본 명세는 43개다. 본 명세 반영과 change 아카이브는 구현 완료를 자동으로 뜻하지 않는다. 특히 `plugin-ui-distribution`과 `custom-plugin-views`·`plugin-menu-routing`·`server-plugin-deployment`의 외부 UI descriptor 관련 요구사항은 설계 완료·구현 대기 상태다. 현재 사용자 정의 React 화면은 플랫폼 웹 이미지에 정적으로 포함된다.

최근 구현된 인증·일일 수집·플러그인 제작 도구의 계약은 다음과 같다.

| 명세 | 구현된 범위 |
|---|---|
| [ldap-session-auth](specs/ldap-session-auth/spec.md) | 선택적 LDAP/AD 로그인·서버 세션. 역할별·자산별 권한은 후속 범위. |
| [scheduled-full-collection](specs/scheduled-full-collection/spec.md) | IANA 시간대·현지 시각의 일일 수집. 기본 비활성. |
| [plugin-authoring-bootstrap](specs/plugin-authoring-bootstrap/spec.md) | 독립 플러그인 생성·검증 스킬/CLI. React UI 빌드·배포는 제외. |

## 관련 명세를 찾는 순서

- 저장형 목록·상세: 플러그인 선언 → 목록·상세 정의 → 플랫폼 저장 조회 → 조회 API → 조회 클라이언트 → 공통 목록·상세 화면.
- 라이브 목록·상세: 플러그인 source 선언 → 라이브 조회 → 조회 API의 라이브 계약 → 공통 화면. 저장형 UUID·수집 시각·cursor 계약을 라이브형에 적용하지 않는다.
- 검색·필터·정렬: 각 기능 명세와 조회 API·저장 조회·공통 목록을 함께 확인한다. 라이브 원천의 실행 방식은 라이브 조회 명세를 따른다.
- 사용자 정의 UI: 화면 선택·입력·오류 격리는 `custom-plugin-views`, 빌드·manifest·검증·파일 제공은 `plugin-ui-distribution`, 설치와 기동은 `server-plugin-deployment`를 확인한다.
- 수집: source 선언 → 형식별 수집기 → transform → 공통 실행기 → 저장 계약을 확인하고, CLI·기동·수동 동기화의 진입점과 실행 조정 명세를 함께 읽는다.

## 영역별 본 명세

### 실행 기반과 배포

| 명세 | 책임 |
|---|---|
| [client-bootstrap](specs/client-bootstrap/spec.md) | 개발자가 로컬에서 클라이언트를 실행하고 수정 결과를 즉시 확인하며, 일반 사용자가 외부 계정이나 개발 도구 없이 Docker로 시작 화면과 서버 연결 상태를 확인할 수 있는 재현 가능한 실행 기반을 제공한다. |
| [server-bootstrap](specs/server-bootstrap/spec.md) | 개발자가 로컬에서 서버를 실행하고 수정 결과를 확인할 수 있는 기본 개발 경로와, 개발 도구를 설치하지 않은 사용자가 Docker로 동일한 서버를 실행하고 상태 확인 API로 기동 여부를 검증할 수 있는 계약을 제공한다. |
| [source-mock-api](specs/source-mock-api/spec.md) | 외부 시스템과 실제 인증 정보 없이 수집 기능을 개발하고 검증할 수 있도록, 저장소의 JSON·CSV 원천 샘플을 재현 가능한 HTTP 응답으로 제공한다. 플랫폼의 저장 데이터 조회와 원천 응답 제공을 구분한다. |
| [server-plugin-deployment](specs/server-plugin-deployment/spec.md) | 플랫폼 이미지와 운영자 서버 플러그인 revision을 분리하면서도 검증된 조합만 기동·수집·화면 구성에 사용하도록 안전한 배포 계약을 제공한다. |
| [technical-preview-release](specs/technical-preview-release/spec.md) | 0.1.0 개발 릴리스가 누구를 위한 어떤 수준의 기술 프리뷰인지, 무엇을 검증해야 공개할 수 있는지와 지원하지 않는 범위를 일관되게 판단하도록 한다. |
| [github-release-artifacts](specs/github-release-artifacts/spec.md) | 검증한 Git 태그와 Docker 이미지의 provenance를 보존하고, 소스 빌드 없이 설치·업데이트할 수 있는 불변 GitHub Release 자산을 안전하게 제공한다. |
| [offline-deployment-bundle](specs/offline-deployment-bundle/spec.md) | 외부 Registry와 소스 tree 없이도 검증된 OSS-SCP 이미지 조합을 폐쇄망 단일 서버로 한 번에 반입하여 최초 설치·업데이트·실패 복구할 수 있게 한다. |

### 플러그인 선언과 화면

| 명세 | 책임 |
|---|---|
| [plugin-source-contract](specs/plugin-source-contract/spec.md) | 플러그인이 원천 API의 호출·응답·반복 수집 정보를 선언하고 플랫폼이 이를 배포 전에 검증하여, 수집 코어 수정 없이 새로운 원천 설정을 추가할 수 있게 한다. |
| [plugin-menu-routing](specs/plugin-menu-routing/spec.md) | 등록·검증된 플러그인 메뉴를 React 클라이언트에 일관되게 표시하고 URL에서 정확한 저장 레코드 조회 범위를 복원하는 공통 탐색 계약을 제공한다. |
| [plugin-list-definition](specs/plugin-list-definition/spec.md) | 플러그인이 데이터 종류별 기본 목록 컬럼과 표시 정보를 선언하고 플랫폼이 이를 검증된 최소 클라이언트 계약으로 제공하게 한다. |
| [plugin-detail-definition](specs/plugin-detail-definition/spec.md) | 플러그인이 데이터 종류별 기본 상세 화면의 섹션과 필드 순서를 선언하고, 플랫폼이 이를 검증된 최소 클라이언트 계약으로 제공하게 한다. |
| [plugin-home](specs/plugin-home/spec.md) | 보안팀과 개발팀이 홈에서 등록된 플러그인의 제공 데이터와 출처, 설정상 활성화 여부를 확인하고 유효한 조회 메뉴로 이동하거나 로컬 CSV 원본을 내려받을 수 있게 한다. |
| [plugin-config-detail](specs/plugin-config-detail/spec.md) | 운영자와 개발자가 플랫폼이 실제로 로드한 플러그인의 수집·데이터·변환·화면 구성을 비밀정보 노출이나 실행 상태 변경 없이 웹에서 점검할 수 있게 한다. |
| [plugin-record-list](specs/plugin-record-list/spec.md) | 검증된 플러그인 기본 컬럼 정의와 공통 조회 API를 사용해 여러 데이터 종류를 재사용 가능한 React 목록으로 표시하고, 번호형 페이지 탐색과 조회 모드별 상태를 일관되게 제공한다. |
| [plugin-detail-view](specs/plugin-detail-view/spec.md) | 기본 상세 정의 명세에 따른 검증된 필드 정의로 저장형·라이브 레코드의 기본 상세 화면과 실패 상태를 안전하고 일관되게 제공한다. |
| [custom-plugin-views](specs/custom-plugin-views/spec.md) | 플랫폼이 기동 시 검증한 플러그인 전용 React 화면을 검증된 메뉴 route에 선택적으로 연결하면서, 미등록 화면과 로딩·렌더링 실패를 안전하게 처리한다. |
| [plugin-ui-distribution](specs/plugin-ui-distribution/spec.md) | 플랫폼 이미지와 독립적으로 사용자 정의 React 화면을 제작·검증·배포하면서, 기존 플러그인 설치 흐름과 서버 API 권한 경계를 유지하는 공통 계약을 제공한다. |
| [web-theme-preference](specs/web-theme-preference/spec.md) | 보안팀과 개발팀을 포함한 모든 웹 사용자가 계정 설정 없이 브라우저에서 화면 테마를 선택하고, 재방문과 운영체제 설정 변경에도 일관된 색상과 접근성을 제공받도록 한다. |

### 원천 수집과 실행 조정

| 명세 | 책임 |
|---|---|
| [http-connection-authentication](specs/http-connection-authentication/spec.md) | 인증이 필요한 외부 HTTP JSON·CSV 원천을 비밀값의 Git 저장 없이 연결하고, 수집 실행 환경에서 자격증명을 안전하게 해석·적용하는 공통 계약을 제공한다. |
| [http-offset-collection](specs/http-offset-collection/spec.md) | 검증된 설정만으로 JSON offset API를 제한된 묶음씩 안전하게 읽고, 후속 가공·저장 단계가 완료된 뒤에만 다음 묶음으로 진행할 수 있는 공통 수집 동작을 제공한다. |
| [http-single-collection](specs/http-single-collection/spec.md) | 검증된 JSON single source 설정으로 HTTP API를 한 번 안전하게 호출하고, 원천 레코드와 명시적으로 허용된 응답 metadata를 후속 처리 단계에 전달한다. |
| [local-csv-reader](specs/local-csv-reader/spec.md) | 로컬 CSV 파일을 읽기 전용으로 순회해 원천 문자열을 보존하는 객체를 제공한다. 파일 획득과 파싱을 분리하여 후속 수집 경로에서도 동일한 형식 처리를 재사용한다. |
| [local-csv-source](specs/local-csv-source/spec.md) | 등록된 플러그인이 플랫폼 실행 환경의 로컬 CSV 파일을 안전하게 읽어 원천 문자열 행을 제한된 묶음으로 전달하고, 완전한 순회만 성공으로 판정하게 한다. |
| [http-csv-source](specs/http-csv-source/spec.md) | HTTP API에서 CSV를 제한된 스트림으로 받아 공통 CSV 형식 계약에 따라 행 묶음으로 전달하고, 완전한 다운로드와 파싱만 성공으로 판정하게 한다. |
| [plugin-transform-runtime](specs/plugin-transform-runtime/spec.md) | 수집된 원천 레코드를 플러그인이 선언한 플랫폼 레코드와 관계로 변환하고 공통 검증하여, 정상 결과만 DB 비종속 저장 경계로 전달하고 잘못된 레코드는 안전하게 격리한다. |
| [common-collection-runner](specs/common-collection-runner/spec.md) | 수집 방식과 실행 진입점에 독립적으로 원천 묶음을 가공하고 공통 저장 계약에 확정하여, 안전한 재개·부분 성공·backpressure를 일관되게 제공한다. |
| [manual-collection-cli](specs/manual-collection-cli/spec.md) | 설치 환경의 운영자가 등록된 플러그인 하나를 검증된 설정과 플랫폼 DB에 연결해 안전하게 수동 실행하고, 자동 실행 계층 없이 결과 상태를 판별할 수 있게 한다. |
| [startup-full-collection](specs/startup-full-collection/spec.md) | API가 시작될 때 확정된 설정 revision의 모든 활성 수집 대상을 기존 조회를 방해하지 않고 전체 동기화하도록 하는 외부 동작을 정의한다. |
| [collection-run-coordination](specs/collection-run-coordination/spec.md) | 여러 API 인스턴스와 수동·자동 실행이 같은 수집 범위를 안전하게 공유하도록 영속 실행 기록, 실행권, revision 및 결과 확정 순서를 정의한다. |
| [plugin-manual-sync](specs/plugin-manual-sync/spec.md) | 보안 운영자가 플러그인 데이터 목록에서 해당 플러그인의 활성 수집 대상 전체를 비동기로 실행하고, 권한·중복 실행·결과 보존 경계 안에서 진행 상태와 결과를 확인할 수 있게 한다. |

### 저장과 조회

| 명세 | 책임 |
|---|---|
| [platform-db-config](specs/platform-db-config/spec.md) | 운영자가 입력한 플랫폼 DB 주소·포트·계정·비밀번호를 읽고 검사하여, 정상 입력은 프로그램이 사용할 설정으로 반환하고 잘못된 입력은 수정할 항목을 알려준다. 서버와 수집 CLI가 이 기능을 재사용한다. |
| [postgresql-platform-db](specs/postgresql-platform-db/spec.md) | PostgreSQL을 플랫폼 운영 DB로 안전하게 연결하고, 내장 또는 외부 DB 설치에서 같은 준비 상태와 명시적 migration 계약을 제공한다. |
| [mysql-platform-db](specs/mysql-platform-db/spec.md) | MySQL을 플랫폼 운영 DB로 안전하게 연결하고, PostgreSQL과 동일한 외부 상태·명시적 migration 계약을 내장 또는 외부 MySQL 설치에서 제공한다. |
| [platform-record-storage](specs/platform-record-storage/spec.md) | 가공·검증된 여러 플러그인 데이터와 관계를 공통 형식으로 영속화하고, 수집 실행의 checkpoint 및 격리 오류를 데이터와 일관되게 확정하여 중복이나 누락 없이 재개할 수 있게 한다. |
| [platform-record-query](specs/platform-record-query/spec.md) | 원천 시스템의 가용성과 무관하게 플랫폼 DB에 저장된 공통 레코드의 제한된 목록·상세와 관련 수집 상태를 DB 제품에 종속되지 않은 계약으로 조회하게 한다. |
| [record-query-api](specs/record-query-api/spec.md) | 계정관리 비활성화 상태에서 저장된 공통 레코드 목록·상세와 수집 상태를 일관된 JSON 및 HTTP 오류 계약으로 조회할 최소 NestJS API를 제공한다. |
| [record-query-client](specs/record-query-client/spec.md) | React 화면이 플랫폼 DB의 저장 레코드 목록과 상세를 동일한 타입·검증·오류 계약으로 안전하게 조회하도록 공통 클라이언트 경계를 제공한다. |
| [record-search-filters](specs/record-search-filters/spec.md) | 보안팀과 개발팀이 플러그인별 표에서 지정된 필드를 검색하고 여러 필터를 조합하여 전체 저장 데이터 중 필요한 결과를 찾도록 한다. 원천 조회 없이 두 플랫폼 DB에서 동일한 조건과 묶음 이동 규칙을 제공한다. |
| [record-sorting](specs/record-sorting/spec.md) | 플러그인이 허용한 목록 필드를 사용자가 한 번에 하나씩 정렬하고 현재 방향을 확인하며 검색·필터·번호형 페이지와 일관되게 결합할 수 있게 한다. |
| [live-db-plugin-source](specs/live-db-plugin-source/spec.md) | 대규모 PostgreSQL 원천을 플랫폼 DB에 복제하지 않고 제한된 읽기 질의로 조회하여, 운영자가 플러그인 선언만으로 데이터와 화면을 관리할 수 있도록 실행·무저장·실패 계약을 정의한다. |

## 문서 유지 기준

- 기능 변경 시 관련 본 명세의 Purpose·요구사항·시나리오를 함께 대조한다. 현재 명세에는 완료된 기능을 “후속 구현”으로 남기지 않는다.
- 공통 계약은 담당 명세를 참조하고, 저장형·라이브형 또는 cursor·번호형처럼 적용 조건이 다른 계약은 범위를 명시한다.
- 명세를 추가하거나 이름을 바꿀 때 이 인덱스도 갱신한다. 완료 현황이 바뀌면 개발 계획의 요약과 남은 작업을 함께 확인한다.
- 완료 change의 본 명세 반영과 아카이브를 확인하고, 같은 change의 이전 사본을 활성 디렉터리에 남기지 않는다. 출처가 불명확한 로컬 초안은 먼저 보존·대조한다.
- `openspec list --json`과 `openspec validate --all --strict --no-interactive`로 활성 상태와 형식을 확인한다. 형식 검증만으로 명세 간 의미 일치나 구현 일치를 보장하지는 않는다.
