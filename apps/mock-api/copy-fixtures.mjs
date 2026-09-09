import { copyFileSync, mkdirSync } from 'node:fs';
for (const file of ['sources/sample1.json', 'sources/sample2.json', 'csv/vulnerabilities.csv']) {
  const target = new URL(`./dist/fixtures/${file}`, import.meta.url);
  mkdirSync(new URL('.', target), { recursive: true });
  copyFileSync(new URL(`../../fixtures/${file}`, import.meta.url), target);
}
