# GitHub Release 번들 선택과 검증

GitHub Release는 설치용 번들 두 개와 두 archive를 검증하는 외부 `SHA256SUMS`를 제공한다. 개별 API·웹 image archive, Compose와 환경변수 예시는 번들 제작용 내부 산출물이며 공개 자산으로 제공하지 않는다.

## 번들 선택

| 자산 | 선택 기준 |
| --- | --- |
| `oss-scp-bundle-<version>.tar.gz` | 운영자가 준비한 PostgreSQL 17.6 또는 MySQL 8.4.6 사용 |
| `oss-scp-bundle-<version>-postgresql.tar.gz` | PostgreSQL 17.6도 같은 서버에 함께 설치 |
| `SHA256SUMS` | 위 두 번들 archive의 다운로드 무결성 검증 |

두 번들 중 환경에 맞는 하나와 `SHA256SUMS`를 같은 디렉터리에 내려받는다. `SHA256SUMS`에는 두 번들이 모두 기록되므로 하나만 받았다면 선택한 파일의 행만 검증한다.

```bash
grep 'oss-scp-bundle-0.1.0.tar.gz$' SHA256SUMS | sha256sum --check
```

PostgreSQL 포함 번들을 선택한 경우:

```bash
grep 'oss-scp-bundle-0.1.0-postgresql.tar.gz$' SHA256SUMS | sha256sum --check
```

외부 `SHA256SUMS`는 내려받은 `.tar.gz` archive 자체를 검증한다. 검증에 성공하면 압축을 풀고 번들 내부 `SHA256SUMS`로 `images.tar`, Compose, manifest와 실행 스크립트를 다시 검증한다.

```bash
tar -xzf oss-scp-bundle-0.1.0.tar.gz
cd oss-scp-bundle-0.1.0
sha256sum --check --strict SHA256SUMS
```

이후 최초 설치, 업데이트, 실패 복구와 DB 백업·복원 절차는 [폐쇄망 번들 가이드](offline-bundle.md)를 따른다. 0.x는 기술 프리뷰이며 검증 대상은 Ubuntu 24.04 `linux/amd64`와 Docker Compose v2다.
