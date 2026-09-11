import type { Transform } from '@oss-scp/plugin-sdk';

export const transform: Transform = ({ record }) => {
  const source = record as Record<string, unknown>;
  return { records: [{ type: 'asset', values: {
    hostname: String(source.hostname),
    environment: String(source.env),
    ip: String(source.ip),
    integerValue: Number(source['test-field1']),
    decimalValue: Number(source['test-field2']),
    enabled: source['test-field5'] === true,
  } }] };
};
