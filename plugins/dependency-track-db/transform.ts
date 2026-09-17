import type { Transform } from '@oss-scp/plugin-sdk';
export const transform: Transform = ({ record }) => ({ records: [{ type: 'dependency-item', values: { ...(record as Record<string, unknown>) } }] });
