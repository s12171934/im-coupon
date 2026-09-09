import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ISSUE_COUPON_PATH,
  type ApiErrorCode,
  type ApiErrorResponse,
  type IssuedCoupon,
  type IssueCouponResponse,
} from '@im-coupon/contracts';

import type { WeightsDraft } from '../components/WeightsEditor/WeightsEditor';
import { useIssueCoupon } from './use-issue-coupon';

/** 설계문서 7장 `coupons` 예시 레코드. 훅은 응답을 해석하지 않고 그대로 실어 주기만 한다. */
const COUPON: IssuedCoupon = {
  id: 'cpn-9b1c6a2e-3f47-4a6b-8f0e-2d5c7e1a4b93',
  status: 'held',
  trigger: 'manual',
  ownerId: 'cit-001',
  ownerName: '김시민',
  merchantId: 'mer-001',
  merchantName: '달성책방',
  faceValue: 5000,
  benefitSplit: { ownerRatio: 0.2, consumerRatio: 0.8 },
  issuedAt: '2026-09-10T05:00:00.000Z',
  heldUntil: '2026-09-13T05:00:00.000Z',
  expiresAt: '2026-09-15T05:00:00.000Z',
};

const ISSUED: IssueCouponResponse = {
  coupon: COUPON,
  decision: { candidateCount: 25, scores: { random: 0.42 }, total: 0.42 },
};

/** 계약의 여섯 코드. 네트워크 실패가 이 중 하나를 빌려 쓰지 않는 것을 이 표로 든다. */
const CONTRACT_CODES: Record<ApiErrorCode, true> = {
  INVALID_BODY: true,
  INVALID_WEIGHTS: true,
  NO_CANDIDATES: true,
  MISSING_OWNER_ID: true,
  UNKNOWN_OWNER: true,
  STORAGE_FAILURE: true,
};

const EMPTY_DRAFT: WeightsDraft = { random: '' };

function draft(random: string): WeightsDraft {
  return { random };
}

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

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 마지막 요청의 `[경로, init]`. 요청이 나가지 않았으면 그 사실이 실패 메시지에 남는다. */
function lastRequest(fetchMock: ReturnType<typeof stubFetch>) {
  const call = fetchMock.mock.calls.at(-1);
  if (call === undefined) throw new Error('요청이 한 번도 나가지 않았다');
  return { path: call[0], init: call[1] as RequestInit };
}

