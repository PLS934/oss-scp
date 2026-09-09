import { useEffect, useState } from 'react';
import { observeHealth, type ConnectionState } from './health';

const labels: Record<ConnectionState, string> = {
  loading: '서버 연결 확인 중',
  success: '서버 연결 성공',
  failure: '서버 연결 실패',
};

export default function App() {
  const [state, setState] = useState<ConnectionState>('loading');
  useEffect(() => observeHealth(setState), []);
  return (
    <main>
      <p className="eyebrow">오픈소스 취약점 관리 플랫폼</p>
      <h1>OSS-SCP</h1>
      <section aria-labelledby="connection-title">
        <h2 id="connection-title">서버 연결 상태</h2>
        <p role="status" className={`status ${state}`}>{labels[state]}</p>
        {state === 'failure' && <p>서버 실행과 연결 설정을 확인한 뒤 페이지를 새로고침해 주세요.</p>}
        <p className="description">서버의 HTTP 연결 상태입니다. 수집처 상태나 데이터 최신성을 의미하지 않습니다.</p>
      </section>
    </main>
  );
}
