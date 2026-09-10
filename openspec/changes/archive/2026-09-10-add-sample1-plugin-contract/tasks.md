## 1. 계약과 패키지 기반

- [x] 1.1 #14 mock API와 sample1 fixture가 포함된 구현 기준 브랜치에서 플러그인 설정 패키지 위치와 공개 진입점을 추가하고, workspace typecheck가 새 패키지를 인식하는지 확인한다.
- [x] 1.2 `plugin.json`, JSON offset `source.json`, HTTP Connection용 JSON Schema 2020-12 파일과 타입을 추가하고, 정상·필수값 누락·추가 속성·지원하지 않는 버전/방식 테스트로 검증한다.
- [x] 1.3 schema 검증 의존성을 고정 버전으로 workspace에 추가하고 잠금 파일 설치와 전체 라이선스·빌드 호환성을 확인한다.

## 2. 설정 로드와 참조 검증

- [x] 2.1 plugin에서 상대 source 파일을 읽고 절대 경로·디렉터리 이탈·누락 파일을 거부하는 로더를 구현하며 경로별 자동화 테스트를 통과시킨다.
- [x] 2.2 Connection 등록을 읽어 중복 ID와 누락 참조를 거부하고 plugin/source의 허용되지 않은 base URL·비밀 속성을 차단하며 오류에 파일·JSON 경로만 포함되는지 테스트한다.
- [x] 2.3 검증된 세 리소스를 plugin 식별 정보, Connection/base URL, HTTP path/method, itemsPath/totalPath와 offset 설정을 가진 내부 수집 정의로 해석하고 sample1 값이나 72건을 코드에 고정하지 않았음을 다른 정상 fixture 테스트로 확인한다.
- [x] 2.4 여러 설정 오류를 한 번의 검증 결과에서 파일별로 보고하고 비밀 값이나 전체 설정 원문이 노출되지 않는지 테스트한다.

## 3. sample1 플러그인과 개발자 검증

- [x] 3.1 `plugins/sample1-offset-api/plugin.json`, `source.json`과 비밀정보 없는 mock HTTP Connection을 추가하고 검증 결과가 `/sample1`, GET, `rows`, `total`, `offset`, `limit`과 지정 묶음 크기를 반환하는지 확인한다.
- [x] 3.2 저장소 등록 목록과 설정 검증 CLI를 추가하고 유효한 sample1은 종료 코드 0, 잘못된 fixture는 0이 아닌 종료 코드와 명확한 오류를 반환하는지 프로세스 테스트로 확인한다.
- [x] 3.3 sample2 single JSON과 CSV 다운로드가 아직 지원되지 않으며 이후 별도 플러그인으로 확장된다는 경계를 포함해 샘플 작성·검증 문서를 작성하고, 외부 자격증명 없는 깨끗한 복사본에서 문서 명령을 실행한다.
- [x] 3.4 lint·typecheck·단위·프로세스 테스트를 기존 GitHub Actions 검사에 연결하고 로컬 전체 검증과 CI 구성이 같은 명령을 사용하는지 확인한다.
