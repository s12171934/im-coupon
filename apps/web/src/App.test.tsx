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

    render(<App />);

    expect(await screen.findByText('정상')).toBeInTheDocument();
    expect(await screen.findByText('스키마 1판 · 컬렉션 1개')).toBeInTheDocument();
  });

  it('저장소를 읽지 못하면 점검 필요로 보여준다', async () => {
    stubHealth({
      status: 'degraded',
      storage: { readable: false, schemaVersion: null, collections: [] },
    });

    render(<App />);

    expect(await screen.findByText('점검 필요')).toBeInTheDocument();
  });

  it('발급 실행 탭이 기본으로 선택되고 그 탭 패널만 보인다', async () => {
    stubHealthyStorage();

    render(<App />);

    expect(screen.getByRole('tab', { name: '발급 실행' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '내 쿠폰' })).toHaveAttribute('aria-selected', 'false');

    const panels = screen.getAllByRole('tabpanel');
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveAccessibleName('발급 실행');
    expect(await screen.findByText('정상')).toBeInTheDocument();
  });

  it('발급 실행 탭 패널에 발급 실행 화면이 붙어 있다', async () => {
    stubHealthyStorage();

    render(<App />);

    expect(await screen.findByText('정상')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '발급 1건 실행' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '발급 가중치' })).toBeInTheDocument();
  });

  it('내 쿠폰 탭을 누르면 그 탭이 선택되고 준비 중 안내로 바뀐다', async () => {
    stubHealthyStorage();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText('정상');
    await user.click(screen.getByRole('tab', { name: '내 쿠폰' }));

    expect(screen.getByRole('tab', { name: '내 쿠폰' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '발급 실행' })).toHaveAttribute('aria-selected', 'false');

    const panels = screen.getAllByRole('tabpanel');
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveAccessibleName('내 쿠폰');
    expect(screen.getByText('내 쿠폰 화면은 준비 중입니다')).toBeInTheDocument();
    expect(screen.queryByText('정상')).not.toBeInTheDocument();
  });

  it('내 쿠폰 탭에서 발급 실행 탭으로 되돌아온다', async () => {
    stubHealthyStorage();
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('tab', { name: '내 쿠폰' }));
    await user.click(screen.getByRole('tab', { name: '발급 실행' }));

    expect(screen.getByRole('tab', { name: '발급 실행' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('내 쿠폰 화면은 준비 중입니다')).not.toBeInTheDocument();
    expect(await screen.findByText('정상')).toBeInTheDocument();
  });
});
