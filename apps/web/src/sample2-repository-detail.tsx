import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CustomPluginDetailProps } from './custom-plugin-views';
import { getRecord, type JsonValue, type QueryRecord, type RecordApiError } from './records';

type State =
  | { kind: 'loading' }
  | { kind: 'success'; record: QueryRecord }
  | { kind: 'invalid' | 'missing' | 'mismatch' | 'failure'; error?: RecordApiError };

function text(value: JsonValue | undefined, fallback = '정보 없음'): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function memberNames(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(member => {
    if (typeof member !== 'object' || member === null || Array.isArray(member)) return [];
    return typeof member.login === 'string' && member.login.length > 0 ? [member.login] : [];
  });
}

export function Sample2RepositoryDetailView({ menu, state, onRetry }: CustomPluginDetailProps & { state: State; onRetry?: () => void }) {
  if (state.kind !== 'success') {
    const message = state.kind === 'loading' ? '저장소 상세 정보를 불러오는 중입니다.' : state.kind === 'invalid' ? '잘못된 레코드 ID입니다.' : state.kind === 'missing' ? '저장 레코드를 찾을 수 없습니다.' : state.kind === 'mismatch' ? '현재 플러그인에 속한 레코드가 아닙니다.' : '상세 정보를 불러오지 못했습니다.';
    return <section aria-labelledby="repository-detail-state"><h2 id="repository-detail-state">{message}</h2>{state.kind === 'failure' ? <button type="button" onClick={onRetry}>다시 시도</button> : null}{state.kind !== 'loading' ? <p><Link to={menu.path}>목록으로 돌아가기</Link></p> : null}</section>;
  }

  const { record } = state;
  const values = record.sourceValues;
  const name = text(values.fullName, String(record.externalKey));
  const active = values.active === true;
  const members = memberNames(values.members);
  const details = typeof values.details === 'object' && values.details !== null && !Array.isArray(values.details) ? values.details : {};
  const observedAt = typeof details.observedAt === 'string' && !Number.isNaN(Date.parse(details.observedAt)) ? details.observedAt : null;

  return <section className="repository-detail" aria-labelledby="repository-detail-title">
    <Link className="back-link" to={menu.path}>← 저장소 목록</Link>
    <header className="repository-detail-header">
      <div><p className="eyebrow">{menu.group} · 저장소</p><h2 id="repository-detail-title">{name}</h2><p>{text(values.assetKey, String(record.externalKey))}</p></div>
      <span className={`repository-status ${active ? 'active' : 'inactive'}`}>{active ? '활성' : '비활성'}</span>
    </header>
    <div className="repository-summary">
      <section><h3>피드</h3><p>{text(values.feed)}</p></section>
      <section><h3>레이블</h3><p>{text(details.label)}</p></section>
      <section><h3>관측 시각</h3><p>{observedAt ? <time dateTime={observedAt}>{new Date(observedAt).toLocaleString('ko-KR')}</time> : '정보 없음'}</p></section>
    </div>
    <section className="repository-members"><h3>구성원 <span>{members.length}</span></h3>{members.length > 0 ? <ul>{members.map(member => <li key={member}>{member}</li>)}</ul> : <p className="empty-value">등록된 구성원이 없습니다.</p>}</section>
  </section>;
}

export function Sample2RepositoryDetail({ menu, recordId }: CustomPluginDetailProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void getRecord(recordId, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setState({ kind: result.error.kind === 'INVALID_INPUT' ? 'invalid' : result.error.kind === 'NOT_FOUND' ? 'missing' : 'failure', error: result.error });
        return;
      }
      const record = result.data;
      setState(record.pluginId === menu.pluginId && record.sourceId === menu.sourceId && record.dataType === menu.dataType ? { kind: 'success', record } : { kind: 'mismatch' });
    });
    return () => controller.abort();
  }, [attempt, menu.dataType, menu.pluginId, menu.sourceId, recordId]);
  return <Sample2RepositoryDetailView menu={menu} recordId={recordId} state={state} onRetry={() => setAttempt(value => value + 1)} />;
}
