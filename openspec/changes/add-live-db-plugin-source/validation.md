# 검증 결과

검증일: 2026-09-17

- `pnpm --filter @oss-scp/plugin-config test`: 107개 통과. 혼합 registry, 비밀 참조, SQL AST 허용·거부, 외부 SQL 재적용을 확인했다.
- `pnpm --filter @oss-scp/api test`: 60개 통과. PostgreSQL 17.6 컨테이너에서 512행 UNION ALL, 500행 이후 literal 검색, 필터·정렬·전체 건수, 종류별 외부 키 상세, cache revision·TTL·동시 요청 병합, statement timeout·rollback을 확인했다.
- `pnpm --filter @oss-scp/web test`: 155개 통과. 기존 저장형 목록·상세와 검색·필터·정렬 UI 회귀를 확인했다.
- `pnpm --filter @oss-scp/collector-cli test`: 23개 통과. 무저장 라이브 소스가 플랫폼 DB 연결 및 수집 실행 전에 거부됨을 확인했다.
- `pnpm test:browser`: 통과. 라이브 목록, 상태 표시, 외부 키 상세 이동, 직접 URL·새로고침과 기존 저장형 브라우저 흐름을 확인했다.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: 통과.
- `pnpm validate:plugins`: 통과. 실제 원천 연결 없이 schema와 registry 교차 참조를 검증했다.
- `openspec validate add-live-db-plugin-source --strict`: 통과.

#115 완료 조건 중 실제 DB 연결은 합성 PostgreSQL fixture로 검증했다. 실제 운영 Dependency Track 스키마와 운영 부하는 검증 범위가 아니며 `fixtures/postgres/dependency-track.sql`과 문서에 이를 명시했다. 플랫폼 DB migration은 추가하지 않았고 라이브 실행 경로는 플랫폼 저장 adapter를 주입받지 않는다. API 테스트에서 라이브 목록·상세·오류 요청 중 플랫폼 저장형 adapter 호출이 0회임을 확인했다.
