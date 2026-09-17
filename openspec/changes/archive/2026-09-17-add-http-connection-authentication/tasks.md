## 1. Connection 인증 계약

- [ ] 1.1 HTTP Connection schema와 TypeScript 타입에 API key, Bearer, Basic 환경변수 참조 판별 공용체를 추가하고 plugin-config schema 테스트로 세 방식과 인라인 비밀값 거부를 검증한다.
- [ ] 1.2 설정 로더가 인증 참조를 JSON·HTTP CSV 내부 정의에만 전달하고 브라우저용 플러그인 상세·메뉴 결과에서는 제외하도록 구현한 뒤 공개 결과 비노출 테스트를 통과시킨다.

## 2. 안전한 credential 해석

- [ ] 2.1 수집 프로세스 환경에서 credential을 읽어 인증 헤더를 생성하는 공통 resolver와 안정적인 인증 오류를 구현하고 누락·빈 값·CR/LF·Basic 사용자명 구분자 사례를 단위 테스트로 검증한다.
- [ ] 2.2 실제 credential이나 생성된 Authorization·API key 헤더가 오류 객체·메시지와 직렬화 결과에 포함되지 않는지 회귀 테스트로 검증한다.

## 3. HTTP 수집기 적용

- [ ] 3.1 HTTP JSON offset·single 수집기에 공통 인증 헤더를 적용하고 API key, Bearer, Basic 성공 및 환경변수 누락 시 요청 전 실패를 loopback HTTP 테스트로 검증한다.
- [ ] 3.2 HTTP CSV 수집기에 같은 인증 헤더를 적용하고 인증 성공, 요청 전 실패 및 인증 오류 비노출을 loopback HTTP 테스트로 검증한다.
- [ ] 3.3 인증 설정이 없는 기존 JSON·CSV 수집과 대용량 메모리 제한 테스트가 변경 없이 통과하는지 확인한다.

## 4. 운영 문서와 전체 검증

- [ ] 4.1 플러그인 개발 문서에 세 인증 설정 예시, 환경변수 이름·비밀정보 비노출 규칙 및 token 발급·OAuth 갱신·요청 서명 미지원 범위를 문서화한다.
- [ ] 4.2 수동 CLI 문서에 로컬 환경변수와 Docker Compose 환경 매핑·일회성 전달 예시를 추가하고 실제 값을 Git·이미지·CLI 인자에 저장하지 않는 원칙을 확인한다.
- [ ] 4.3 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `git diff --check`를 실행해 전체 회귀와 정적 검사를 통과시킨다.
