import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubHealth(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
  );
}

function stubHealthyStorage(): void {
  stubHealth({
    status: 'ok',
    storage: { readable: true, schemaVersion: 1, collections: ['coupons'] },
  });
}

describe('App', () => {
  it('저장소가 정상이면 스키마 판과 컬렉션 수를 보여준다', async () => {
    stubHealth({
      status: 'ok',
      storage: { readable: true, schemaVersion: 1, collections: ['coupons'] },
    });

    render(<MemoryRouter><App /></MemoryRouter>);

    expect(await screen.findByText('정상')).toBeInTheDocument();
    expect(await screen.findByText('스키마 1판 · 컬렉션 1개')).toBeInTheDocument();
  });

  it('저장소를 읽지 못하면 점검 필요로 보여준다', async () => {
    stubHealth({
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

    expect(screen.getByRole('navigation', { name: '화면' })).toBeInTheDocument();
    expect(await screen.findByText('정상')).toBeInTheDocument();
  });

  it('발급 실행 화면에 발급 실행 화면이 붙어 있다', async () => {
    stubHealthyStorage();

    render(<MemoryRouter><App /></MemoryRouter>);

    expect(await screen.findByText('정상')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '발급 1건 실행' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '발급 가중치' })).toBeInTheDocument();
  });

  it('내 쿠폰 링크를 누르면 그 링크가 선택되고 준비 중 안내로 바뀐다', async () => {
    stubHealthyStorage();
    const user = userEvent.setup();

    render(<MemoryRouter><App /></MemoryRouter>);
    await screen.findByText('정상');
    await user.click(screen.getByRole('link', { name: '내 쿠폰' }));

    expect(screen.getByRole('link', { name: '내 쿠폰' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '발급 실행' })).not.toHaveAttribute('aria-current');


    expect(screen.getByText('내 쿠폰 화면은 준비 중입니다')).toBeInTheDocument();
    expect(screen.queryByText('정상')).not.toBeInTheDocument();
  });

  it('내 쿠폰 화면에서 발급 실행 화면으로 되돌아온다', async () => {
    stubHealthyStorage();
    const user = userEvent.setup();

    render(<MemoryRouter><App /></MemoryRouter>);
    await user.click(screen.getByRole('link', { name: '내 쿠폰' }));
    await user.click(screen.getByRole('link', { name: '발급 실행' }));

    expect(screen.getByRole('link', { name: '발급 실행' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText('내 쿠폰 화면은 준비 중입니다')).not.toBeInTheDocument();
    expect(await screen.findByText('정상')).toBeInTheDocument();
  });
});

it('/my-coupons로 직접 진입하면 내 쿠폰 화면을 보여준다', async () => {
  stubHealthyStorage();
  render(<MemoryRouter initialEntries={['/my-coupons']}><App /></MemoryRouter>);
  expect(screen.getByRole('link', { name: '내 쿠폰' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('내 쿠폰 화면은 준비 중입니다')).toBeInTheDocument();
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
