#!/usr/bin/env node
import { realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const usage = 'node validate.mjs --root <설정 폴더> --image <버전 고정 API 이미지>';

function pinnedImage(image) {
  if (typeof image !== 'string' || image.startsWith('-') || /[\s,]/.test(image)) return false;
  const digest = image.match(/^(.+)@sha256:([a-f0-9]{64})$/);
  if (digest) return validImageName(digest[1]);
  const slash = image.lastIndexOf('/');
  const colon = image.lastIndexOf(':');
  if (colon <= slash) return false;
  const name = image.slice(0, colon);
  const tag = image.slice(colon + 1);
  return validImageName(name)
    && /^v?(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?$/.test(tag);
}

function validImageName(name) {
  return /^[a-z0-9][a-z0-9._-]*(?::[0-9]+)?(?:\/[a-z0-9][a-z0-9._-]*)*$/.test(name);
}

export function validationCommand({ root, image }) {
  if (!root || !image) throw new Error(usage);
  const configRoot = realpathSync(root);
  if (!statSync(configRoot).isDirectory()) throw new Error('설정 루트는 폴더여야 합니다.');

  if (!pinnedImage(image)) {
    throw new Error('이미지에 명시적인 제품 버전 태그 또는 sha256 digest가 필요합니다. latest와 고정되지 않은 참조는 사용할 수 없습니다.');
  }
  if (configRoot.includes(',') || configRoot.includes('\n') || configRoot.includes('\r')) {
    throw new Error('Docker mount 경로에는 쉼표나 줄바꿈을 사용할 수 없습니다.');
  }
  return {
    mode: 'docker',
    image,
    command: 'docker',
    args: [
      'run',
      '--rm',
      '--pull=never',
      '--network=none',
      '--read-only',
      '--mount',
      `type=bind,src=${configRoot},dst=/config,readonly`,
      '--entrypoint',
      'node',
      image,
      '/app/node_modules/@oss-scp/plugin-config/dist/cli.js',
      '--root',
      '/config',
    ],
  };
}

export function runValidation(options, spawn = spawnSync) {
  const plan = validationCommand(options);
  if (plan.mode === 'docker') {
    const inspect = spawn('docker', ['image', 'inspect', plan.image], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (inspect.error) throw new Error(`Docker 이미지 확인 실패: ${inspect.error.message}`);
    if (inspect.status !== 0) throw new Error(`로컬에 준비된 이미지를 찾을 수 없습니다: ${plan.image}`);
  }
  const result = spawn(plan.command, plan.args, { shell: false, stdio: 'inherit' });
  if (result.error) throw new Error(`검증기 실행 실패: ${result.error.message}`);
  return result.status ?? 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        root: { type: 'string' },
        image: { type: 'string' },
        help: { type: 'boolean' },
      },
    });
    if (values.help) console.log(usage);
    else {
      process.exitCode = runValidation(values);
      if (process.exitCode === 0) {
        console.log('설정·모듈 검증 성공. 실제 원천 호출·수집·저장·조회는 별도로 확인해야 합니다.');
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : '검증에 실패했습니다.');
    process.exitCode = 1;
  }
}
