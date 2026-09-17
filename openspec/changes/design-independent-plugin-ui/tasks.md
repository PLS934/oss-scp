## 1. UI 공개 API 계약

- [ ] 1.1 `@oss-scp/plugin-ui` workspace 패키지에 목록·상세 props, 목록·단건 조회, 공개 오류와 navigation 입력의 v1 타입을 추가하고 타입·API 단위 테스트를 통과시킨다.
- [ ] 1.2 플랫폼 릴리스가 지원 UI 계약 major와 React 범위를 노출하고 대상 이미지 검증에서 지원·미지원 조합을 구분하는 테스트를 추가한다.
- [ ] 1.3 플랫폼 내부 라우터·Connection·비밀정보·서버 객체가 공개 패키지 export에 포함되지 않는 API surface 검증을 추가한다.

## 2. #109 플러그인 제작 스킬·CLI 확장

- [ ] 2.1 #109의 생성 흐름에 선택적 목록·상세 UI 템플릿을 추가하고 UI 없음·목록만·상세만·둘 다인 프로젝트가 생성 테스트를 통과하게 한다.
- [ ] 2.2 공통 `build` 명령이 transform과 선택적 UI ESM/CSS를 빌드하고 content hash·UI manifest를 포함한 운영 배포 디렉터리를 생성하는 테스트를 추가한다.
- [ ] 2.3 UI 빌드에서 지원 export·외부 module·전역 CSS selector·원격 import를 검사하고 잘못된 입력별 오류 테스트를 통과시킨다.
- [ ] 2.4 TypeScript·TSX 원본, 개발 package manifest와 `node_modules`가 운영 배포물에서 제외되고 UI 없는 기존 #109 산출물이 그대로 검증되는 테스트를 추가한다.

## 3. 서버 검증과 UI 파일 제공

- [ ] 3.1 플러그인 schema와 config loader에 선택적 UI manifest 참조, ID·계약·React 범위·화면·경로·SHA-256 검증을 추가하고 정상·누락·변조·경로 이탈 테스트를 통과시킨다.
- [ ] 3.2 UI 오류가 있으면 DB 연결과 listen 전에 전체 기동을 거부하고 상대 파일·필드·일반화한 원인만 보고하는 설정 오류 테스트를 추가한다.
- [ ] 3.3 기동 snapshot에 검증 완료 UI descriptor를 포함하고 메뉴 API가 내부 경로 없이 화면 종류·revision·content-hash URL만 반환하는 controller 테스트를 추가한다.
- [ ] 3.4 snapshot allowlist의 UI 파일만 명시 content type과 immutable 캐시로 제공하고 임의 경로·미등록 hash·symlink 이탈 요청을 거부하는 API 테스트를 추가한다.

## 4. 웹 런타임 로더와 격리

- [ ] 4.1 플랫폼 웹과 외부 UI가 같은 React instance와 `@oss-scp/plugin-ui` major를 사용하도록 공유 module mapping을 구성하고 hook 기반 샘플로 중복 React가 없음을 검증한다.
- [ ] 4.2 화면별 UI descriptor를 비동기 import해 기존 `CustomPluginViewSet` 경계에 연결하고 UI 없음·목록만·상세만·직접 URL·새로고침 테스트를 통과시킨다.
- [ ] 4.3 download·import·export·render 실패를 route 영역에 격리하고 공통 화면 자동 fallback 없이 shell·다른 메뉴 탐색이 유지되는 테스트를 추가한다.
- [ ] 4.4 content-hash CSS를 플러그인 route root lifecycle에 맞춰 적용·제거하고 서로 다른 플러그인 스타일이 충돌하지 않는 브라우저 테스트를 추가한다.
- [ ] 4.5 배포 CSP를 same-origin 공유 module·UI 파일·기존 API만 허용하도록 갱신하고 원격 script/style 차단 및 정상 UI 로드 테스트를 통과시킨다.

## 5. 통합 배포와 문서

- [ ] 5.1 sample2 사용자 정의 목록·상세를 플러그인 UI 원본으로 이전하고 제작→빌드→플랫폼 검증→메뉴 로드의 실제 통합 테스트를 통과시킨다.
- [ ] 5.2 동일 플랫폼 이미지에서 플러그인 UI revision 교체·브라우저 캐시 무효화·이전 전체 revision 롤백을 검증하는 Docker 또는 브라우저 통합 테스트를 추가한다.
- [ ] 5.3 플랫폼 업그레이드 전 검증에서 지원 UI 계약과 React 범위는 통과하고 미지원 조합은 배포 전에 실패하는 통합 테스트를 추가한다.
- [ ] 5.4 UI 없는 기존 플러그인의 생성·검증·수집·공통 목록·상세 회귀 테스트를 통과시킨다.
- [ ] 5.5 플러그인 개발 문서에 소스/운영 디렉터리, #109 기반 단일 build, manifest, 신뢰 코드 경계, 설치·검증·롤백 절차를 문서화하고 문서의 명령 예제를 CI에서 실행한다.
