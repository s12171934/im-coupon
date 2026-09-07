import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CITIZENS_PATH,
  COUPONS_PATH,
  HEALTH_PATH,
  type Citizen,
  type ListCitizensResponse,
  type ListCouponsResponse,
} from '@im-coupon/contracts';

import { App } from './App';

/** 설계문서 7장 `citizens` 예시 레코드. 내 쿠폰 화면의 소유자 선택이 이 목록으로 채워진다. */
const CITIZENS: Citizen[] = [{ id: 'cit-001', name: '김시민' }];

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * 경로별로 갈리는 `fetch` 스텁. 탭 셸이 부르는 헬스 조회에 더해, 내 쿠폰 화면에서는 그 화면의
 * 시민 목록·쿠폰 목록 조회가 나가므로 응답을 호출 순서가 아니라 경로로 갈라야 한다.
 * 경로는 계약 상수에서 가져온다 — 이 워크스페이스는 경로 문자열을 직접 박지 않는다 (설계문서 8장).
 */
function stubApi(health: unknown): void {
  const citizens: ListCitizensResponse = { citizens: CITIZENS };
  const coupons: ListCouponsResponse = { coupons: [] };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith(HEALTH_PATH)) return jsonResponse(health);
      if (path.startsWith(CITIZENS_PATH)) return jsonResponse(citizens);
      /*
        쿼리까지 붙여 맞춘다. 내 쿠폰 조회는 늘 소유자 쿼리를 실으므로(설계문서 8장) 이
        접두가 정확하고, 경로만 보면 `ISSUE_COUPON_PATH` 까지 함께 걸려 발급 요청이 쿠폰
        목록 응답을 받는다.
      */
      if (path.startsWith(`${COUPONS_PATH}?`)) return jsonResponse(coupons);
      throw new Error(`스텁하지 않은 경로: ${path}`);
    }),
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function stubHealthyStorage(): void {
  stubApi({
    status: 'ok',
    storage: { readable: true, schemaVersion: 1, collections: ['coupons'] },
  });
}

describe('App', () => {
  it('저장소가 정상이면 스키마 판과 컬렉션 수를 보여준다', async () => {
    stubApi({
      status: 'ok',
      storage: { readable: true, schemaVersion: 1, collections: ['coupons'] },
    });

    render(<MemoryRouter><App /></MemoryRouter>);

    expect(await screen.findByText('정상')).toBeInTheDocument();
    expect(await screen.findByText('스키마 1판 · 컬렉션 1개')).toBeInTheDocument();
  });

  it('저장소를 읽지 못하면 점검 필요로 보여준다', async () => {
    stubApi({
      status: 'degraded',
      storage: { readable: false, schemaVersion: null, collections: [] },
    });

    render(<MemoryRouter><App /></MemoryRouter>);

    expect(await screen.findByText('점검 필요')).toBeInTheDocument();
  });

  it('발급 실행 링크가 기본으로 선택되고 그 화면만 보인다', async () => {
    stubHealthyStorage();

    render(<MemoryRouter><App /></MemoryRouter>);

    expect(screen.getByRole('link', { name: '발급 실행' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '내 쿠폰' })).not.toHaveAttribute('aria-current');

    expect(await screen.findByText('정상')).toBeInTheDocument();
  });

  it('발급 실행 화면에 발급 실행 화면이 붙어 있다', async () => {
    stubHealthyStorage();

    render(<MemoryRouter><App /></MemoryRouter>);

    expect(await screen.findByText('정상')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '발급 1건 실행' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '발급 가중치' })).toBeInTheDocument();
  });

  it('내 쿠폰 링크를 누르면 그 링크가 선택되고 내 쿠폰 화면으로 바뀐다', async () => {
    stubHealthyStorage();
    const user = userEvent.setup();

    render(<MemoryRouter><App /></MemoryRouter>);
    await screen.findByText('정상');
    await user.click(screen.getByRole('link', { name: '내 쿠폰' }));

    expect(screen.getByRole('link', { name: '내 쿠폰' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '발급 실행' })).not.toHaveAttribute('aria-current');

    /*
      화면이 붙었다는 것만 본다. 화면 안의 동작은 `my-coupons-page.test.tsx` 의 몫이다 —
      발급 실행 탭에 대해 위 케이스가 잡은 것과 같은 최소 단언이다.
    */
    expect(await screen.findByLabelText('소유자 선택')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '내 쿠폰 — 시민 시점', level: 2 })).toBeInTheDocument();
    expect(screen.queryByText('정상')).not.toBeInTheDocument();
  });

  it('내 쿠폰 화면에서 발급 실행 화면으로 되돌아온다', async () => {
    stubHealthyStorage();
    const user = userEvent.setup();

    render(<MemoryRouter><App /></MemoryRouter>);
    await user.click(screen.getByRole('link', { name: '내 쿠폰' }));
    await user.click(screen.getByRole('link', { name: '발급 실행' }));

    expect(screen.getByRole('link', { name: '발급 실행' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('heading', { name: '내 쿠폰 — 시민 시점' })).not.toBeInTheDocument();
    expect(await screen.findByText('정상')).toBeInTheDocument();
  });
});

it('/my-coupons로 직접 진입하면 내 쿠폰 화면을 보여준다', async () => {
  stubHealthyStorage();
  render(<MemoryRouter initialEntries={['/my-coupons']}><App /></MemoryRouter>);
  expect(screen.getByRole('link', { name: '내 쿠폰' })).toHaveAttribute('aria-current', 'page');
  expect(await screen.findByLabelText('소유자 선택')).toBeInTheDocument();
});

it('없는 경로에서 안내를 보여주고 발급 화면으로 이동한다', async () => {
  stubHealthyStorage();
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/missing']}><App /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: '페이지를 찾을 수 없습니다' })).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: '발급 실행으로 이동' }));
  expect(await screen.findByText('정상')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '발급 실행' })).toHaveAttribute('aria-current', 'page');
});

it('화면을 왕복해도 앱이 유지되어 헬스 조회를 반복하지 않는다', async () => {
  stubHealthyStorage();
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/issue']}><App /></MemoryRouter>);
  await screen.findByText('정상');
  await user.click(screen.getByRole('link', { name: '내 쿠폰' }));
  await screen.findByLabelText('소유자 선택');
  await user.click(screen.getByRole('link', { name: '발급 실행' }));
  await screen.findByText('정상');
  const healthCalls = vi.mocked(fetch).mock.calls.filter(([path]) => String(path) === HEALTH_PATH);
  expect(healthCalls).toHaveLength(1);
});
