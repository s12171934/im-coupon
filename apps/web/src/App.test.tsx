import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

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

    render(<App />);

    expect(await screen.findByText('쿠폰을 움직여 보세요')).toBeInTheDocument();
    expect(await screen.findByText('지역화폐 페이백')).toBeInTheDocument();
  });

  it('API 오류를 메시지로 안내한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    render(<App />);

    expect(await screen.findByText(/API에 연결하지 못했습니다/)).toBeInTheDocument();
  });
});
