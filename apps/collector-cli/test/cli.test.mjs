import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CollectionRunnerError } from '@oss-scp/collection-engine';
import {
  collectionScope,
  collectionProcessInvocation,
  connectPlatformStorage,
  connectPostgresStorage,
  configRevision,
  executeManualCollection,
  configRoot,
  idempotentClose,
  MAX_PUBLIC_EVENT_BYTES,
  parsePluginId,
  parsePublicEvent,
  publicEvent,
  selectDefinition,
  verifyScheduledCollectionSnapshot,
} from '../dist/index.js';

const plugin = { id: 'sample-plugin', name: 'Sample', version: '1.0.0', transformPath: '/one/dist/transform.js', data: { types: {} } };
const definition = {
  plugin,
  connection: { id: 'sample-connection', baseUrl: 'https://example.test' },
  request: { method: 'GET', path: '/items', format: 'json' },
  limits: { timeoutMs: 1000, maxResponseBytes: 1000, maxRecordBytes: 100 },
  response: { itemsPath: 'items' },
  pagination: { type: 'single' },
};
const storage = { startRun: vi.fn(), finishRun: vi.fn(), getCheckpoint: vi.fn(), commitBatch: vi.fn() };

describe('CLI 선택과 revision', () => {
  it('plugin ID 하나만 허용한다', () => {
    expect(parsePluginId(['sample-plugin'])).toBe('sample-plugin');
    expect(parsePluginId(['--', 'sample-plugin'])).toBe('sample-plugin');
    for (const args of [[], ['sample-plugin', 'extra'], ['--root=/tmp'], ['Bad']]) {
      expect(() => parsePluginId(args)).toThrowError(expect.objectContaining({ code: 'usage' }));
    }
  });

  it('프로세스 trigger와 scheduled metadata 조합만 엄격히 허용한다', () => {
    expect(collectionProcessInvocation({})).toEqual({ trigger: 'cli' });
    expect(collectionProcessInvocation({ OSS_SCP_COLLECTION_TRIGGER: 'startup' })).toEqual({ trigger: 'startup' });
    expect(collectionProcessInvocation({
      OSS_SCP_COLLECTION_TRIGGER: 'scheduled',
      OSS_SCP_COLLECTION_EXPECTED_REVISION: 'a'.repeat(64),
      OSS_SCP_COLLECTION_SCHEDULED_AT: '2026-09-19T13:00:00.000Z',
      OSS_SCP_COLLECTION_SCHEDULE_TIMEZONE: 'Asia/Seoul',
    })).toEqual({ trigger: 'scheduled', scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul', expectedConfigRevision: 'a'.repeat(64) });
    for (const env of [
      { OSS_SCP_COLLECTION_TRIGGER: 'unknown' },
      { OSS_SCP_COLLECTION_TRIGGER: 'scheduled' },
      { OSS_SCP_COLLECTION_TRIGGER: 'scheduled', OSS_SCP_COLLECTION_EXPECTED_REVISION: 'a'.repeat(64), OSS_SCP_COLLECTION_SCHEDULED_AT: 'bad', OSS_SCP_COLLECTION_SCHEDULE_TIMEZONE: 'Asia/Seoul' },
      { OSS_SCP_COLLECTION_TRIGGER: 'scheduled', OSS_SCP_COLLECTION_EXPECTED_REVISION: 'a'.repeat(64), OSS_SCP_COLLECTION_SCHEDULED_AT: '2026-09-19T13:00:00.000Z', OSS_SCP_COLLECTION_SCHEDULE_TIMEZONE: 'bad/zone' },
      { OSS_SCP_COLLECTION_TRIGGER: 'cli', OSS_SCP_COLLECTION_SCHEDULED_AT: '2026-09-19T13:00:00.000Z' },
    ]) expect(() => collectionProcessInvocation(env)).toThrowError(expect.objectContaining({ code: 'repository_config' }));
  });

  it('명시적 외부 설정 루트만 사용한다', () => {
    expect(configRoot({ OSS_SCP_CONFIG_ROOT: '/config' })).toBe('/config');
    expect(() => configRoot({})).toThrowError(expect.objectContaining({ code: 'repository_config' }));
  });

  it('전체 검증 성공 결과에서 정확히 하나만 선택한다', () => {
    expect(selectDefinition({ ok: true, definitions: [definition] }, 'sample-plugin')).toBe(definition);
    expect(() => selectDefinition({ ok: true, definitions: [] }, 'missing')).toThrowError(expect.objectContaining({ code: 'plugin_not_found' }));
    expect(() => selectDefinition({ ok: false, errors: [{ file: 'secret-value', path: '/', message: 'bad' }] }, 'sample-plugin')).toThrowError(expect.objectContaining({ code: 'repository_config' }));
  });

  it('절대 transform 경로를 제외하고 설정 변경을 revision에 반영한다', () => {
    const moved = { ...definition, plugin: { ...plugin, transformPath: '/other/dist/transform.js' } };
    expect(configRevision(moved)).toBe(configRevision(definition));
    expect(configRevision({ ...definition, request: { ...definition.request, path: '/changed' } })).not.toBe(configRevision(definition));
    expect(collectionScope('/repo', definition)).toMatchObject({ pluginId: 'sample-plugin', sourceId: 'sample-connection', scopeType: 'full', scopeKey: '' });
  });

  it('snapshot digest와 revision을 module top-level 실행 전에 검증하고 정확한 바이트만 실행한다', () => {
    const source = 'const snapshotKind = "scheduled"; exports.transform = ({ record }) => ({ ...record, snapshotKind });\n';
    const digest = createHash('sha256').update(source).digest('hex');
    const snapshotted = { ...definition, plugin: { ...plugin, transformDigest: digest } };
    const snapshot = { definition: snapshotted, transform: { digest, sourceBase64: Buffer.from(source).toString('base64') } };
    const verified = verifyScheduledCollectionSnapshot(snapshot, 'sample-plugin', configRevision(snapshotted));
    expect(verified.transform({ record: { exact: true } })).toEqual({ exact: true, snapshotKind: 'scheduled' });

    const changed = { ...snapshot, transform: { ...snapshot.transform, digest: '0'.repeat(64) } };
    expect(() => verifyScheduledCollectionSnapshot(changed, 'sample-plugin', configRevision(snapshotted))).toThrowError(expect.objectContaining({ code: 'repository_config' }));

    expect(() => verifyScheduledCollectionSnapshot(snapshot, 'sample-plugin', '0'.repeat(64))).toThrowError(expect.objectContaining({ code: 'repository_config' }));
    expect(() => verifyScheduledCollectionSnapshot({ ...snapshot, unexpected: true }, 'sample-plugin', configRevision(snapshotted))).toThrowError(expect.objectContaining({ code: 'repository_config' }));
  });

  it('scheduled snapshot의 local require를 main/helper top-level 실행 전에 거부한다', () => {
    const source = 'const executed = Number({ valueOf: () => ({ value: true }).missing() }); exports.transform = require("./helper.js").transform;\n';
    const digest = createHash('sha256').update(source).digest('hex');
    const snapshotted = { ...definition, plugin: { ...plugin, transformDigest: digest } };
    expect(() => verifyScheduledCollectionSnapshot(
      { definition: snapshotted, transform: { digest, sourceBase64: Buffer.from(source).toString('base64') } },
      'sample-plugin', configRevision(snapshotted),
    )).toThrow();
  });

  it('collector public event를 크기와 exact schema로 제한한다', () => {
    const event = {
      version: 1, timestamp: '2026-09-19T13:00:01.000Z', event: 'collection_finished', pluginId: 'sample-plugin', status: 'duplicate',
      activeRunId: '123e4567-e89b-42d3-a456-426614174001', scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul',
    };
    expect(parsePublicEvent(JSON.stringify(event), 'sample-plugin')).toEqual(event);
    for (const invalid of [
      `${JSON.stringify(event)}\nuntrusted`,
      JSON.stringify({ ...event, extra: true }),
      JSON.stringify({ ...event, scheduleTimezone: 'invalid' }),
      'x'.repeat(MAX_PUBLIC_EVENT_BYTES + 1),
    ]) expect(() => parsePublicEvent(invalid, 'sample-plugin')).toThrow();
  });
});

describe('실행 조립과 결과', () => {
  const result = { runId: 'run-1', status: 'success', batches: 1, processed: 2, accepted: 2, rejected: 0, checkpoint: { complete: true } };

  function dependencies(overrides = {}) {
    return {
      validate: vi.fn(() => ({ ok: true, definitions: [definition] })),
      connectStorage: vi.fn(async () => ({ storage, resource: { close: vi.fn(async () => undefined) } })),
      run: vi.fn(async () => result),
      now: () => '2026-09-11T00:00:00.000Z',
      ...overrides,
    };
  }

  it('runner를 한 번 호출하고 성공·부분 성공을 구분한 뒤 연결을 닫는다', async () => {
    const close = vi.fn(async () => undefined);
    const deps = dependencies({ connectStorage: vi.fn(async () => ({ storage, resource: { close } })) });
    const outcome = await executeManualCollection({ args: ['sample-plugin'], root: '/repo', env: {}, signal: new AbortController().signal, dependencies: deps });
    expect(outcome).toMatchObject({ exitCode: 0, status: 'success', pluginId: 'sample-plugin' });
    expect(deps.run).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);

    const partial = dependencies({ run: vi.fn(async () => ({ ...result, status: 'partial', rejected: 1 })) });
    expect(await executeManualCollection({ args: ['sample-plugin'], root: '/repo', env: {}, signal: new AbortController().signal, dependencies: partial })).toMatchObject({ exitCode: 2, status: 'partial' });
  });

  it('호출 경로의 trigger와 API 요청 식별자를 runner에 전달한다', async () => {
    const deps = dependencies();
    await executeManualCollection({ args: ['sample-plugin'], root: '/repo', env: {}, signal: new AbortController().signal, dependencies: deps, trigger: 'api', requestId: 'request-1' });
    expect(deps.run).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'api', requestId: 'request-1' }));
  });

  it('scheduled trigger의 예정 instant와 timezone을 runner에 전달한다', async () => {
    const deps = dependencies();
    await executeManualCollection({
      args: ['sample-plugin'], root: '/repo', env: {}, signal: new AbortController().signal,
      dependencies: deps, trigger: 'scheduled', scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul',
    });
    expect(deps.run).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'scheduled', scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul',
    }));
  });

  it('scheduled snapshot revision이 바뀌면 DB와 runner 전에 거부한다', async () => {
    const deps = dependencies();
    const outcome = await executeManualCollection({
      args: ['sample-plugin'], root: '/repo', env: {}, signal: new AbortController().signal,
      dependencies: deps, trigger: 'scheduled', expectedConfigRevision: '0'.repeat(64),
      scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul',
    });
    expect(outcome).toMatchObject({ exitCode: 1, errorCode: 'repository_config' });
    expect(deps.connectStorage).not.toHaveBeenCalled(); expect(deps.run).not.toHaveBeenCalled();
  });

  it('scheduled lease loser를 실패 대신 active run 상관관계가 있는 duplicate로 반환한다', async () => {
    const source = 'exports.transform = ({ record }) => record;\n';
    const digest = createHash('sha256').update(source).digest('hex');
    const snapshotted = { ...definition, plugin: { ...plugin, transformDigest: digest } };
    const scheduledSnapshot = verifyScheduledCollectionSnapshot(
      { definition: snapshotted, transform: { digest, sourceBase64: Buffer.from(source).toString('base64') } },
      'sample-plugin', configRevision(snapshotted),
    );
    const deps = dependencies({
      validate: vi.fn(() => { throw new Error('current config must not be read'); }),
      run: vi.fn(async () => { throw new CollectionRunnerError('already_running', 'active-run-1'); }),
    });
    const outcome = await executeManualCollection({
      args: ['sample-plugin'], root: '/repo', env: {}, signal: new AbortController().signal,
      dependencies: deps, trigger: 'scheduled', expectedConfigRevision: configRevision(snapshotted),
      scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul', scheduledSnapshot,
    });
    expect(deps.validate).not.toHaveBeenCalled();
    expect(outcome).toEqual({ exitCode: 0, status: 'duplicate', pluginId: 'sample-plugin', activeRunId: 'active-run-1', scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul' });
    expect(publicEvent(outcome, '2026-09-19T13:00:01.000Z')).toMatchObject({ status: 'duplicate', activeRunId: 'active-run-1', scheduledAt: '2026-09-19T13:00:00.000Z', scheduleTimezone: 'Asia/Seoul' });
  });

  it('설정 실패 전에 DB와 runner를 호출하지 않는다', async () => {
    const deps = dependencies({ validate: vi.fn(() => ({ ok: false, errors: [] })) });
    const outcome = await executeManualCollection({ args: ['sample-plugin'], root: '/repo', env: {}, signal: new AbortController().signal, dependencies: deps });
    expect(outcome).toMatchObject({ exitCode: 1, errorCode: 'repository_config' });
    expect(deps.connectStorage).not.toHaveBeenCalled();
    expect(deps.run).not.toHaveBeenCalled();
  });

  it('무저장 라이브 source는 플랫폼 DB 연결과 실행 이력 생성 전에 거부한다', async () => {
    const live = { mode: 'live', persistence: 'none', plugin, connection: { id: 'live-db' }, source: { type: 'db-postgres' } };
    const deps = dependencies({ validate: vi.fn(() => ({ ok: true, definitions: [live] })) });
    const outcome = await executeManualCollection({ args: ['sample-plugin'], root: '/repo', env: {}, signal: new AbortController().signal, dependencies: deps });
    expect(outcome).toMatchObject({ exitCode: 1, errorCode: 'unsupported_collector' });
    expect(deps.connectStorage).not.toHaveBeenCalled(); expect(deps.run).not.toHaveBeenCalled();
  });

  it('하위 오류 문자열을 폐기하고 공개 필드만 직렬화한다', async () => {
    const secret = 'postgres://admin:secret-token@example.test/db';
    const deps = dependencies({ run: vi.fn(async () => { throw new Error(`${secret} Authorization password stack`); }) });
    const outcome = await executeManualCollection({ args: ['sample-plugin'], root: '/repo', env: {}, signal: new AbortController().signal, dependencies: deps });
    const output = JSON.stringify(publicEvent(outcome, '2026-09-11T00:00:00.000Z'));
    expect(outcome).toMatchObject({ exitCode: 3, errorCode: 'collection_failed' });
    for (const value of [secret, 'Authorization', 'password', 'stack']) expect(output).not.toContain(value);
  });

  it('취소를 130으로 매핑하고 close를 반복해도 실제 정리는 한 번만 한다', async () => {
    const controller = new AbortController();
    controller.abort();
    const deps = dependencies({ run: vi.fn(async () => { throw new Error('cancel'); }) });
    expect(await executeManualCollection({ args: ['sample-plugin'], root: '/repo', env: {}, signal: controller.signal, dependencies: deps })).toMatchObject({ exitCode: 130, status: 'cancelled', errorCode: 'cancelled' });
    const close = vi.fn(async () => undefined);
    const resource = idempotentClose({ close });
    await Promise.all([resource.close(), resource.close()]);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('플랫폼 DB 저장 provider', () => {
  it('PostgreSQL과 MySQL의 잘못된 설정을 같은 공통 오류로 구분한다', async () => {
    await expect(connectPlatformStorage({ PLATFORM_DB_TYPE: 'mysql' })).rejects.toMatchObject({ code: 'platform_db_config', phase: 'config' });
    await expect(connectPostgresStorage({ PLATFORM_DB_TYPE: 'postgres' })).rejects.toMatchObject({ code: 'platform_db_config', phase: 'config' });
  });

  it('드라이버 연결 오류 원문을 안정적인 실행 오류로 바꾼다', async () => {
    await expect(connectPostgresStorage({
      PLATFORM_DB_TYPE: 'postgres', PLATFORM_DB_HOST: '127.0.0.1', PLATFORM_DB_PORT: '1',
      PLATFORM_DB_NAME: 'db', PLATFORM_DB_USER: 'user', PLATFORM_DB_PASSWORD: 'sensitive-password',
      PLATFORM_DB_TLS_MODE: 'disable', PLATFORM_DB_CONNECT_TIMEOUT_MS: '100',
    })).rejects.toMatchObject({ code: 'platform_db_connection', phase: 'runtime' });
  });
});
