## 1. 현재 계약과 사용자 흐름 정리

- [x] 1.1 #106의 정적 사용자 정의 화면 계약과 현재 플러그인 제작·등록·검증 흐름을 조사하고 `proposal.md`와 `design.md`의 Context에서 확인할 수 있게 정리한다.
- [x] 1.2 사용자 정의 UI가 없는 기존 플러그인은 추가 빌드 없이 같은 설치 흐름을 유지하고, UI가 있는 플러그인도 하나의 완성된 디렉터리로 설치한다는 범위를 proposal과 specs에서 확인한다.

## 2. 빌드·배포 계약 설계

- [x] 2.1 UI 원본 진입점, 단일 공통 build, 운영 배포 디렉터리, ESM 번들과 manifest 필드를 설계하고 `plugin-ui-distribution` 명세 시나리오로 검증 가능하게 작성한다.
- [x] 2.2 서버 설정·transform·선택적 UI를 하나의 플러그인 revision으로 검증·배포·롤백하고 플랫폼 이미지와 독립적으로 교체하는 흐름을 design과 `server-plugin-deployment` delta에 반영한다.

## 3. 호환성·보안·런타임 계약 설계

- [x] 3.1 최소 UI 공개 API, 공유 React, UI 계약 major와 플랫폼 업그레이드 전 호환성 검증 정책을 design과 specs에 명시한다.
- [x] 3.2 기동 전 경로·SHA-256·호환성 검증, same-origin 제공, CSP, CSS 제한, route 오류 격리와 content hash 캐시 규칙을 design과 specs에 명시한다.
- [x] 3.3 같은 브라우저 realm의 운영자 검토 신뢰 코드라는 경계와 운영 중 transpile·의존성 설치·원격 코드·비신뢰 sandbox 제외 범위를 proposal·design·specs에서 일관되게 확인한다.

## 4. 후속 구현 분해와 설계 검증

- [x] 4.1 후속 구현을 UI 공개 API, #109 제작 스킬·CLI 확장, 서버 검증·제공, 웹 로더, 통합 검증의 다섯 단위로 나누고 각 단위의 의존 관계와 검증 범위를 `design.md`에 기록한다.
- [x] 4.2 proposal, 네 capability delta, design과 task 범위의 일관성을 검토하고 `openspec validate design-independent-plugin-ui --strict`가 통과하는지 확인한다.
