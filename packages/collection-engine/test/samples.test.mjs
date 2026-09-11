import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readCsvFile } from '@oss-scp/csv-reader';
import { validateRepository } from '@oss-scp/plugin-config';
import { describe, expect, test } from 'vitest';
import { processRecords } from '../dist/index.js';

const root = resolve(import.meta.dirname, '../../..');
const source = (name) => JSON.parse(readFileSync(resolve(root, 'fixtures/sources', name), 'utf8'));

async function collect(definition, records, responseMetadata) {
  const batches = [];
  const result = await processRecords({
    plugin: definition.plugin,
    sourceId: definition.connection?.id ?? definition.source.path,
    collectedAt: '2026-09-10T00:00:00Z', records, responseMetadata,
    consume: async (batch) => batches.push(batch),
  });
  return { result, records: batches.flatMap((batch) => batch.records) };
}

describe('sample transform integration', () => {
  test('sample1 72건을 공통 가공 엔진으로 변환한다', async () => {
    const configuration = validateRepository(root);
    expect(configuration.ok).toBe(true);
    if (!configuration.ok) return;
    const input = source('sample1.json');
    const output = await collect(configuration.definitions[0], input.rows);
    expect(output.result).toMatchObject({ status: 'success', accepted: 72, rejected: 0 });
    expect(output.records).toHaveLength(72);
    expect(output.records[0]).toMatchObject({ type: 'asset', values: { hostname: 'test-host', integerValue: 1234, decimalValue: 12.3, enabled: false } });
  });

  test('sample2 153건의 중첩 값과 최상위 metadata를 보존한다', async () => {
    const configuration = validateRepository(root);
    expect(configuration.ok).toBe(true);
    if (!configuration.ok) return;
    const input = source('sample2.json');
    const definition = configuration.definitions.find((item) => item.plugin.id === 'sample2-single-api');
    const output = await collect(definition, input.items, { test_field6: input.test_field6 });
    expect(output.result).toMatchObject({ status: 'success', accepted: 153, rejected: 0 });
    expect(output.records[0]).toMatchObject({ values: { details: { label: 'a', observedAt: '2026-09-01T09:24:00Z' }, members: [{ login: 'minyung' }, { login: 'minyoung' }], feed: 'true' } });
  });

  test('CSV 53행의 문자열을 숫자·불리언·datetime으로 명시 변환한다', async () => {
    const configuration = validateRepository(root);
    expect(configuration.ok).toBe(true);
    if (!configuration.ok) return;
    const output = await collect(configuration.definitions[1], readCsvFile(resolve(root, 'fixtures/csv/vulnerabilities.csv')));
    expect(output.result).toMatchObject({ status: 'success', accepted: 53, rejected: 0 });
    expect(output.records[0]).toMatchObject({ values: { cve: 'cve-1', score: 10, affected: false, observedAt: '1970-01-01T00:01:40.000Z' } });
    expect(typeof output.records[0].values.score).toBe('number');
    expect(typeof output.records[0].values.affected).toBe('boolean');
  });

  test('혼합 오류 입력은 정상 결과를 보존하고 partial을 반환한다', async () => {
    const configuration = validateRepository(root);
    expect(configuration.ok).toBe(true);
    if (!configuration.ok) return;
    const transform = async ({ record }) => record.bad ? Promise.reject(new Error('private')) : ({ records: [{ type: 'asset', values: record }] });
    const batches = [];
    const result = await processRecords({ plugin: configuration.definitions[0].plugin, sourceId: 'fixture', collectedAt: '2026-09-10T00:00:00Z', records: [{ bad: true }, { hostname: 'ok', environment: 'test', ip: '127.0.0.1', integerValue: 1, decimalValue: 1.5, enabled: true }], transform, consume: async (batch) => batches.push(batch) });
    expect(result).toMatchObject({ status: 'partial', accepted: 1, rejected: 1 });
    expect(batches.flatMap((batch) => batch.records).map((record) => record.values.hostname)).toEqual(['ok']);
  });
});
