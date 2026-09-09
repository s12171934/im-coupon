import { Link } from 'react-router';

import { APP_PATHS } from '../../app/routes';

export function NotFoundPage() {
  return (
    <section>
      <h2>페이지를 찾을 수 없습니다</h2>
      <Link to={APP_PATHS.issue}>발급 실행으로 이동</Link>
    </section>
  );
}
