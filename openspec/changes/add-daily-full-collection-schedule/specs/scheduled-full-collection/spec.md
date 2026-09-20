## Purpose

운영자가 선택한 IANA 시간대와 현지 시각에 등록·활성 저장형 대상을 매일 한 번 안전하게 전체 동기화하는 외부 동작을 정의한다.

## ADDED Requirements

### Requirement: 일일 수집 일정 설정과 기동 검증
플랫폼은 외부 배포 설정에서 일일 수집의 `enabled`, `timezone`, `time`을 입력받아야 한다(SHALL). 설정을 생략하거나 `enabled: false`이면 정기 수집을 실행하지 않아야 하며(MUST NOT), `enabled: true`에서 생략한 timezone과 time은 각각 `Asia/Seoul`, `22:00`이어야 한다(SHALL). timezone은 유효한 IANA 식별자이고 time은 엄격한 24시간제 `HH:mm`이어야 하며, 알 수 없는 키·잘못된 타입·값은 HTTP listen 전에 기동을 실패시켜야 한다(SHALL).

#### Scenario: 설정 생략과 비활성화
- **WHEN** 일정 설정이 없거나 `enabled`가 false인 유효한 설정으로 API를 시작한다
- **THEN** 정기 수집 timer와 scheduled 실행 이력을 만들지 않고 기동·수동 수집의 기존 동작을 유지한다

#### Scenario: 활성화 기본값
- **WHEN** 운영자가 `enabled: true`만 설정한다
- **THEN** 플랫폼은 Asia/Seoul 현지 시각 매일 22:00을 다음 실행 시각으로 사용한다

#### Scenario: 잘못된 일정 설정
- **WHEN** 일정 설정에 알 수 없는 키, 잘못된 타입, 유효하지 않은 IANA timezone 또는 엄격한 `HH:mm`이 아닌 time이 있다
- **THEN** 플랫폼은 원천 수집과 HTTP listen 전에 비민감 설정 오류로 기동을 거부한다

### Requirement: 예정 시각마다 활성 저장형 대상 전체 수집
활성 일정의 예정 시각마다 플랫폼은 기동 시 확정한 registry의 등록·활성 저장형 대상을 각각 full 범위로 한 번 요청해야 한다(SHALL). `persistence: none` 대상은 제외해야 하며(MUST), 대상별 실행은 기존 공통 수집 runner와 영속 실행권을 사용해야 한다(SHALL).

#### Scenario: 여러 활성 대상
- **WHEN** 예정 시각에 등록·활성 저장형 대상이 둘 이상 있다
- **THEN** 플랫폼은 각 대상을 full 범위로 요청하고 한 대상의 실패가 다른 대상의 시작이나 완료를 막지 않는다

#### Scenario: 대상 없음 또는 live 대상만 존재
- **WHEN** 예정 시각에 등록·활성 저장형 대상이 없다
- **THEN** 플랫폼은 원천 수집, lease, 실행 이력을 만들지 않고 다음 일정을 계산한다

#### Scenario: 다른 trigger와 동시 실행
- **WHEN** scheduled 요청이 같은 설정 revision·대상·full 범위의 기동·CLI·API 실행과 겹친다
- **THEN** DB 실행권을 얻은 하나만 원천 수집과 결과 확정을 수행하고 중복 요청은 현재 실행을 참조한다

### Requirement: 현지 일자와 DST에 대해 하루 한 번 실행
플랫폼은 각 실행 뒤 설정 timezone의 다음 현지 날짜 발생 시각을 다시 계산해야 하며(SHALL), 경과 간격을 반복 재생해서는 안 된다(MUST NOT). 존재하지 않는 현지 시각은 해당 현지 날짜의 첫 유효 시각에 한 번 실행하고, 두 번 나타나는 현지 시각은 첫 번째 발생에만 실행해야 한다(SHALL).

#### Scenario: DST gap
- **WHEN** 설정 time이 timezone의 시계 전진으로 해당 현지 날짜에 존재하지 않는다
- **THEN** 플랫폼은 gap 뒤 첫 유효 시각에 한 번 실행하고 그 날짜에 다시 실행하지 않는다

