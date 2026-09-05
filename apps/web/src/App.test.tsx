import { render, screen } from '@testing-library/react';
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
});
