// 이 파일은 scripts/generate-plugin-menu.mjs가 생성합니다. 직접 수정하지 마세요.
export const pluginMenus = [
  {
    "title": "취약점",
    "icon": "shield",
    "group": "보안 관리",
    "order": 10,
    "path": "/vulnerabilities",
    "dataType": "vulnerability",
    "pluginId": "vulnerabilities-local-csv",
    "sourceId": "fixtures/csv/vulnerabilities.csv"
  },
  {
    "title": "HTTP 취약점",
    "icon": "shield",
    "group": "보안 관리",
    "order": 20,
    "path": "/vulnerabilities/http",
    "dataType": "vulnerability",
    "pluginId": "vulnerabilities-http-csv",
    "sourceId": "mock-api-vulnerabilities-csv"
  },
  {
    "title": "서버 자산",
    "icon": "server",
    "group": "자산 관리",
    "order": 10,
    "path": "/assets/servers",
    "dataType": "asset",
    "pluginId": "sample1-offset-api",
    "sourceId": "mock-api-sample1"
  },
  {
    "title": "저장소",
    "icon": "repository",
    "group": "자산 관리",
    "order": 20,
    "path": "/assets/repositories",
    "dataType": "repository",
    "pluginId": "sample2-single-api",
    "sourceId": "mock-api-sample2"
  }
] as const;
