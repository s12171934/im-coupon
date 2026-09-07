import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CITIZENS_PATH,
  type ApiErrorCode,
  type ApiErrorResponse,
  type Citizen,
  type ListCitizensResponse,
} from '@im-coupon/contracts';

import { useCitizens } from './use-citizens';

/**
 * 시민 세 건. `id` 로도 이름으로도 정렬되어 있지 않은 순서라, 훅이 어느 키로 정렬하든
 * 이 순서와 어긋난다 — 시드 순서 그대로가 계약이라는 것(설계문서 8장)을 이 픽스처가 든다.
 */
const CITIZENS: Citizen[] = [
  { id: 'cit-002', name: '나시민' },
  { id: 'cit-001', name: '다시민' },
  { id: 'cit-003', name: '가시민' },
];

const LISTED: ListCitizensResponse = { citizens: CITIZENS };

/** 계약의 여섯 코드. 계약 밖 실패가 이 중 하나를 빌려 쓰지 않는 것을 이 표로 든다. */
const CONTRACT_CODES: Record<ApiErrorCode, true> = {
  INVALID_BODY: true,
  INVALID_WEIGHTS: true,
  NO_CANDIDATES: true,
  MISSING_OWNER_ID: true,
  UNKNOWN_OWNER: true,
  STORAGE_FAILURE: true,
};

/**
 * `Response` 를 흉내 낸다. 훅이 읽는 것은 `ok`·`status`·`json()` 셋뿐이라 그 셋만 든다.
 * 실제 `Response` 를 쓰면 본문을 문자열로 굳혀야 해서, 본문이 JSON 으로 읽히지 않는
 * 갈래(`json()` 이 던짐)를 같은 틀로 만들 수 없다.
 */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

/** 응답은 왔는데 본문이 JSON 으로 읽히지 않는 갈래. */
function unparsableResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
  } as Response;
}

function errorResponse(status: number, code: ApiErrorCode, message: string): Response {
  const body: ApiErrorResponse = { error: { code, message } };
  return jsonResponse(status, body);
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 실패 상태에서만 오류를 꺼낸다 — 다른 상태였으면 그 사실이 실패 메시지에 남는다. */
function failureOf(state: ReturnType<typeof useCitizens>['state']) {
  if (state.status !== 'failed') {
    throw new Error(`실패 상태가 아니다: ${state.status}`);
  }
  return state.error;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useCitizens', () => {
  it('조회가 끝나기 전에는 조회 중 상태다', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
    );
    const { result } = renderHook(() => useCitizens());

    expect(result.current.state).toEqual({ status: 'loading' });
  });

  it('계약의 시민 목록 경로로 한 번만 조회한다', async () => {
    const fetchMock = stubFetch(jsonResponse(200, LISTED));
    const { result } = renderHook(() => useCitizens());

    await waitFor(() => expect(result.current.state.status).toBe('loaded'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(CITIZENS_PATH);
  });

  it('응답이 오면 시민 목록을 응답에 든 순서 그대로 실은 성공 상태가 된다', async () => {
    stubFetch(jsonResponse(200, LISTED));
    const { result } = renderHook(() => useCitizens());

    await waitFor(() => expect(result.current.state).toEqual({ status: 'loaded', citizens: CITIZENS }));
  });

  it('시민이 한 건도 없어도 성공 상태다', async () => {
    stubFetch(jsonResponse(200, { citizens: [] } satisfies ListCitizensResponse));
    const { result } = renderHook(() => useCitizens());

    await waitFor(() => expect(result.current.state).toEqual({ status: 'loaded', citizens: [] }));
  });

  it('성공 응답의 본문이 목록을 담고 있지 않으면 상태 번호를 남긴 실패가 된다', async () => {
    const bodies: unknown[] = [{}, { citizens: null }, { citizens: { 0: CITIZENS[0] } }, '시민 목록'];

    for (const body of bodies) {
      stubFetch(jsonResponse(200, body));
      const { result } = renderHook(() => useCitizens());

      await waitFor(() => expect(result.current.state.status).toBe('failed'));

      const error = failureOf(result.current.state);
      expect(error.code).not.toBe('');
      expect(Object.keys(CONTRACT_CODES)).not.toContain(error.code);
      expect(error.message).toContain('200');
      vi.unstubAllGlobals();
    }
  });

  it('목록의 원소가 시민 계약 모양이 아니면 상태 번호를 남긴 실패가 된다', async () => {
    stubFetch(jsonResponse(200, { citizens: [CITIZENS[0], { id: 'cit-004' }] }));
    const { result } = renderHook(() => useCitizens());

    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    const error = failureOf(result.current.state);
    expect(Object.keys(CONTRACT_CODES)).not.toContain(error.code);
    expect(error.message).toContain('200');
  });

  it('서버가 가린 STORAGE_FAILURE 문구를 화면이 다시 쓰지 않는다', async () => {
    const masked = '저장소를 읽지 못해 시민 목록을 만들지 못했다';
    stubFetch(errorResponse(500, 'STORAGE_FAILURE', masked));
    const { result } = renderHook(() => useCitizens());

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'failed',
        error: { code: 'STORAGE_FAILURE', message: masked },
      }),
    );
  });

  it('실패 응답의 본문이 JSON 으로 읽히지 않으면 상태 번호를 남긴 실패가 된다', async () => {
    stubFetch(unparsableResponse(502));
    const { result } = renderHook(() => useCitizens());

    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    const error = failureOf(result.current.state);
    expect(error.code).not.toBe('');
    expect(Object.keys(CONTRACT_CODES)).not.toContain(error.code);
    expect(error.message).toContain('502');
  });

  it('요청이 응답에 닿지 못하면 계약의 여섯 코드를 빌려 쓰지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const { result } = renderHook(() => useCitizens());

    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    const error = failureOf(result.current.state);
    expect(error.code).not.toBe('');
    expect(error.message).not.toBe('');
    expect(Object.keys(CONTRACT_CODES)).not.toContain(error.code);
  });
});
