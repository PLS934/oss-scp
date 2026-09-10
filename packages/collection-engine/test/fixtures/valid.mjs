let calls = 0;
export const transform = ({ record }) => { calls += 1; return { records: [{ type: 'item', values: record }] }; };
export const getCalls = () => calls;
