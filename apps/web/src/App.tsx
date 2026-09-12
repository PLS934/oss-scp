import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useParams } from 'react-router-dom';
import { RecordDetail } from './detail';
import { observeHealth, type ConnectionState } from './health';
import { groupMenus, type MenuItem } from './menu';
import { loadPluginMenus } from './plugin-menus';
import { RecordList } from './record-list';

const labels: Record<ConnectionState, string> = { loading: '서버 연결 확인 중', success: '서버 연결 성공', failure: '서버 연결 실패' };
const iconLabels = { server: '서버', shield: '보안', repository: '저장소' } as const;
function NotFound() { return <section><h2>페이지를 찾을 수 없습니다</h2><p>등록된 메뉴에서 이동해 주세요.</p></section>; }
function DetailRoute({ menu }: { menu: MenuItem }) { const { recordId = '' } = useParams(); return <RecordDetail menu={menu} recordId={recordId} />; }

export default function App({ menus: providedMenus }: { menus?: readonly MenuItem[] }) {
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
  return <div className="app-shell"><aside><p className="eyebrow">오픈소스 취약점 관리 플랫폼</p><h1><NavLink to="/">OSS-SCP</NavLink></h1>
    {menuState === 'loading' ? <p>플러그인 메뉴 로딩 중</p> : menuState === 'failure' ? <p role="alert">플러그인 메뉴를 불러오지 못했습니다.</p> : null}
    <nav aria-label="플러그인 메뉴">{[...groups].map(([group, entries]) => <section className="menu-group" key={group} aria-labelledby={`group-${group}`}><h2 id={`group-${group}`}>{group}</h2><ul>
      {entries.map(menu => <li key={menu.path}><NavLink to={menu.path}><span aria-hidden="true">{iconLabels[menu.icon]}</span> {menu.title}</NavLink></li>)}</ul></section>)}</nav>
    <p role="status" className={`status ${state}`}>{labels[state]}</p></aside><main><Routes>
      <Route path="/" element={<section><h2>플러그인 메뉴</h2><p>조회할 데이터 메뉴를 선택해 주세요.</p></section>} />
      {menuState === 'success' ? menus.flatMap(menu => [
        <Route key={menu.path} path={menu.path} element={<RecordList key={`${menu.pluginId}:${menu.sourceId}:${menu.dataType}`} menu={menu} />} />,
        <Route key={`${menu.path}/:recordId`} path={`${menu.path}/:recordId`} element={<DetailRoute menu={menu} />} />,
      ]) : null}<Route path="*" element={<NotFound />} />
    </Routes></main></div>;
}
