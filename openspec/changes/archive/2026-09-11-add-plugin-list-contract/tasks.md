## 1. 공개 플러그인 계약

- [x] 1.1 `FieldDefinition`에 필수 `label`, `DataTypeDefinition`에 `views.list.columns` 타입을 추가하고 TypeScript 빌드로 계약을 확인한다.
- [x] 1.2 `plugin-v1` JSON Schema에 모든 재귀 필드의 label 제약과 비어 있지 않고 중복 없는 columns 구조를 추가하고 schema 실패 테스트를 통과시킨다.

## 2. 참조 검증과 클라이언트 산출물

- [x] 2.1 목록 column의 누락 필드와 object·array 참조를 데이터 종류별 JSON path 오류로 거부하고 plugin-config 단위 테스트를 통과시킨다.
- [x] 2.2 선언 순서대로 `{ key, label, type }`을 생성하는 `ClientListColumn`과 메뉴의 `list` 산출물을 구현하고 plugin-config 테스트로 전체 field 정의 및 서버 전용 정보가 제외되는지 확인한다.

## 3. 샘플과 런타임 경계

- [x] 3.1 sample1, sample2와 로컬·HTTP CSV 플러그인의 모든 재귀 필드에 label과 데이터 종류별 기본 columns를 추가하고 저장소 전체 설정 검증을 통과시킨다.
- [x] 3.2 `/api/v1/plugin-menus` 테스트 fixture와 응답 검증을 확장해 조회 범위별 목록 메타데이터가 제공되고 Connection·source·transform 정보는 노출되지 않음을 확인한다.
- [x] 3.3 웹 메뉴 응답 타입·loader·routing fixture를 확장해 목록 메타데이터가 손실 없이 전달되고 기존 메뉴 정렬·라우팅 테스트가 통과하는지 확인한다.

## 4. 문서와 통합 검증

- [x] 4.1 `docs/plugin-development.md`에 필드 label, `views.list.columns`, scalar-only 참조 규칙과 검증 오류 예시를 문서화하고 예제 JSON이 실제 schema를 통과하는지 확인한다.
- [x] 4.2 관련 package 테스트·lint·typecheck·build와 저장소 검증 명령을 실행해 기존 수집·가공·저장·메뉴 동작의 회귀가 없는지 확인한다.
