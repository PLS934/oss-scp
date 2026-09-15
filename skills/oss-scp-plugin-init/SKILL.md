---
name: oss-scp-plugin-init
description: OSS-SCP 플랫폼 사용자의 첫 수집 플러그인을 독립 설정 폴더에 생성하고 대상 플랫폼 규칙으로 검증한다. OSS-SCP에 API·CSV를 연결하거나 플러그인 초기 설정을 요청할 때 사용한다.
---

# OSS-SCP 플러그인 초기 설정

이 스킬이 설치된 폴더를 기준으로 `scripts/`, `assets/`, `references/`를 찾는다. 특정 AI 도구의 API나 플랫폼 소스 checkout 없이 Node.js로 초기 설정을 만든다.

## 입력 확인

기존 대화·파일에서 확인 가능한 값은 재질문하지 않는다. 실제 원천 샘플, 안정적인 유일키, 필요한 표시 필드, 플러그인 ID, 새 출력 폴더, 대상 플랫폼 버전과 검증 환경을 확인한다. 정보가 없으면 예제임을 명시하고 초기 설정을 만들 수 있지만 실제 연동 완료로 보고하지 않는다.

지원 방식은 `json-single`, `json-offset`, `csv-file`, `csv-http`다. 선택과 필드 수정에는 [작성 계약](references/authoring.md)을 읽는다. 지원하지 않는 인증·페이지 방식은 임의로 설정을 발명하지 않고 필요한 플랫폼 확장을 설명한다.

## 생성과 수정

```sh
node <설치된-스킬>/scripts/init.mjs --root <새-설정-폴더> --id <플러그인-ID> --source <지원-방식>
```

출력 부모 폴더는 존재해야 한다. 기존 출력 경로는 빈 폴더라도 실패한다. 기존 운영 설정에 직접 생성하거나 registry를 덮어쓰지 않는다.

`plugin.json`의 필드·유일키·목록·상세와 `transform.js`를 원천 샘플에 맞춰 함께 수정한다. HTTP 환경 주소는 Connection에, 요청 상대 경로와 페이지 설정은 source에 둔다. 생성된 JavaScript는 바로 로드할 수 있다. TypeScript를 선택한다면 대상 버전 SDK로 사전 빌드하고 transform 경로를 빌드 결과로 바꾼다.

## 검증

설치 시 기록한 Git ref와 대상 플랫폼 버전이 같은지 확인한다. 대상 이미지 또는 로컬 checkout 중 준비된 경로를 사용한다.

```sh
node <설치된-스킬>/scripts/validate.mjs --root <설정-폴더> --image <API-이미지:제품버전>
# 개발 checkout이 있을 때
node <설치된-스킬>/scripts/validate.mjs --root <설정-폴더> --platform-root <플랫폼-checkout>
```

검증은 기존 플랫폼 preflight를 사용한다. 실패 위치를 읽고 해당 설정을 고친 뒤 다시 검증한다. 검증기가 없으면 준비 방법을 안내하고 미검증으로 보고한다. 오류를 피하려고 검증을 생략하거나 새 스키마를 만들지 않는다.

설정·모듈 export 검증은 transform 실행·원천 호출·DB 저장·화면 조회 검증과 다르다. 실제 수집 실행은 사용자가 요청한 범위에 있을 때 대상 버전 운영 가이드를 따라 진행한다. 스킬 호출만으로 운영 배포·DB 변경·GitHub 게시가 승인된 것으로 취급하지 않는다.

## 완료 보고

생성 폴더, 선택한 source, 예제로 남은 값, 실제 실행한 검증과 결과, 첫 수집에 필요한 다음 단계를 간단히 알린다. 첫 수집과 배포 안내는 [작성 계약](references/authoring.md#첫-수집)에서 확인한다.
