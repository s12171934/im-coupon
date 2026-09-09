import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { App } from './app/App/App';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubConsumption(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
  );
}

describe('App', () => {
  it('소비 쿠폰과 포인트 지갑을 보여준다', async () => {
    stubConsumption({ coupons: [], paybackAmount: 0, ownerRewardAmount: 0, pointEntries: [] });

    render(<MemoryRouter initialEntries={['/consumption']}><App /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: '내 리워드 미션' })).toBeInTheDocument();
    expect((await screen.findAllByText('지역화폐')).length).toBeGreaterThan(0);
  });

  it('혜택 정보를 불러오지 못하면 안내한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    render(<MemoryRouter initialEntries={['/consumption']}><App /></MemoryRouter>);

    expect(await screen.findByText(/혜택 정보를 불러오지 못했습니다/)).toBeInTheDocument();
  });
});
