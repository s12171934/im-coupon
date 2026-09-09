import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COUPONS_PATH,
  OWNER_ID_QUERY,
  type ApiErrorCode,
  type ApiErrorResponse,
  type IssuedCoupon,
  type ListCouponsResponse,
} from '@im-coupon/contracts';

import { useMyCoupons } from './use-my-coupons';

const OWNER_A = 'cit-001';
const OWNER_B = 'cit-002';

/** 설계문서 7장 `coupons` 예시 레코드. 수치는 값 표의 시연 기본값이고 세 시각은 `Z` 다. */
const COUPON: IssuedCoupon = {
  id: 'cpn-9b1c6a2e-3f47-4a6b-8f0e-2d5c7e1a4b93',
  status: 'held',
  trigger: 'manual',
  ownerId: OWNER_A,
  ownerName: '김시민',
  merchantId: 'mer-001',
  merchantName: '달성책방',
  faceValue: 5000,
  benefitSplit: { ownerRatio: 0.2, consumerRatio: 0.8 },
  issuedAt: '2026-09-10T05:00:00.000Z',
  heldUntil: '2026-09-13T05:00:00.000Z',
  expiresAt: '2026-09-15T05:00:00.000Z',
};

function couponOf(overrides: Partial<IssuedCoupon>): IssuedCoupon {
  return { ...COUPON, ...overrides };
}

/**
 * 두 소유자의 쿠폰. 경쟁 상태 케이스가 "최종 상태의 주인이 누구인가"를 이 둘로 가르므로
 * 두 값이 서로 구별되어야 한다.
 */
const COUPON_A = couponOf({ id: 'cpn-a', ownerId: OWNER_A, ownerName: '김시민' });
const COUPON_B = couponOf({
  id: 'cpn-b',
  ownerId: OWNER_B,
  ownerName: '이시민',
  merchantId: 'mer-002',
  merchantName: '수성문구',
});

/**
 * `issuedAt` 이 내림차순이 **아닌** 두 건. 훅이 정렬을 더하면 이 순서가 뒤집혀 드러난다 —
 * 순서는 서버가 지는 계약이고(설계문서 8장) 화면이 다시 정하는 값이 아니다.
 */
const UNSORTED: IssuedCoupon[] = [
  couponOf({ id: 'cpn-old', issuedAt: '2026-09-01T05:00:00.000Z' }),
  couponOf({ id: 'cpn-new', issuedAt: '2026-09-20T05:00:00.000Z' }),
];

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

function listed(coupons: IssuedCoupon[]): Response {
  return jsonResponse(200, { coupons } satisfies ListCouponsResponse);
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 영영 응답하지 않는 `fetch`. 조회 중 상태를 붙잡아 두는 데 쓴다. */
function stubPendingFetch() {
  const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

interface Deferred {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
  reject: (reason: unknown) => void;
}

/**
 * 응답 하나를 손으로 흘릴 수 있게 붙잡아 둔다. 경쟁 상태 케이스는 도착 순서를 뒤집는
 * 것이 전부이므로, 순서를 타이머나 실행 순서가 아니라 이 `resolve` 호출이 정해야 한다.
 */
function deferred(): Deferred {
  let resolve!: (response: Response) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Response>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });

  return { promise, resolve, reject };
}

/**
 * 흘려 둔 응답이 만들 상태 갱신이 전부 끝나기를 기다린다. 매크로태스크 하나를 지나면 그
 * 앞에 쌓인 마이크로태스크가 전부 비므로 "더 올 갱신이 없다"가 성립한다 — 타이머가 순서를
 * 정하는 것이 아니라, 순서를 이미 정한 뒤 그 결과가 잦아들기를 기다리는 장벽이다.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderMyCoupons(ownerId: string | null) {
  return renderHook(({ owner }: { owner: string | null }) => useMyCoupons(owner), {
    initialProps: { owner: ownerId },
  });
}

/** 훅이 만든 URL. 계약 상수와 쿼리 키로 조립되었는지를 이 문자열로 본다. */
function urlOf(fetchMock: ReturnType<typeof stubFetch>, index: number): string {
  return String(fetchMock.mock.calls[index]?.[0]);
}

/** 소유자 id 를 값으로 실은 계약 URL. 인코딩까지 포함해 이 문자열 하나로 굳는다. */
function expectedUrl(ownerId: string): string {
  return `${COUPONS_PATH}?${new URLSearchParams({ [OWNER_ID_QUERY]: ownerId })}`;
}

/** 실패 상태에서만 오류를 꺼낸다 — 다른 상태였으면 그 사실이 실패 메시지에 남는다. */
function failureOf(state: ReturnType<typeof useMyCoupons>['state']) {
  if (state.status !== 'failed') {
    throw new Error(`실패 상태가 아니다: ${state.status}`);
  }
  return state.error;
}

