import { Link } from 'react-router-dom';
import type { CustomPluginListProps } from './custom-plugin-views';
import { recordDetailPath } from './menu';
import { RecordList } from './record-list';
import { listNumberedRecords, type NumberedListRecordsResult, type RecordApiError } from './records';

type State =
  | { kind: 'loading' }
  | { kind: 'success'; result: NumberedListRecordsResult }
  | { kind: 'failure'; error: RecordApiError };

export function Sample2RepositoryListView({ menu, state }: CustomPluginListProps & { state: State }) {
  if (state.kind === 'loading') return <section aria-labelledby="repository-list-title"><h2 id="repository-list-title">{menu.title}</h2><p role="status">저장소 카드를 불러오는 중입니다.</p></section>;
  if (state.kind === 'failure') return <section aria-labelledby="repository-list-title"><h2 id="repository-list-title">{menu.title}</h2><p role="alert">{state.error.message}</p></section>;
  if (state.result.items.length === 0) return <section aria-labelledby="repository-list-title"><h2 id="repository-list-title">{menu.title}</h2><p>표시할 저장소가 없습니다.</p></section>;
  return <section className="repository-view" aria-labelledby="repository-list-title">
    <p className="eyebrow">{menu.group}</p><h2 id="repository-list-title">{menu.title} 카드</h2>{repositoryCards(menu, state.result)}
  </section>;
}

function repositoryCards(menu: CustomPluginListProps['menu'], result: NumberedListRecordsResult) {
  return <ul className="repository-cards">{result.items.map(record => {
      const name = typeof record.sourceValues.fullName === 'string' ? record.sourceValues.fullName : String(record.externalKey);
      const active = record.sourceValues.active === true;
      const feed = typeof record.sourceValues.feed === 'string' ? record.sourceValues.feed : '피드 정보 없음';
      return <li key={record.id}><Link to={recordDetailPath(menu.path, record.id)}><strong>{name}</strong><span>{active ? '활성' : '비활성'}</span><small>{feed}</small></Link></li>;
    })}</ul>;
}

export function Sample2RepositoryList({ menu, request = listNumberedRecords }: CustomPluginListProps & { request?: typeof listNumberedRecords }) {
  return <RecordList menu={menu} request={request} title={`${menu.title} 카드`} loadingMessage="저장소 카드를 불러오는 중입니다." renderItems={result => repositoryCards(menu, result)} />;
}
