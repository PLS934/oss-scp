# OSS-SCP 폐쇄망 설치 번들

이 디렉터리는 하나의 제품 버전에 고정된 이미지와 배포 도구를 포함합니다. `env.example`을 `.env`로 복사해 운영 환경 값을 입력하되 비밀번호·토큰은 별도 보호된 환경 파일 또는 실행 환경으로 제공하세요.

```bash
sha256sum --check SHA256SUMS
./install.sh
./verify.sh
```

기존 DB용 기본 번들은 PostgreSQL 17.6 또는 MySQL 8.4.6의 전용 빈 database와 migration 가능한 계정이 필요합니다. `-postgresql` 번들은 PostgreSQL 이미지와 영속 volume을 함께 제공합니다. 운영자 플러그인·Connection은 번들에 없으며 사전 빌드된 설정 디렉터리를 별도로 준비해야 합니다.

업데이트 전에는 DB 제품의 표준 도구로 백업하고 현재 플러그인 설정 revision을 보존하세요. 자세한 절차와 실패 복구 경계는 저장소의 `docs/offline-bundle.md`를 참고하세요.
