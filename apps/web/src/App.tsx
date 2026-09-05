import { useEffect, useState } from 'react';
import { HEALTH_PATH, type HealthResponse } from '@im-coupon/contracts';

type Loaded = { kind: 'loading' } | { kind: 'loaded'; health: HealthResponse } | { kind: 'failed' };

export function App() {
  const [state, setState] = useState<Loaded>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(HEALTH_PATH)
      .then((response) => response.json() as Promise<HealthResponse>)
      .then((health) => {
        if (!cancelled) setState({ kind: 'loaded', health });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>im-coupon</h1>
      <section aria-label="저장소 상태">
        <h2>저장소</h2>
        {state.kind === 'loading' && <p>확인 중…</p>}
        {state.kind === 'failed' && <p>API 에 연결하지 못했습니다</p>}
        {state.kind === 'loaded' && <StorageStatus health={state.health} />}
      </section>
    </main>
  );
}

function StorageStatus({ health }: { health: HealthResponse }) {
  const { storage } = health;
  return (
    <>
      <p data-testid="storage-status">{health.status === 'ok' ? '정상' : '점검 필요'}</p>
      <p data-testid="storage-detail">
        {storage.readable
          ? `스키마 ${storage.schemaVersion ?? '?'}판 · 컬렉션 ${storage.collections.length}개`
          : '데이터 디렉터리를 읽지 못했습니다'}
      </p>
    </>
  );
}
