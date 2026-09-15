// id와 name은 예제 원천 필드다. 실제 응답과 안정적인 유일키를 확인한 뒤 수정한다.
export const transform = ({ record }) => {
  if (record === null || typeof record !== 'object' || Array.isArray(record)
    || typeof record.id !== 'string' || record.id.trim() === '' || typeof record.name !== 'string') {
    throw new Error('예제에는 비어 있지 않은 문자열 id와 문자열 name이 필요합니다.');
  }
  return { records: [{ type: 'item', values: { id: record.id, name: record.name } }] };
};