function headerOf(init: RequestInit, name: string): string | undefined {
  return new Headers(init.headers).get(name) ?? undefined;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIssueCoupon', () => {
  it('처음에는 아직 발급하지 않은 상태다', () => {
    stubFetch();
    const { result } = renderHook(() => useIssueCoupon());

    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('계약의 경로로 JSON 본문을 실은 POST 를 보낸다', async () => {
    const fetchMock = stubFetch(jsonResponse(201, ISSUED));
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(draft('2')));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { path, init } = lastRequest(fetchMock);
    expect(path).toBe(ISSUE_COUPON_PATH);
    expect(init.method).toBe('POST');
    expect(headerOf(init, 'Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ weights: { random: 2 } }));
  });

  it('빈 문자열인 신호는 본문에서 뺀다 — 서버가 기본값으로 채운다', async () => {
    const fetchMock = stubFetch(jsonResponse(201, ISSUED));
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(EMPTY_DRAFT));

    const { init } = lastRequest(fetchMock);
    expect(JSON.parse(String(init.body))).not.toHaveProperty('weights.random');
    /* `0` 으로 보내면 합이 0 이 되어 서버가 `INVALID_WEIGHTS` 로 거부한다. 빈 칸의 뜻이 아니다. */
    expect(String(init.body)).not.toContain('0');
  });

  it('음수·문자·아주 큰 수를 화면이 막지 않고 그대로 싣는다', async () => {
    const cases: [string, string][] = [
      ['-1', '{"weights":{"random":-1}}'],
      ['abc', '{"weights":{"random":null}}'],
      ['1e999', '{"weights":{"random":null}}'],
      ['0', '{"weights":{"random":0}}'],
      ['1', '{"weights":{"random":1}}'],
    ];

    for (const [text, expected] of cases) {
      const fetchMock = stubFetch(jsonResponse(201, ISSUED));
      const { result } = renderHook(() => useIssueCoupon());

      await act(() => result.current.issue(draft(text)));

      expect(String(lastRequest(fetchMock).init.body)).toBe(expected);
      vi.unstubAllGlobals();
    }
  });

  it('공백만 든 값을 트림하지 않는다 — 판정은 서버의 값 규칙이 한다', async () => {
    const fetchMock = stubFetch(jsonResponse(201, ISSUED));
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(draft('  ')));

    /* 트림해 빈 문자열로 만들면 키가 빠져 기본값 발급이 된다. `Number('  ')` 는 `0` 이다. */
    expect(String(lastRequest(fetchMock).init.body)).toBe('{"weights":{"random":0}}');
  });

  it('성공하면 발급 응답을 그대로 든 성공 상태가 된다', async () => {
    stubFetch(jsonResponse(201, ISSUED));
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(EMPTY_DRAFT));

    expect(result.current.state).toEqual({ status: 'succeeded', result: ISSUED });
  });

  it('발급하는 동안 발급 중 상태다', async () => {
    let release: (response: Response) => void = () => {};
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useIssueCoupon());

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.issue(EMPTY_DRAFT);
    });

    expect(result.current.state).toEqual({ status: 'issuing' });

    await act(async () => {
      release(jsonResponse(201, ISSUED));
      await pending;
    });

    expect(result.current.state).toEqual({ status: 'succeeded', result: ISSUED });
  });

  it('발급 중에 다시 부르면 요청을 한 번만 보낸다', async () => {
    let release: (response: Response) => void = () => {};
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useIssueCoupon());

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.issue(EMPTY_DRAFT);
      second = result.current.issue(EMPTY_DRAFT);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(jsonResponse(201, ISSUED));
      await Promise.all([first, second]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ status: 'succeeded', result: ISSUED });
  });

  it('발급이 끝난 뒤에는 다시 부를 수 있다', async () => {
    const fetchMock = stubFetch(jsonResponse(201, ISSUED), jsonResponse(201, ISSUED));
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(EMPTY_DRAFT));
    await act(() => result.current.issue(EMPTY_DRAFT));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('계약대로의 오류 응답은 코드와 메시지를 그대로 싣는다', async () => {
    stubFetch(errorResponse(422, 'NO_CANDIDATES', '발급 후보가 없어 발급하지 못했다'));
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(EMPTY_DRAFT));

    expect(result.current.state).toEqual({
      status: 'failed',
      error: { code: 'NO_CANDIDATES', message: '발급 후보가 없어 발급하지 못했다' },
    });
  });

  it('서버가 가린 STORAGE_FAILURE 문구를 화면이 다시 쓰지 않는다', async () => {
    const masked = '저장소를 읽거나 쓰지 못해 발급하지 못했다';
    stubFetch(errorResponse(500, 'STORAGE_FAILURE', masked));
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(EMPTY_DRAFT));

    expect(result.current.state).toEqual({
      status: 'failed',
      error: { code: 'STORAGE_FAILURE', message: masked },
    });
  });

  it('본문이 JSON 으로 읽히지 않으면 상태 번호를 남긴 실패가 된다', async () => {
    stubFetch(unparsableResponse(502));
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(EMPTY_DRAFT));

    expect(result.current.state.status).toBe('failed');
    const error = failureOf(result.current.state);
    expect(error.code).not.toBe('');
    expect(error.message).toContain('502');
  });

  it('본문에 error 가 없으면 상태 번호를 남긴 실패가 된다', async () => {
    stubFetch(jsonResponse(500, { message: '내부 서버 오류' }));
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(EMPTY_DRAFT));

    const error = failureOf(result.current.state);
    expect(error.code).not.toBe('');
    expect(error.message).toContain('500');
  });

  it('성공 응답이 JSON 으로 읽히지 않아도 빈칸이 아닌 실패가 된다', async () => {
    stubFetch(unparsableResponse(201));
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(EMPTY_DRAFT));

    const error = failureOf(result.current.state);
    expect(error.code).not.toBe('');
    expect(error.message).toContain('201');
  });

  it('요청이 응답에 닿지 못하면 계약의 여섯 코드를 빌려 쓰지 않는다', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(EMPTY_DRAFT));

    const error = failureOf(result.current.state);
    expect(error.code).not.toBe('');
    expect(error.message).not.toBe('');
    expect(Object.keys(CONTRACT_CODES)).not.toContain(error.code);
  });

  it('성공하면 이전 실패가 남지 않는다', async () => {
    stubFetch(
      errorResponse(400, 'INVALID_WEIGHTS', '가중치 합이 0 이다'),
      jsonResponse(201, ISSUED),
    );
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(draft('0')));
    await act(() => result.current.issue(draft('1')));

    expect(result.current.state).toEqual({ status: 'succeeded', result: ISSUED });
  });

  it('실패하면 이전 성공이 남지 않는다', async () => {
    stubFetch(
      jsonResponse(201, ISSUED),
      errorResponse(400, 'INVALID_WEIGHTS', '가중치 합이 0 이다'),
    );
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(draft('1')));
    await act(() => result.current.issue(draft('0')));

    expect(result.current.state).toEqual({
      status: 'failed',
      error: { code: 'INVALID_WEIGHTS', message: '가중치 합이 0 이다' },
    });
  });

  it('발급을 시작하면 직전 결과가 즉시 걷힌다', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, ISSUED));
    let release: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useIssueCoupon());

    await act(() => result.current.issue(EMPTY_DRAFT));
    await waitFor(() => expect(result.current.state.status).toBe('succeeded'));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.issue(EMPTY_DRAFT);
    });

    expect(result.current.state).toEqual({ status: 'issuing' });

    await act(async () => {
      release(jsonResponse(201, ISSUED));
      await pending;
    });
  });
});

/** 실패 상태에서만 오류를 꺼낸다 — 다른 상태였으면 그 사실이 실패 메시지에 남는다. */
function failureOf(state: ReturnType<typeof useIssueCoupon>['state']) {
  if (state.status !== 'failed') {
    throw new Error(`실패 상태가 아니다: ${state.status}`);
  }
  return state.error;
}
