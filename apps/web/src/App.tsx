import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { pluginMenus } from './generated/plugin-menu';
import { observeHealth, type ConnectionState } from './health';
import { groupMenus, type MenuItem } from './menu';

const labels: Record<ConnectionState, string> = { loading: '서버 연결 확인 중', success: '서버 연결 성공', failure: '서버 연결 실패' };
const iconLabels = { server: '서버', shield: '보안', repository: '저장소' } as const;
function ScopePlaceholder({ menu }: { menu: MenuItem }) {
  return <section aria-labelledby="scope-title"><p className="eyebrow">{menu.group}</p><h2 id="scope-title">{menu.title}</h2>
    <p>목록 화면을 준비 중입니다.</p><dl className="route-context" aria-label="조회 범위">
      <div><dt>pluginId</dt><dd>{menu.pluginId}</dd></div><div><dt>sourceId</dt><dd>{menu.sourceId}</dd></div><div><dt>dataType</dt><dd>{menu.dataType}</dd></div>
    </dl></section>;
}
function NotFound() { return <section><h2>페이지를 찾을 수 없습니다</h2><p>등록된 메뉴에서 이동해 주세요.</p></section>; }

export default function App({ menus = pluginMenus }: { menus?: readonly MenuItem[] }) {
  const [state, setState] = useState<ConnectionState>('loading');
  useEffect(() => observeHealth(setState), []);
  const groups = groupMenus(menus);
  return <div className="app-shell"><aside><p className="eyebrow">오픈소스 취약점 관리 플랫폼</p><h1><NavLink to="/">OSS-SCP</NavLink></h1>
    <nav aria-label="플러그인 메뉴">{[...groups].map(([group, entries]) => <section className="menu-group" key={group} aria-labelledby={`group-${group}`}><h2 id={`group-${group}`}>{group}</h2><ul>
      {entries.map(menu => <li key={menu.path}><NavLink to={menu.path}><span aria-hidden="true">{iconLabels[menu.icon]}</span> {menu.title}</NavLink></li>)}</ul></section>)}</nav>
    <p role="status" className={`status ${state}`}>{labels[state]}</p></aside><main><Routes>
      <Route path="/" element={<section><h2>플러그인 메뉴</h2><p>조회할 데이터 메뉴를 선택해 주세요.</p></section>} />
      {menus.map(menu => <Route key={menu.path} path={menu.path} element={<ScopePlaceholder menu={menu} />} />)}<Route path="*" element={<NotFound />} />
    </Routes></main></div>;
}