/** 성공 상태에서만 목록을 꺼낸다 — 순서 단언이 상태 착오로 흐려지지 않게 한다. */
function couponsOf(state: ReturnType<typeof useMyCoupons>['state']) {
  if (state.status !== 'loaded') {
    throw new Error(`성공 상태가 아니다: ${state.status}`);
  }
  return state.coupons;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMyCoupons', () => {
  it('소유자가 선택되지 않았으면 조회하지 않는다', async () => {
    const fetchMock = stubFetch(listed([COUPON_A]));
    const { result } = renderMyCoupons(null);

    await settle();

    expect(result.current.state).toEqual({ status: 'unselected' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('조회가 끝나기 전에는 조회 중 상태다', () => {
    stubPendingFetch();
    const { result } = renderMyCoupons(OWNER_A);

    expect(result.current.state).toEqual({ status: 'loading' });
  });

  it('계약의 내 쿠폰 경로와 소유자 쿼리 키로 조회한다', async () => {
    const fetchMock = stubFetch(listed([COUPON_A]));
    const { result } = renderMyCoupons(OWNER_A);

    await waitFor(() => expect(result.current.state.status).toBe('loaded'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, query = ''] = urlOf(fetchMock, 0).split('?');
    expect(path).toBe(COUPONS_PATH);
    expect(new URLSearchParams(query).get(OWNER_ID_QUERY)).toBe(OWNER_A);
  });

  it('인코딩이 필요한 소유자 id 도 쿼리 값으로 인코딩해 싣는다', async () => {
    /* 접합으로 붙이면 공백은 그대로 남고 `&` 는 쿼리 구분자가 되어 값이 잘린다. */
    const awkwardIds = ['cit 001', 'cit&001'];

    for (const ownerId of awkwardIds) {
      const fetchMock = stubFetch(listed([]));
      const { result } = renderMyCoupons(ownerId);

      await waitFor(() => expect(result.current.state.status).toBe('loaded'));

      expect(urlOf(fetchMock, 0)).toBe(expectedUrl(ownerId));
      const query = urlOf(fetchMock, 0).split('?')[1] ?? '';
      expect(new URLSearchParams(query).get(OWNER_ID_QUERY)).toBe(ownerId);
      vi.unstubAllGlobals();
    }
  });

  it('응답이 오면 쿠폰 목록을 응답에 든 순서 그대로 실은 성공 상태가 된다', async () => {
    stubFetch(listed(UNSORTED));
    const { result } = renderMyCoupons(OWNER_A);

    await waitFor(() => expect(result.current.state.status).toBe('loaded'));

    /* `issuedAt` 내림차순은 서버가 지는 계약이다 — 훅이 다시 정렬하면 이 순서가 어긋난다. */
    expect(couponsOf(result.current.state)).toEqual(UNSORTED);
  });

  it('쿠폰이 한 건도 없어도 성공 상태다', async () => {
    stubFetch(listed([]));
    const { result } = renderMyCoupons(OWNER_A);

    await waitFor(() => expect(result.current.state).toEqual({ status: 'loaded', coupons: [] }));
  });

  it('성공 응답의 본문이 목록을 담고 있지 않으면 상태 번호를 남긴 실패가 된다', async () => {
    const bodies: unknown[] = [{}, { coupons: null }, { coupons: { 0: COUPON_A } }, '쿠폰 목록'];

    for (const body of bodies) {
      stubFetch(jsonResponse(200, body));
      const { result } = renderMyCoupons(OWNER_A);

      await waitFor(() => expect(result.current.state.status).toBe('failed'));

      const error = failureOf(result.current.state);
      expect(error.code).not.toBe('');
      expect(Object.keys(CONTRACT_CODES)).not.toContain(error.code);
      expect(error.message).toContain('200');
      vi.unstubAllGlobals();
    }
  });

  it('목록의 원소가 쿠폰 계약 모양이 아니면 목록 전체가 상태 번호를 남긴 실패가 된다', async () => {
    /* 쿠폰 카드(`CP-06-02`)가 읽는 필드를 하나씩 어긋뜨린다. */
    const broken: unknown[] = [
      { ...COUPON_A, status: 'consumed' },
      { ...COUPON_A, merchantName: 42 },
      { ...COUPON_A, faceValue: '5000' },
      { ...COUPON_A, benefitSplit: null },
      { ...COUPON_A, benefitSplit: { ownerRatio: 0.2 } },
      { ...COUPON_A, heldUntil: undefined },
      { ...COUPON_A, expiresAt: 0 },
    ];

    for (const element of broken) {
      stubFetch(jsonResponse(200, { coupons: [COUPON_A, element] }));
      const { result } = renderMyCoupons(OWNER_A);

      await waitFor(() => expect(result.current.state.status).toBe('failed'));

      const error = failureOf(result.current.state);
      expect(Object.keys(CONTRACT_CODES)).not.toContain(error.code);
      expect(error.message).toContain('200');
      vi.unstubAllGlobals();
    }
  });

  it('계약 오류 응답의 코드와 문구를 서버가 준 그대로 싣는다', async () => {
    const cases: { status: number; code: ApiErrorCode; message: string }[] = [
      { status: 400, code: 'MISSING_OWNER_ID', message: '소유자를 하나로 정할 수 없습니다' },
      { status: 404, code: 'UNKNOWN_OWNER', message: '알 수 없는 소유자입니다' },
      /* 서버가 일부러 가린 문구다 — 화면이 풀어 쓰거나 자기 문구로 갈아치우지 않는다. */
      { status: 500, code: 'STORAGE_FAILURE', message: '저장소를 읽지 못해 쿠폰 목록을 만들지 못했다' },
    ];

    for (const { status, code, message } of cases) {
      stubFetch(errorResponse(status, code, message));
      const { result } = renderMyCoupons(OWNER_A);

      await waitFor(() =>
        expect(result.current.state).toEqual({ status: 'failed', error: { code, message } }),
      );
      vi.unstubAllGlobals();
    }
  });

  it('실패 응답의 본문이 JSON 으로 읽히지 않으면 상태 번호를 남긴 실패가 된다', async () => {
    stubFetch(unparsableResponse(502));
    const { result } = renderMyCoupons(OWNER_A);

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
    const { result } = renderMyCoupons(OWNER_A);

    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    const error = failureOf(result.current.state);
    expect(error.code).not.toBe('');
    expect(error.message).not.toBe('');
    expect(Object.keys(CONTRACT_CODES)).not.toContain(error.code);
  });

  it('소유자가 바뀌면 새 소유자로 다시 조회한다', async () => {
    const fetchMock = stubFetch(listed([COUPON_A]), listed([COUPON_B]));
    const { result, rerender } = renderMyCoupons(OWNER_A);

    await waitFor(() => expect(result.current.state.status).toBe('loaded'));
    rerender({ owner: OWNER_B });
    await waitFor(() => expect(couponsOf(result.current.state)).toEqual([COUPON_B]));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlOf(fetchMock, 1)).toBe(expectedUrl(OWNER_B));
  });

  it('같은 소유자로 리렌더가 나도 다시 조회하지 않는다', async () => {
    const fetchMock = stubFetch(listed([COUPON_A]));
    const { result, rerender } = renderMyCoupons(OWNER_A);

    await waitFor(() => expect(result.current.state.status).toBe('loaded'));
    rerender({ owner: OWNER_A });
    rerender({ owner: OWNER_A });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(couponsOf(result.current.state)).toEqual([COUPON_A]);
  });

  it('소유자를 바꾸면 앞 소유자의 쿠폰이 남지 않고 조회 중으로 돌아간다', async () => {
    const pending = deferred();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(listed([COUPON_A]))
      .mockReturnValueOnce(pending.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderMyCoupons(OWNER_A);

    await waitFor(() => expect(result.current.state.status).toBe('loaded'));
    rerender({ owner: OWNER_B });
    await settle();

    /* 앞 소유자의 쿠폰을 새 선택 아래 그대로 두면 사용자가 그것을 자기 것으로 읽는다. */
    expect(result.current.state).toEqual({ status: 'loading' });
  });

  it('선택을 거두면 조회하지 않고 미선택으로 돌아간다', async () => {
    const fetchMock = stubFetch(listed([COUPON_A]));
    const { result, rerender } = renderMyCoupons(OWNER_A);

    await waitFor(() => expect(result.current.state.status).toBe('loaded'));
    rerender({ owner: null });
    await settle();

    expect(result.current.state).toEqual({ status: 'unselected' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('늦게 도착한 앞 소유자의 성공 응답이 뒤에 온 소유자의 쿠폰을 덮지 않는다', async () => {
    const first = deferred();
    const second = deferred();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderMyCoupons(OWNER_A);
    rerender({ owner: OWNER_B });

    /* 뒤에 온 소유자의 응답이 먼저, 앞 소유자의 응답이 나중에 도착한다. */
    second.resolve(listed([COUPON_B]));
    await settle();
    first.resolve(listed([COUPON_A]));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({ status: 'loaded', coupons: [COUPON_B] });
  });

  it('늦게 도착한 앞 소유자의 실패 응답이 뒤에 온 소유자의 성공을 덮지 않는다', async () => {
    const first = deferred();
    const second = deferred();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderMyCoupons(OWNER_A);
    rerender({ owner: OWNER_B });

    second.resolve(listed([COUPON_B]));
    await settle();
    first.resolve(errorResponse(404, 'UNKNOWN_OWNER', '알 수 없는 소유자입니다'));
    await settle();

    expect(result.current.state).toEqual({ status: 'loaded', coupons: [COUPON_B] });
  });

  it('늦게 도착한 앞 소유자의 네트워크 실패가 뒤에 온 소유자의 성공을 덮지 않는다', async () => {
    const first = deferred();
    const second = deferred();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderMyCoupons(OWNER_A);
    rerender({ owner: OWNER_B });

    second.resolve(listed([COUPON_B]));
    await settle();
    first.reject(new TypeError('Failed to fetch'));
    await settle();

    expect(result.current.state).toEqual({ status: 'loaded', coupons: [COUPON_B] });
  });
});
