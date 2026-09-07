import { NavLink, Outlet } from 'react-router';

import { APP_PATHS } from '../routes';

/** 모든 화면이 공유하는 제목과 URL 기반 내비게이션. */
export function AppLayout() {
  return (
    <main>
      <h1>im-coupon</h1>
      <nav aria-label="화면">
        <NavLink to={APP_PATHS.issue}>발급 실행</NavLink>
        {' · '}
        <NavLink to={APP_PATHS.myCoupons}>내 쿠폰</NavLink>
      </nav>
      <Outlet />
    </main>
  );
}
