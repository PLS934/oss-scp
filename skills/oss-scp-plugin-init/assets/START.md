# 첫 OSS-SCP 플러그인

이 폴더는 운영 설정과 분리된 초기 예제입니다. 생성은 수집이나 배포를 실행하지 않습니다.

1. `plugins/registry.json`에 등록된 플러그인의 `source.json`, `plugin.json`, `transform.js`를 확인합니다.
2. `id`·`name`은 수정이 필요한 예제입니다. 실제 원천 샘플과 안정적인 유일키를 확인하고 필드·목록·상세와 transform을 함께 수정합니다. CSV의 숫자·boolean·날짜는 명시적으로 변환합니다.
3. HTTP는 Connection의 base URL, source의 상대 path와 `itemsPath`·pagination을 수정합니다. `127.0.0.1`은 실행 환경 자신을 가리키므로 컨테이너에서 접근할 수 있는 주소로 바꿉니다. 인증 값을 plugin/source/transform에 넣지 않습니다.
4. 설치한 스킬의 `scripts/validate.mjs --root <이 폴더> --image <대상 API 이미지:버전>`을 Node.js로 실행합니다. 이미지는 릴리스 번들에서 먼저 load해야 하며 스킬과 같은 릴리스 ref를 사용합니다.
5. 설정·모듈 검증은 네트워크 호출, transform 결과 검증, DB 저장을 수행하지 않습니다. 실제 수집은 대상 버전 운영 가이드를 따라 별도로 실행합니다.

JavaScript transform은 바로 로드됩니다. TypeScript로 바꾸는 경우 대상 버전 SDK로 사전 빌드하고 `plugin.json`의 transform을 빌드 결과로 지정합니다. 플랫폼 런타임은 TypeScript를 컴파일하지 않습니다.

기존 운영 설정에 적용할 때는 plugin·Connection ID와 메뉴 경로의 충돌을 확인해 registry를 병합하고 전체 설정을 다시 검증합니다. 이 폴더로 기존 설정 루트를 덮어쓰지 않습니다.
