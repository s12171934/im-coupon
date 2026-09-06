import { useEffect, useState } from 'react';
import { HEALTH_PATH, type HealthResponse } from '@im-coupon/contracts';

import type { StorageStatusState } from './components/storage-status';
import { IssuePage } from './pages/issue-page';

const TABS = [
  { id: 'issue', label: '발급 실행' },
  { id: 'my-coupons', label: '내 쿠폰' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function App() {
  const [storage, setStorage] = useState<StorageStatusState>({ kind: 'loading' });
  const [activeTab, setActiveTab] = useState<TabId>('issue');

  useEffect(() => {
    let cancelled = false;
    fetch(HEALTH_PATH)
      .then((response) => response.json() as Promise<HealthResponse>)
      .then((health) => {
        if (!cancelled) setStorage({ kind: 'loaded', health });
      })
      .catch(() => {
        if (!cancelled) setStorage({ kind: 'failed' });
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
          <IssuePage storage={storage} />
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