#### Scenario: DST overlap
- **WHEN** 설정 time이 timezone의 시계 후퇴로 같은 현지 날짜에 두 번 나타난다
- **THEN** 플랫폼은 첫 번째 발생 시각에만 실행한다

#### Scenario: 중단 중 놓친 일정
- **WHEN** 하나 이상의 예정 시각 동안 API가 중단된 뒤 재시작한다
- **THEN** 플랫폼은 놓친 scheduled 실행을 보충하지 않고 재시작 이후의 다음 발생만 예약하며 독립적인 기동 수집은 기존 계약대로 요청한다

### Requirement: 설정 snapshot과 안전한 종료
실행 중인 API는 기동 시 검증한 일정, runtime definition, revision과 정확한 transform 바이트 digest/source의 불변 snapshot을 계속 사용해야 하며(SHALL), 설정·transform 파일 변경은 성공적인 재기동 뒤에만 적용해야 한다(MUST). scheduled transform은 self-contained여야 하고 상대·절대 경로 및 filesystem-backed package import/require를 포함한 외부 module access를 module top-level 실행 전에 거부해야 한다(SHALL). 이 제한은 schedule 활성 경로에 적용하고 비-scheduled transform 로딩 계약을 바꾸지 않아야 한다(MUST). scheduled 자식은 snapshot 구조·revision·정확한 바이트 digest를 transform module top-level 실행 전에 검증하고 검증한 바이트 자체를 파일 재조회 없이 실행해야 한다(SHALL). 자식 환경에는 필수 runtime 값, `PLATFORM_DB_*`와 해당 대상 Connection이 참조하는 수집 credential만 전달해야 하며(MUST), `AUTH_*`, `LDAP_*` 및 무관한 부모 환경은 전달해서는 안 된다(MUST NOT). 종료 시 pending timer를 취소하고 시작된 scheduled 자식 수집에 `SIGTERM`을 전달한 뒤 grace period 안에 종료하지 않으면 `SIGKILL`하고, close 대기를 유한 상한 안에 끝내야 한다(SHALL).

#### Scenario: 실행 중 설정 변경
- **WHEN** API 기동 뒤 외부 설정의 일정, registry 또는 transform 파일이 변경된다
- **THEN** 현재 프로세스의 일정, 대상 definition과 실행할 transform 바이트는 바뀌지 않고 재기동 검증 뒤에만 새 값이 적용된다

#### Scenario: transform 교체 경쟁
- **WHEN** 기동 snapshot을 만든 뒤 자식이 실행되기 전 transform 파일이 교체되거나 전달된 snapshot의 구조·revision·digest가 일치하지 않는다
- **THEN** 자식은 현재 파일을 import하지 않고 불일치한 snapshot의 module top-level도 실행하지 않으며, 검증한 snapshot 바이트만 실행할 수 있다

#### Scenario: transform helper 교체
- **WHEN** schedule 활성 transform이 상대·절대 경로나 package를 import/require하거나 해당 helper가 기동 뒤 교체된다
- **THEN** 플랫폼은 transform과 helper의 top-level을 실행하기 전에 기동을 거부하고 helper 파일을 scheduled 실행에서 다시 읽지 않는다

#### Scenario: 비-scheduled transform 호환성
- **WHEN** schedule이 비활성화된 기존 transform이 로컬 helper를 require한다
- **THEN** 기존 preflight와 수동·기동 수집 module loading 계약은 유지된다

#### Scenario: scheduled 자식 환경 격리
- **WHEN** API 부모 환경에 플랫폼 DB, 대상 수집 credential, 인증·LDAP와 무관한 비밀이 함께 있다
- **THEN** scheduled 자식에는 플랫폼 DB와 해당 대상 수집에 필요한 값만 전달되고 `AUTH_*`, `LDAP_*`와 무관한 비밀은 전달되지 않는다

#### Scenario: 종료 중 scheduled 수집
- **WHEN** 예정 수집이 진행 중인 동안 API가 종료 신호를 받는다
- **THEN** pending timer를 제거하고 진행 중 자식에 `SIGTERM`을 전달하며 grace 뒤 생존 자식은 `SIGKILL`하고, 유한한 대기 상한 안에 종료 lifecycle을 반환하며 완료되지 않은 실행을 성공으로 기록하지 않는다
