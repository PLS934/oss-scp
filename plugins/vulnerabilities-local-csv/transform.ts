import type { Transform } from '@oss-scp/plugin-sdk';

export const transform: Transform = ({ record }) => {
  const source = record as Record<string, string>;
  return { records: [{ type: 'vulnerability', values: {
    cve: source.cve, name: source.vul, score: Number(source['test-data2']),
    affected: source['test-data1'] !== 'GOOD', observedAt: new Date(Number(source['test-data3']) * 1000).toISOString(),
  } }] };
};
