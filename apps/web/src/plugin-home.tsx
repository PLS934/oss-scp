import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MenuItem } from './menu';
import { loadPlugins, type PluginSummary } from './plugins';

const nameCollator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

type LoadState = 'loading' | 'success' | 'failure';
const sourceLabels: Record<PluginSummary['sourceType'], string> = {
  'http-json': '외부 API (JSON)',
  'http-csv': '외부 HTTP (CSV)',
  'local-csv': '로컬 CSV',
};

function ArrowIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

function DownloadIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" /></svg>;
}

export function PluginHomeContent({ plugins, state, menus, menuState }: {
  plugins: readonly PluginSummary[];
  state: LoadState;
  menus: readonly MenuItem[];
  menuState: LoadState;
}) {
  const [sort, setSort] = useState('default');
  const displayedPlugins = sort === 'name' ? [...plugins].sort((a, b) => nameCollator.compare(a.name, b.name)) : plugins;
  return <section className="plugin-home" aria-labelledby="plugin-home-title">
    <div className="plugin-home-heading"><h2 id="plugin-home-title">플러그인 목록</h2>
      <select aria-label="플러그인 정렬" value={sort} onChange={event => setSort(event.target.value)} disabled={state !== 'success' || plugins.length === 0}>
        <option value="default">기본 순</option><option value="name">이름 순</option>
      </select>
    </div>
    <p className="plugin-intro">등록된 플러그인과 제공 데이터를 확인하세요. 활성화 여부는 설정 기준이며, 연결·수집 성공을 의미하지 않습니다.</p>
    {state === 'loading' ? <p role="status">플러그인 목록을 불러오는 중입니다.</p>
      : state === 'failure' ? <p role="alert">플러그인 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      : plugins.length === 0 ? <p className="empty-state">등록된 플러그인이 없습니다.</p>
      : <ul className="plugin-cards">{displayedPlugins.map(plugin => {
        const targets = plugin.enabled && menuState === 'success' ? menus.filter(menu => menu.pluginId === plugin.id) : [];
        return <li className="plugin-card" key={plugin.id}>
          <div className="plugin-heading"><div className="plugin-title"><h3>{plugin.name}</h3>
            {targets.map(menu => <Link key={menu.path} className="plugin-icon-link" to={menu.path} aria-label={`${plugin.name} · ${menu.title} 데이터 보기`} title={`${menu.title} 데이터 보기`}><ArrowIcon /></Link>)}
          </div><span className={`plugin-badge ${plugin.enabled ? 'enabled' : 'disabled'}`}>{plugin.enabled ? '활성화' : '비활성화'}</span></div>
          {targets.length > 0 ? <ul className="plugin-menu-paths" aria-label="메뉴 위치">{targets.map(menu => <li key={menu.path}>{menu.group} &gt; {menu.title}</li>)}</ul> : null}
          {plugin.description?.trim() ? <p className="plugin-description">{plugin.description}</p> : null}
          <dl className="plugin-source">
            <div><dt>데이터 출처</dt><dd>{sourceLabels[plugin.sourceType]}</dd></div>
            {plugin.endpoint ? <div><dt>API 주소</dt><dd><span className="plugin-method">{plugin.endpoint.method}</span> <code>{plugin.endpoint.url}</code></dd></div> : null}
            {plugin.sourceType === 'local-csv' && plugin.fileName ? <div><dt>파일명</dt><dd className="plugin-file"><span>{plugin.fileName}</span>
              {plugin.enabled && plugin.sourceType === 'local-csv' ? <a className="plugin-icon-link" href={`/api/v1/plugins/${encodeURIComponent(plugin.id)}/source-file`} download={plugin.fileName} aria-label="원본 내려받기" title="원본 내려받기"><DownloadIcon /></a> : null}
            </dd></div> : null}
          </dl>
          {!plugin.enabled ? <p className="plugin-unavailable">비활성 플러그인입니다.</p>
            : menuState === 'loading' ? <p role="status">조회 메뉴를 확인하는 중입니다.</p>
            : menuState === 'failure' ? <p role="alert">조회 메뉴를 불러오지 못했습니다.</p>
            : targets.length === 0 ? <p className="plugin-unavailable">조회 가능한 메뉴가 없습니다.</p>
            : null}
        </li>;
      })}</ul>}
  </section>;
}

export function PluginHome({ menus, menuState }: { menus: readonly MenuItem[]; menuState: LoadState }) {
  const [state, setState] = useState<LoadState>('loading');
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void loadPlugins({ signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setPlugins(value);
      setState('success');
    }).catch(() => {
      if (!controller.signal.aborted) setState('failure');
    });
    return () => controller.abort();
  }, []);
  return <PluginHomeContent plugins={plugins} state={state} menus={menus} menuState={menuState} />;
}
