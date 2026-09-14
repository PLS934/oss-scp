import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, test } from 'vitest';
import { resolveCustomPluginViews, type CustomPluginListProps } from '../src/custom-plugin-views';
import { CustomViewBoundary, CustomViewFailure } from '../src/custom-view-boundary';
import type { MenuItem } from '../src/menu';
import { Sample2RepositoryDetailView } from '../src/sample2-repository-detail';
import { Sample2RepositoryListView } from '../src/sample2-repository-list';
import type { NumberedListRecordsResult, QueryRecord } from '../src/records';

const menu: MenuItem = {
  title: '저장소', icon: 'repository', group: '자산 관리', order: 20, path: '/assets/repositories',
  dataType: 'repository', pluginId: 'sample2-single-api', sourceId: 'mock-api-sample2',
  list: { columns: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' }] },
  detail: { sections: [{ title: '기본', fields: [{ key: 'fullName', label: '저장소 전체 이름', type: 'string' }] }] },
};

test('registry는 목록·상세의 독립 등록과 미등록 조회를 지원한다', () => {
  const List = ({ menu: item }: CustomPluginListProps) => <p>{item.title}</p>;
  expect(resolveCustomPluginViews({ plugin: { List } }, 'plugin')).toEqual({ List });
  expect(resolveCustomPluginViews({ plugin: { List } }, 'missing')).toEqual({});
});

test('사용자 정의 화면 오류 상태는 원문 없이 안전한 안내를 표시한다', () => {
  expect(CustomViewBoundary.getDerivedStateFromError()).toEqual({ failed: true });
  const html = renderToStaticMarkup(<CustomViewFailure />);
  expect(html).toContain('사용자 정의 화면을 표시하지 못했습니다.');
  expect(html).toContain('다른 메뉴로 이동');
});

test('샘플 사용자 정의 목록은 공개 조회 결과를 카드와 공통 상세 링크로 표시한다', () => {
  const result: NumberedListRecordsResult = {
    items: [{
      id: '00000000-0000-4000-8000-000000000001', pluginId: menu.pluginId, sourceId: menu.sourceId, dataType: menu.dataType,
      externalKey: 'repo-1', sourceValues: { fullName: 'team/repository', active: true, feed: 'sample2' },
      firstSeenAt: '2026-09-14T00:00:00.000Z', lastSeenAt: '2026-09-14T00:00:00.000Z', omittedFields: [],
    }],
    pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false },
    collection: { scope: 'source', status: 'success', runId: 'run-1', startedAt: '2026-09-14T00:00:00.000Z', finishedAt: '2026-09-14T00:01:00.000Z' },
    lastStoredAt: '2026-09-14T00:00:00.000Z',
  };
  const html = renderToStaticMarkup(<MemoryRouter><Sample2RepositoryListView menu={menu} state={{ kind: 'success', result }} /></MemoryRouter>);
  expect(html).toContain('저장소 카드');
  expect(html).toContain('team/repository');
  expect(html).toContain('활성');
  expect(html).toContain('href="/assets/repositories/00000000-0000-4000-8000-000000000001"');
});

test('샘플 사용자 정의 상세는 저장소 요약과 구성원을 표시한다', () => {
  const record: QueryRecord = {
    id: '00000000-0000-4000-8000-000000000001', pluginId: menu.pluginId, sourceId: menu.sourceId, dataType: menu.dataType,
    externalKey: 'repo-1', sourceValues: {
      assetKey: 'team:repository', fullName: 'team/repository', active: true, feed: 'sample2',
      details: { label: 'sample-repository', observedAt: '2026-09-14T00:00:00.000Z' },
      members: [{ login: 'sally' }, { login: 'codex' }],
    },
    firstSeenAt: '2026-09-14T00:00:00.000Z', lastSeenAt: '2026-09-14T00:00:00.000Z',
  };
  const html = renderToStaticMarkup(<MemoryRouter><Sample2RepositoryDetailView menu={menu} recordId={record.id} state={{ kind: 'success', record }} /></MemoryRouter>);
  expect(html).toContain('team/repository');
  expect(html).toContain('team:repository');
  expect(html).toContain('sample-repository');
  expect(html).toContain('sally');
  expect(html).toContain('codex');
  expect(html).not.toContain('<script');
});
