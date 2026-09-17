import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadPluginDetail, PluginDetailNotFoundError, type FieldDefinition, type PluginDetail } from './plugin-details';

const sourceNames = { 'http-json': '외부 API (JSON)', 'local-csv': '로컬 CSV', 'http-csv': '외부 HTTP (CSV)', 'db-postgres': 'PostgreSQL 실시간 조회' };
const codeKinds = { 'typescript-source': 'TypeScript 원본', 'javascript-runtime': '배포 JavaScript' };
const value = (item: unknown) => typeof item === 'string' ? item : JSON.stringify(item);

function Rows({ entries }: { entries: Array<[string, unknown]> }) {
  return <dl className="config-rows">{entries.filter(([, item]) => item !== undefined).map(([label, item]) => <div key={label}><dt>{label}</dt><dd>{value(item)}</dd></div>)}</dl>;
}

function FieldTree({ fields }: { fields: Record<string, FieldDefinition> }) {
  return <ul className="field-tree">{Object.entries(fields).map(([key, field]) => <li key={key}><span><code>{key}</code> · {field.label} · {field.type}{field.required ? ' · 필수' : ''}</span>
    {field.type === 'object' ? <FieldTree fields={field.fields} /> : field.type === 'array' ? <FieldTree fields={{ items: field.items }} /> : null}</li>)}</ul>;
}

function Source({ source }: { source: PluginDetail['source'] }) {
  if (source.type === 'local-csv') return <Rows entries={Object.entries({ 종류: sourceNames[source.type], 파일명: source.fileName, '묶음 크기': source.batching, 한도: source.limits })} />;
  if (source.type === 'db-postgres') return <Rows entries={Object.entries({ 종류: sourceNames[source.type], 방식: `${source.mode} · ${source.persistence}`, 연결: source.connection, '목록 쿼리': source.queries, '외부 키': source.externalKeyColumn, '조회 필드': source.queryFields, '묶음 크기': source.batching, 캐시: source.cache, 한도: source.limits })} />;
  return <Rows entries={Object.entries({ 종류: sourceNames[source.type], 연결: source.connection, 요청: source.request, 응답: source.response, 페이지: source.pagination, '묶음 크기': source.batching, 한도: source.limits })} />;
}

export function PluginConfigDetailContent({ detail }: { detail: PluginDetail }) {
  return <section className="plugin-config-detail" aria-labelledby="plugin-config-title">
    <Link className="back-link" to="/">← 플러그인 목록</Link>
    <div className="config-title"><div><p className="eyebrow">플러그인 설정</p><h2 id="plugin-config-title">{detail.name}</h2></div><span className={`plugin-badge ${detail.enabled ? 'enabled' : 'disabled'}`}>{detail.enabled ? '활성화' : '비활성화'}</span></div>
    {detail.description ? <p>{detail.description}</p> : null}
    <section className="config-section"><h3>기본 정보</h3><Rows entries={Object.entries({ 이름: detail.name, ID: detail.id, 버전: detail.version })} /></section>
    <section className="config-section"><h3>수집 설정</h3><Source source={detail.source} /></section>
    <section className="config-section"><h3>데이터 구조</h3>{Object.entries(detail.data.types).map(([name, type]) => <article className="data-type" key={name}><h4>{name}</h4><p>유일키: <code>{type.uniqueKey}</code></p><FieldTree fields={type.fields} /></article>)}
      {detail.data.relations && Object.keys(detail.data.relations).length ? <div className="relations"><h4>관계</h4><Rows entries={Object.entries(detail.data.relations).map(([name, relation]) => [name, `${relation.from.types.join(', ')} → ${relation.to.types.join(', ')}`])} /></div> : null}</section>
    <section className="config-section"><h3>가공 코드</h3>{detail.transform.status === 'available' ? <><p className="code-kind">{codeKinds[detail.transform.kind]}</p><pre><code>{detail.transform.code}</code></pre></> : <p role="status" className="list-message error">{detail.transform.reason}</p>}</section>
    <section className="config-section"><h3>화면 구성</h3>{detail.menu ? <><Rows entries={Object.entries({ 제목: detail.menu.title, 경로: detail.menu.path, '데이터 타입': detail.menu.dataType })} /><h4>목록 컬럼</h4><ul className="compact-list">{detail.menu.list.columns.map(column => <li key={column.key}><code>{column.key}</code> · {column.label} · {column.type}</li>)}</ul><Rows entries={Object.entries({ 검색과필터: detail.menu.list.query, 정렬: detail.menu.list.sorts })} /><h4>상세 섹션</h4>{detail.menu.detail.sections.map(section => <div key={section.title}><strong>{section.title}</strong><p>{section.fields.map(field => field.label).join(', ')}</p></div>)}</> : <p className="empty-value">등록된 메뉴가 없습니다.</p>}</section>
  </section>;
}

export function PluginConfigDetail() {
  const { pluginId = '' } = useParams();
  const [state, setState] = useState<'loading' | 'success' | 'not-found' | 'failure'>('loading');
  const [detail, setDetail] = useState<PluginDetail>();
  useEffect(() => {
    const controller = new AbortController();
    setDetail(undefined); setState('loading');
    void loadPluginDetail(pluginId, { signal: controller.signal }).then(item => { if (!controller.signal.aborted) { setDetail(item); setState('success'); } }).catch(error => {
      if (!controller.signal.aborted) setState(error instanceof PluginDetailNotFoundError ? 'not-found' : 'failure');
    });
    return () => controller.abort();
  }, [pluginId]);
  if (state === 'loading') return <section><p role="status">플러그인 설정을 불러오는 중입니다.</p></section>;
  if (state === 'not-found') return <section><h2>플러그인을 찾을 수 없습니다</h2><p>등록된 플러그인 목록에서 다시 선택해 주세요.</p><Link to="/">플러그인 목록</Link></section>;
  if (state === 'failure' || !detail) return <section><h2>플러그인 설정 조회 실패</h2><p role="alert">플러그인 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p><Link to="/">플러그인 목록</Link></section>;
  return <PluginConfigDetailContent detail={detail} />;
}
