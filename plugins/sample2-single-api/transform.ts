import type { Transform } from '@oss-scp/plugin-sdk';

export const transform: Transform = ({ record, context }) => {
  const source = record as Record<string, unknown>;
  const details = source.test_field3 as Record<string, unknown>;
  return { records: [{ type: 'repository', values: {
    assetKey: String(source.asset_key), fullName: String(source.full_name), active: source.test_field1 === true,
    details: { label: String(details.test_field4), observedAt: String(details.test_field5) },
    members: source.test_field2, feed: String(context.responseMetadata?.test_field6 ?? ''),
  } }] };
};
