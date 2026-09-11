import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateRepository } from '../packages/plugin-config/dist/index.js';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'apps/web/src/generated/plugin-menu.ts');
const result = validateRepository(root);
if (!result.ok) {
  for (const issue of result.errors) console.error(`${issue.file}${issue.path}: ${issue.message}`);
  process.exit(1);
}
const output = `// 이 파일은 scripts/generate-plugin-menu.mjs가 생성합니다. 직접 수정하지 마세요.\nexport const pluginMenus = ${JSON.stringify(result.menus, null, 2)} as const;\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) {
    console.error('웹 메뉴 manifest가 플러그인 registry와 일치하지 않습니다. pnpm generate:web-menu를 실행하세요.');
    process.exit(1);
  }
} else {
  writeFileSync(target, output);
}
