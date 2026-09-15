#!/usr/bin/env node
import { existsSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const usage = 'node validate.mjs --root <설정 폴더> (--image <버전 고정 API 이미지> | --platform-root <빌드된 플랫폼 checkout>)';

export function validationCommand({ root, image, 'platform-root': platformRoot }) {
  if (!root || Boolean(image) === Boolean(platformRoot)) throw new Error(usage);
  const configRoot = realpathSync(root);
  if (!statSync(configRoot).isDirectory()) throw new Error('설정 루트는 폴더여야 합니다.');
  if (platformRoot) {
    const cli = resolve(platformRoot, 'packages/plugin-config/dist/cli.js');
    if (!existsSync(cli)) throw new Error('플랫폼 검증기를 먼저 빌드하세요: pnpm --filter @oss-scp/plugin-config build');
    return { command: process.execPath, args: [cli, '--root', configRoot] };
  }
  // 레지스트리 포트가 아니라 마지막 경로 요소의 버전 태그 또는 digest를 확인한다.
  if (image.startsWith('-') || !/^[^\s]+(?::v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?|@sha256:[a-f0-9]{64})$/.test(image)) {
    throw new Error('이미지에 명시적인 제품 버전 태그 또는 sha256 digest가 필요합니다. latest는 사용할 수 없습니다.');
  }
  if (configRoot.includes(',') || configRoot.includes('\n')) throw new Error('Docker mount 경로에는 쉼표나 줄바꿈을 사용할 수 없습니다.');
  return { command: 'docker', args: [
    'run', '--rm', '--pull=never', '--network=none', '--read-only',
    '--mount', `type=bind,src=${configRoot},dst=/config,readonly`,
    '--entrypoint', 'node', image,
    '/app/node_modules/@oss-scp/plugin-config/dist/cli.js', '--root', '/config',
  ] };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      root: { type: 'string' }, image: { type: 'string' }, 'platform-root': { type: 'string' }, help: { type: 'boolean' },
    } });
    if (values.help) console.log(usage);
    else {
      const { command, args } = validationCommand(values);
      const result = spawnSync(command, args, { stdio: 'inherit' });
      if (result.error) throw new Error(`검증기 실행 실패: ${result.error.message}`);
      process.exitCode = result.status ?? 1;
      if (process.exitCode === 0) console.log('설정·모듈 검증 성공. 실제 수집·저장·조회는 별도로 확인해야 합니다.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
