import { useEffect, useState } from 'react';
import { HEALTH_PATH, type HealthResponse } from '@im-coupon/contracts';

type Loaded = { kind: 'loading' } | { kind: 'loaded'; health: HealthResponse } | { kind: 'failed' };

const TABS = [
  { id: 'issue', label: '발급 실행' },
  { id: 'my-coupons', label: '내 쿠폰' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function App() {
  const [state, setState] = useState<Loaded>({ kind: 'loading' });
  const [activeTab, setActiveTab] = useState<TabId>('issue');

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
      <div role="tablist" aria-label="화면">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            aria-selected={activeTab === tab.id}
            aria-controls={panelId(tab.id)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'issue' ? (
        <section role="tabpanel" id={panelId('issue')} aria-labelledby={tabId('issue')}>
          <section aria-label="저장소 상태">
            <h2>저장소</h2>
            {state.kind === 'loading' && <p>확인 중…</p>}
            {state.kind === 'failed' && <p>API 에 연결하지 못했습니다</p>}
            {state.kind === 'loaded' && <StorageStatus health={state.health} />}
          </section>
        </section>
      ) : (
        <section role="tabpanel" id={panelId('my-coupons')} aria-labelledby={tabId('my-coupons')}>
          <p>내 쿠폰 화면은 준비 중입니다</p>
        </section>
      )}
    </main>
  );
}

function tabId(tab: TabId): string {
  return `tab-${tab}`;
}

function panelId(tab: TabId): string {
  return `panel-${tab}`;
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
