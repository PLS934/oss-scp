/* global exports */
exports.transform = ({ record }) => ({ records: [
  { type: 'dependency-item', values: record },
  { type: 'dependency-item', values: record },
] });
