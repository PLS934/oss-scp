import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CustomPluginListProps } from './custom-plugin-views';
import { recordDetailPath } from './menu';
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
    <p className="eyebrow">{menu.group}</p><h2 id="repository-list-title">{menu.title} 카드</h2>
    <ul className="repository-cards">{state.result.items.map(record => {
      const name = typeof record.sourceValues.fullName === 'string' ? record.sourceValues.fullName : String(record.externalKey);
      const active = record.sourceValues.active === true;
      const feed = typeof record.sourceValues.feed === 'string' ? record.sourceValues.feed : '피드 정보 없음';
      return <li key={record.id}><Link to={recordDetailPath(menu.path, record.id)}><strong>{name}</strong><span>{active ? '활성' : '비활성'}</span><small>{feed}</small></Link></li>;
    })}</ul>
  </section>;
}

export function Sample2RepositoryList({ menu, request = listNumberedRecords }: CustomPluginListProps & { request?: typeof listNumberedRecords }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void request({ pluginId: menu.pluginId, sourceId: menu.sourceId, dataType: menu.dataType, page: 1, limit: 20 }, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setState(result.ok ? { kind: 'success', result: result.data } : { kind: 'failure', error: result.error });
    });
    return () => controller.abort();
  }, [menu.dataType, menu.pluginId, menu.sourceId, request]);
  return <Sample2RepositoryListView menu={menu} state={state} />;
}
