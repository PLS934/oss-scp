import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { customPluginViews, resolveCustomPluginViews, type CustomPluginViewRegistry } from './custom-plugin-views';
import { CustomViewBoundary } from './custom-view-boundary';
import { RecordDetail } from './detail';
import { observeHealth, type ConnectionState } from './health';
import { groupMenus, type MenuItem } from './menu';
import { loadPluginMenus } from './plugin-menus';
import { PluginHome } from './plugin-home';
import { RecordList } from './record-list';
import { ThemePicker } from './theme-picker';

const labels: Record<ConnectionState, string> = { loading: '서버 연결 확인 중', success: '서버 연결 성공', failure: '서버 연결 실패' };
const productVersion = import.meta.env.VITE_OSS_SCP_VERSION || 'dev';
function NotFound() { return <section><h2>페이지를 찾을 수 없습니다</h2><p>등록된 메뉴에서 이동해 주세요.</p></section>; }
function ListRoute({ menu, registry }: { menu: MenuItem; registry: CustomPluginViewRegistry }) {
  const CustomList = resolveCustomPluginViews(registry, menu.pluginId).List;
  return CustomList
    ? <CustomViewBoundary><CustomList menu={menu} /></CustomViewBoundary>
    : <RecordList key={`${menu.pluginId}:${menu.sourceId}:${menu.dataType}`} menu={menu} />;
}

function DetailRoute({ menu, registry }: { menu: MenuItem; registry: CustomPluginViewRegistry }) {
  const { recordId = '' } = useParams();
  const CustomDetail = resolveCustomPluginViews(registry, menu.pluginId).Detail;
  return CustomDetail
    ? <CustomViewBoundary key={`${menu.pluginId}:detail:${recordId}`}><CustomDetail menu={menu} recordId={recordId} /></CustomViewBoundary>
    : <RecordDetail menu={menu} recordId={recordId} />;
}

export default function App({ menus: providedMenus, customViews = customPluginViews }: { menus?: readonly MenuItem[]; customViews?: CustomPluginViewRegistry }) {
  const [state, setState] = useState<ConnectionState>('loading');
  const [menuState, setMenuState] = useState<'loading' | 'success' | 'failure'>(providedMenus ? 'success' : 'loading');
  const [loadedMenus, setLoadedMenus] = useState<readonly MenuItem[]>(providedMenus ?? []);
  useEffect(() => observeHealth(setState), []);
  useEffect(() => {
    if (providedMenus) return;
    const controller = new AbortController();
    void loadPluginMenus({ signal: controller.signal }).then(value => { setLoadedMenus(value); setMenuState('success'); }).catch(() => {
      if (!controller.signal.aborted) setMenuState('failure');
    });
    return () => controller.abort();
  }, [providedMenus]);
  const menus = providedMenus ?? loadedMenus;
  const groups = groupMenus(menus);
  const { pathname } = useLocation();
  const activeMenu = menus.filter(menu => pathname === menu.path || pathname.startsWith(`${menu.path}/`))
    .reduce<MenuItem | undefined>((active, menu) => !active || menu.path.length > active.path.length ? menu : active, undefined);
  return <div className="app-shell"><aside><p className="eyebrow">오픈소스 취약점 관리 플랫폼</p><h1><NavLink to="/">OSS-SCP</NavLink></h1>
    {menuState === 'loading' ? <p>플러그인 메뉴 로딩 중</p> : menuState === 'failure' ? <p role="alert">플러그인 메뉴를 불러오지 못했습니다.</p> : null}
    <nav aria-label="플러그인 메뉴">{[...groups].map(([group, entries]) => <section className="menu-group" key={group} aria-labelledby={`group-${group}`}><h2 id={`group-${group}`}>{group}</h2><ul>
      {entries.map(menu => <li key={menu.path}><NavLink to={menu.path} end={menu !== activeMenu}>{menu.title}</NavLink></li>)}</ul></section>)}</nav>
    </aside><div className="workspace"><header className="app-header"><div className="header-actions"><p role="status" className={`status ${state}`}>{labels[state]}</p><span className="version">v{productVersion}</span><ThemePicker /></div></header><main><Routes>
      <Route path="/" element={<PluginHome menus={menus} menuState={menuState} />} />
      {menuState === 'success' ? menus.flatMap(menu => [
        <Route key={menu.path} path={menu.path} element={<ListRoute menu={menu} registry={customViews} />} />,
        <Route key={`${menu.path}/:recordId`} path={`${menu.path}/:recordId`} element={<DetailRoute menu={menu} registry={customViews} />} />,
      ]) : null}<Route path="*" element={<NotFound />} />
    </Routes></main></div></div>;
}
