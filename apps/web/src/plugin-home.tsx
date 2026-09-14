import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MenuItem } from './menu';
import { loadPlugins, type PluginSummary } from './plugins';

type LoadState = 'loading' | 'success' | 'failure';
const sourceLabels: Record<PluginSummary['sourceType'], string> = {
  'http-json': '외부 API (JSON)',
  'http-csv': '외부 HTTP (CSV)',
  'local-csv': '로컬 CSV',
};

export function PluginHomeContent({ plugins, state, menus, menuState }: {
  plugins: readonly PluginSummary[];
  state: LoadState;
  menus: readonly MenuItem[];
  menuState: LoadState;
}) {
  return <section aria-labelledby="plugin-home-title">
    <h2 id="plugin-home-title">플러그인 목록</h2>
    <p className="plugin-intro">등록된 플러그인과 제공 데이터를 확인하세요. 활성화 여부는 설정 기준이며, 연결·수집 성공을 의미하지 않습니다.</p>
    {state === 'loading' ? <p role="status">플러그인 목록을 불러오는 중입니다.</p>
      : state === 'failure' ? <p role="alert">플러그인 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      : plugins.length === 0 ? <p className="empty-state">등록된 플러그인이 없습니다.</p>
      : <ul className="plugin-cards">{plugins.map(plugin => {
        const targets = plugin.enabled && menuState === 'success' ? menus.filter(menu => menu.pluginId === plugin.id) : [];
        return <li className="plugin-card" key={plugin.id}>
          <div className="plugin-heading"><h3>{plugin.name}</h3><span className={`plugin-badge ${plugin.enabled ? 'enabled' : 'disabled'}`}>{plugin.enabled ? '활성화' : '비활성화'}</span></div>
          <p className="plugin-description">{plugin.description?.trim() || '등록된 설명이 없습니다.'}</p>
          <dl className="plugin-source"><dt>데이터 출처</dt><dd>{sourceLabels[plugin.sourceType]}</dd></dl>
          {!plugin.enabled ? <p className="plugin-unavailable">비활성 플러그인입니다.</p>
            : menuState === 'loading' ? <p role="status">조회 메뉴를 확인하는 중입니다.</p>
            : menuState === 'failure' ? <p role="alert">조회 메뉴를 불러오지 못했습니다.</p>
            : targets.length === 0 ? <p className="plugin-unavailable">조회 가능한 메뉴가 없습니다.</p>
            : <ul className="plugin-links">{targets.map(menu => <li key={menu.path}><Link to={menu.path} aria-label={`${plugin.name} · ${menu.title} 데이터 보기`}>{menu.title} · 데이터 보기 <span aria-hidden="true">→</span></Link></li>)}</ul>}
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
