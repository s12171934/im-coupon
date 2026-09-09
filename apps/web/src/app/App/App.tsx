import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { HEALTH_PATH, type HealthResponse } from '@im-coupon/contracts';

import { AppLayout } from '../AppLayout/AppLayout';
import { APP_PATHS } from '../routes';
import type { StorageStatusState } from '../../features/storage/components/StorageStatus/StorageStatus';
import { ConsumptionPage } from '../../pages/ConsumptionPage';
import { IssuePage } from '../../pages/IssuePage/IssuePage';
import { NotFoundPage } from '../../pages/NotFoundPage/NotFoundPage';

export function App() {
  const [storage, setStorage] = useState<StorageStatusState>({ kind: 'loading' });

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
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to={APP_PATHS.issue} replace />} />
        <Route path={APP_PATHS.issue} element={<IssuePage storage={storage} />} />
        <Route path={APP_PATHS.myCoupons} element={<p>내 쿠폰 화면은 준비 중입니다</p>} />
        <Route path={APP_PATHS.consumption} element={<ConsumptionPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
