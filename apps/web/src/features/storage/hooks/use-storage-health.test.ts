import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_PATH, type HealthResponse } from '@im-coupon/contracts';

import { useStorageHealth } from './use-storage-health';

/** 정상 응답 하나. 훅은 본문을 해석하지 않고 그대로 실어 주기만 한다. */
const HEALTHY: HealthResponse = {
  status: 'ok',
  storage: { readable: true, schemaVersion: 2, collections: ['coupons'] },
};

/** 저장소를 읽지 못한 응답. 이것도 응답이 온 것이라 조회는 성공이다. */
const DEGRADED: HealthResponse = {
  status: 'degraded',
  storage: { readable: false, schemaVersion: null, collections: [] },
};

/**
 * `Response` 를 흉내 낸다. 훅이 읽는 것은 `json()` 하나뿐이라 그것만 든다 — 실제 `Response`
 * 를 쓰면 본문을 문자열로 굳혀야 해서 본문이 JSON 으로 읽히지 않는 갈래를 만들 수 없다.
 */
function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
}

/** 응답은 왔는데 본문이 JSON 으로 읽히지 않는 갈래. */
function unparsableResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
  } as Response;
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useStorageHealth', () => {
  it('조회가 끝나기 전에는 확인 중 상태다', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
    );
    const { result } = renderHook(() => useStorageHealth());

    expect(result.current.state).toEqual({ kind: 'loading' });
  });

  it('계약의 헬스 경로로 한 번 조회한다', async () => {
    const fetchMock = stubFetch(jsonResponse(HEALTHY));
    const { result } = renderHook(() => useStorageHealth());

    await waitFor(() => expect(result.current.state.kind).toBe('loaded'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(HEALTH_PATH);
  });

  it('응답이 오면 그 헬스를 그대로 실은 상태가 된다', async () => {
    stubFetch(jsonResponse(HEALTHY));
    const { result } = renderHook(() => useStorageHealth());

    await waitFor(() => expect(result.current.state).toEqual({ kind: 'loaded', health: HEALTHY }));
  });

  it('저장소를 읽지 못한 응답도 조회 성공으로 실어 준다', async () => {
    stubFetch(jsonResponse(DEGRADED));
    const { result } = renderHook(() => useStorageHealth());

    await waitFor(() => expect(result.current.state).toEqual({ kind: 'loaded', health: DEGRADED }));
  });

  it('요청이 응답에 닿지 못하면 실패 상태가 된다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const { result } = renderHook(() => useStorageHealth());

    await waitFor(() => expect(result.current.state).toEqual({ kind: 'failed' }));
  });

  it('본문이 JSON 으로 읽히지 않아도 실패 상태가 된다', async () => {
    stubFetch(unparsableResponse());
    const { result } = renderHook(() => useStorageHealth());

    await waitFor(() => expect(result.current.state).toEqual({ kind: 'failed' }));
  });
});
