# 원천 데이터 샘플

외부 API·원천 DB·CSV 파일로 제공되는 데이터를 모사한 샘플입니다.
원천 데이터를 어떻게 가공해 자체 DB에 저장하고,
조회 API를 통해 클라이언트에 제공할지 설계·테스트할 때 사용합니다.

실제 수집 결과가 아니며, 자체 DB 모델과 클라이언트 응답 형식을
정의하는 데이터도 아닙니다.

## 파일 구성

| 파일 | 구조 | 건수 |
| --- | --- | --- |
| [sources/sample1.json](sources/sample1.json) | total과 rows로 구성된 평면 데이터 | 72개 |
| [sources/sample2.json](sources/sample2.json) | items와 최상위 플래그를 포함한 중첩 데이터 | 153개 |
| [csv/vulnerabilities.csv](csv/vulnerabilities.csv) | 헤더 1행과 6개 컬럼의 CSV | 데이터 53개 |

JSON과 CSV는 원천 데이터 구조의 예시이며, 특정 수집 방식에 종속되지 않습니다.

## sample1

호스트 형태의 데이터를 담습니다. total은 rows의 항목 수와 같습니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| env | string | 환경 이름 |
| hostname | string | 호스트 이름 |
| ip | string | IP 주소 |
| test-field1 | number | 정수 예시 |
| test-field2 | number | 소수 예시 |
| test-field3 | number | 자릿수가 큰 정수 예시 |
| test-field4 | string | Y/N 문자열 예시 |
| test-field5 | boolean | 참·거짓 예시 |

## sample2

저장소 형태의 데이터를 items에 담습니다.

아래 필드는 최상위 test_field6을 제외하면 각 items 항목에 속합니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| asset_key | string | 샘플 내 고유 식별자 |
| org | string | 조직 이름 |
| repo | string | 저장소 이름 |
| full_name | string | org/repo 형태의 이름 |
| default_branch | string | 기본 브랜치 이름 |
| test_field1 | boolean | 참·거짓 예시 |
| test_field2 | array | login 문자열을 가진 객체 목록; 빈 배열 포함 |
| test_field3 | object | 중첩 객체 |
| test_field3.test_field4 | string | 중첩 문자열 예시 |
| test_field3.test_field5 | string | UTC 시각 문자열 예시 |
| test_field6 | boolean | 응답 최상위 플래그 예시 |

## CSV 샘플

`csv/vulnerabilities.csv`는 UTF-8, 쉼표 구분, 헤더 포함 CSV입니다.
헤더를 제외한 데이터는 53행이며 `cve-1`부터 `cve-53`까지 중복 없이 구성했습니다.
실제 CVE 기록이 아닌 합성 테스트 데이터입니다.

| 필드 | 가공 시 타입 예시 | 설명 |
| --- | --- | --- |
| cve | string | 샘플 내 유일키 후보 |
| vul | string | 취약점 설명을 대신하는 테스트 문자열 |
| test-data1 | string | GOOD·WARN·BAD 문자열 예시 |
| test-data2 | number | 10.0 등 소수 표기 예시 |
| test-data3 | number | 100 등 정수 표기 예시 |
| test-data4 | number | 0.10 등 소수 표기 예시 |

첫 데이터 행은 `cve-1,abc,GOOD,10.0,100,0.10`입니다.
CSV 자체에는 타입 정보가 없으므로 숫자 변환은 후속 JS/TS 가공 코드에서 정의합니다.
로컬 파일 읽기와 API 다운로드 후 CSV 읽기가 같은 파서를 사용하는 흐름의 입력으로 활용할 수 있습니다.
53행은 20건씩 처리할 때 20·20·13건으로 나뉘는 마지막 묶음 검증에도 사용할 수 있으며,
수집 묶음 크기와 화면 페이지 크기는 별도 설정입니다.

## 활용 범위

다음 흐름의 설계와 테스트에 사용합니다.

원천 데이터 → 검증·변환 → 자체 DB 저장 → 조회 API → 클라이언트

- 수집 결과에서 처리 대상 목록(rows, items)을 추출하는 방법
- 원천 필드와 자체 DB 필드의 매핑
- 숫자, Y/N 문자열, boolean, 시각 문자열의 처리
- 중첩 객체와 배열의 저장 방식
- CSV 행 추출, 문자열의 숫자 변환과 마지막 묶음 처리
- 자산 식별 기준과 재수집 시 갱신 방식
- 클라이언트에 제공할 목록·상세 응답 구조

test 필드의 업무 의미와 변환 규칙은 아직 정하지 않았습니다.
원천 값은 그대로 보존하고, 변환 규칙은 후속 설계에서 정의합니다.

정적 JSON·CSV 파일을 [원천 Mock API](../docs/mock-api.md)로 제공할 수 있습니다.
로컬 실행과 선택적 Docker 실행을 지원합니다. 실제 수집 클라이언트, DB 접근, 가공·저장은 포함하지 않습니다.
