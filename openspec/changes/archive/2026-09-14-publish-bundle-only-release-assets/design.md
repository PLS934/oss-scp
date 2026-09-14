## Context

동기는 [proposal.md](proposal.md)의 Why를 따른다. 현재 릴리스 작업은 API·웹 image archive와 Compose·환경 예시를 `release-output`에 생성하고, 이를 입력으로 두 오프라인 번들을 `bundle-output`에 만든 뒤 두 디렉터리의 산출물 7개를 모두 게시한다. 번들 생성기는 개별 image archive를 필요로 하지만 최종 사용자는 완성된 번들만 필요하다.

외부 `SHA256SUMS`와 각 번들 내부의 `SHA256SUMS`는 이름은 같지만 검증 경계가 다르다. 외부 파일은 다운로드한 두 archive의 전송 무결성을, 내부 파일은 압축 해제 후 번들 구성 파일의 무결성을 검증한다.

## Goals / Non-Goals

**Goals:**

- 번들 생성 과정과 이미지 provenance 검증은 유지하면서 공개 자산을 정확히 세 파일로 제한한다.
- 공개 checksum이 최종 번들 archive만 결정적인 순서로 검증하게 한다.
- 자동화 테스트가 업로드 허용 목록과 금지 목록을 함께 검증하게 한다.

**Non-Goals:**

- `release-output` 내부 파일 형식이나 번들 내부 파일 구조를 재설계하지 않는다.
- 이미 게시된 Release를 수정하거나 자산을 삭제하지 않는다.
- Registry 배포나 번들 변형을 추가하지 않는다.

## Decisions

### 1. 개별 산출물은 내부 작업 입력으로 유지한다

`build-release-assets.sh`가 생성하는 API·웹 archive, Compose, 환경 예시는 번들 생성과 기존 검증에 계속 사용한다. 공개 여부만 릴리스 업로드 단계에서 제한한다.

대안으로 API·웹 이미지를 `docker save`에서 바로 번들 생성기로 전달할 수 있지만, 기존 검증 경계를 넓게 바꾸고 독립 산출물 테스트를 약화시키므로 채택하지 않는다.

### 2. 외부 checksum은 번들 생성 후 별도 생성한다

두 번들 archive가 완성된 뒤 `bundle-output/SHA256SUMS`를 생성하고, 파일명 기준의 결정적인 순서로 두 archive만 기록한다. `release-output/SHA256SUMS`는 내부 산출물 검증에 필요하면 유지하되 공개하지 않는다.

기존 `release-output/SHA256SUMS`를 덮어쓰는 대안은 파일의 위치와 검증 대상이 어긋나 작업 디렉터리 간 경계를 흐리므로 채택하지 않는다.

### 3. 업로드는 명시적 허용 목록으로 제한한다

릴리스 생성 명령에는 `bundle-output`의 두 archive와 외부 `SHA256SUMS`만 명시한다. glob 업로드는 향후 내부 산출물이 우연히 공개되는 위험이 있어 사용하지 않는다.

자동화 테스트는 세 공개 자산의 존재뿐 아니라 API·웹 archive, 독립 Compose, 환경 예시가 업로드 인수에 없는지도 검증한다.

### 4. 문서는 번들 선택과 두 checksum 층을 중심으로 정리한다

Release 본문과 설치 문서는 기존 DB가 있으면 기본 번들, DB도 함께 설치하면 PostgreSQL 번들을 선택하도록 안내한다. 외부 checksum을 먼저 검증하고 압축 해제 후 내부 checksum을 검증하는 순서를 구분한다.

## Risks / Trade-offs

- [개별 이미지 archive를 직접 사용하던 사용자의 경로가 사라짐] → `v0.1.0-rc.1`은 보존하고, 기술 프리뷰의 다음 RC부터 번들을 공식 설치 단위로 문서화한다.
- [동일한 `SHA256SUMS` 이름으로 검증 대상 혼동] → 외부/내부 파일의 위치, 명령 실행 디렉터리와 검증 대상을 Release 본문과 설치 문서에 함께 명시한다.
- [내부 산출물이 다시 공개 목록에 추가될 수 있음] → 워크플로 정적 테스트에서 정확한 허용 목록과 금지 목록을 모두 검사한다.

## Migration Plan

1. 릴리스 테스트를 새 공개 자산 계약에 맞게 변경한다.
2. 번들 생성 후 외부 checksum을 만들고 검증한다.
3. GitHub Release 업로드 목록을 세 파일로 제한한다.
4. Release 본문과 설치 문서를 변경한다.
5. 다음 RC 태그의 draft 자산 목록과 checksum을 검증한 뒤 공개한다.

롤백은 워크플로 변경을 되돌리는 것으로 충분하다. 이미 게시된 `v0.1.0-rc.1`에는 적용하지 않으며 기존 Release를 수정하지 않는다.
