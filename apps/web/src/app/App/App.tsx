import { MyCouponsPage } from '../../pages/MyCouponsPage/MyCouponsPage';
import { Navigate, Route, Routes } from 'react-router';

import { AppLayout } from '../AppLayout/AppLayout';
import { APP_PATHS } from '../routes';
import { useStorageHealth } from '../../features/storage/hooks/use-storage-health';
import { IssuePage } from '../../pages/IssuePage/IssuePage';
import { NotFoundPage } from '../../pages/NotFoundPage/NotFoundPage';

export function App() {
  const { state: storage } = useStorageHealth();

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to={APP_PATHS.issue} replace />} />
        <Route path={APP_PATHS.issue} element={<IssuePage storage={storage} />} />
        <Route path={APP_PATHS.myCoupons} element={<MyCouponsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
