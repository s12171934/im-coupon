import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ISSUE_COUPON_PATH,
  type ApiErrorCode,
  type ApiErrorResponse,
  type IssuedCoupon,
  type HealthResponse,
  type IssueCouponResponse,
} from '@im-coupon/contracts';

import type { StorageStatusState } from '../../features/storage/components/StorageStatus/StorageStatus';
import { IssuePage } from './IssuePage';

/** 설계문서 7장 `coupons` 예시 레코드. 화면은 응답을 해석하지 않고 카드에 넘기기만 한다. */
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

const HEALTH: HealthResponse = {
  status: 'ok',
  storage: { readable: true, schemaVersion: 2, collections: ['coupons'] },
};

const LOADED_STORAGE: StorageStatusState = { kind: 'loaded', health: HEALTH };

/**
 * `Response` 를 흉내 낸다. 발급 호출 훅이 읽는 것은 `ok`·`status`·`json()` 셋뿐이다
 * (`use-issue-coupon.test.ts` 가 같은 틀을 쓴다).
 */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
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

/** 응답을 붙들어 두는 스텁. 발급 중 상태를 화면에서 관찰하려고 쓴다. */
function stubPendingFetch() {
  let release: (response: Response) => void = () => {};
  const fetchMock = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, release: (response: Response) => release(response) };
}

function issueButton(): HTMLElement {
  return screen.getByRole('button', { name: '발급 1건 실행' });
}

function bodyOf(fetchMock: ReturnType<typeof stubFetch>, index = 0): string {
  const call = fetchMock.mock.calls[index];
  if (call === undefined) throw new Error(`${index + 1}번째 요청이 나가지 않았다`);
  return String((call[1] as RequestInit).body);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('IssuePage', () => {
  it('TC-05-01 발급 1건 실행을 누르면 발급을 한 번 호출하고 결과 카드에 가맹점명·소유자명이 나타난다', async () => {
    const fetchMock = stubFetch(jsonResponse(201, ISSUED));
    const user = userEvent.setup();

    render(<IssuePage storage={LOADED_STORAGE} />);
    await user.click(issueButton());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(ISSUE_COUPON_PATH);
    expect(init.method).toBe('POST');

    expect(await screen.findByTestId('issued-merchant-name')).toHaveTextContent('달성책방');
    expect(screen.getByTestId('issued-owner-name')).toHaveTextContent('김시민');
  });

  it('TC-05-02 오류 응답이 오면 오류 영역에 코드와 메시지를 보여준다', async () => {
    stubFetch(errorResponse(422, 'NO_CANDIDATES', '발급 후보가 없어 발급하지 못했다'));
    const user = userEvent.setup();

    render(<IssuePage storage={LOADED_STORAGE} />);
    await user.click(issueButton());

    expect(await screen.findByTestId('error-code')).toHaveTextContent('NO_CANDIDATES');
    expect(screen.getByTestId('error-message')).toHaveTextContent(
      '발급 후보가 없어 발급하지 못했다',
    );
    expect(screen.queryByTestId('issued-merchant-name')).not.toBeInTheDocument();
  });

  it('저장소 상태는 받은 props 를 그대로 보여주고 화면이 다시 조회하지 않는다', () => {
    const fetchMock = stubFetch();

    render(<IssuePage storage={LOADED_STORAGE} />);

    expect(screen.getByText('정상')).toBeInTheDocument();
    expect(screen.getByText('스키마 2판 · 컬렉션 1개')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('발급하는 동안 진행 중임을 보여주고 버튼과 가중치 입력을 잠근다', async () => {
    const { release } = stubPendingFetch();
    const user = userEvent.setup();

    render(<IssuePage storage={LOADED_STORAGE} />);
    await user.click(issueButton());

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(issueButton()).toBeDisabled();
    expect(screen.getByLabelText('랜덤 신호')).toBeDisabled();

    release(jsonResponse(201, ISSUED));

    await waitFor(() => expect(issueButton()).toBeEnabled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('랜덤 신호')).toBeEnabled();
  });

  it('발급 중에 버튼을 연타해도 요청이 하나만 나간다', async () => {
    const { fetchMock, release } = stubPendingFetch();
    const user = userEvent.setup();

    render(<IssuePage storage={LOADED_STORAGE} />);
    await user.click(issueButton());
    await user.click(issueButton());
    await user.click(issueButton());

    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(jsonResponse(201, ISSUED));
    await screen.findByTestId('issued-merchant-name');
  });

  it('성공한 뒤 실패하면 결과 카드가 사라지고 오류만 남는다', async () => {
    stubFetch(
      jsonResponse(201, ISSUED),
      errorResponse(400, 'INVALID_WEIGHTS', '가중치 합이 0 이다'),
    );
    const user = userEvent.setup();

    render(<IssuePage storage={LOADED_STORAGE} />);
    await user.click(issueButton());
    await screen.findByTestId('issued-merchant-name');

    await user.click(issueButton());

    expect(await screen.findByTestId('error-code')).toHaveTextContent('INVALID_WEIGHTS');
    expect(screen.queryByTestId('issued-merchant-name')).not.toBeInTheDocument();
  });

  it('실패한 뒤 성공하면 오류가 사라지고 결과 카드만 남는다', async () => {
    stubFetch(
      errorResponse(422, 'NO_CANDIDATES', '발급 후보가 없어 발급하지 못했다'),
      jsonResponse(201, ISSUED),
    );
    const user = userEvent.setup();

    render(<IssuePage storage={LOADED_STORAGE} />);
    await user.click(issueButton());
    await screen.findByTestId('error-code');

    await user.click(issueButton());

    expect(await screen.findByTestId('issued-merchant-name')).toHaveTextContent('달성책방');
    expect(screen.queryByTestId('error-code')).not.toBeInTheDocument();
  });

  it('가중치를 비운 채 실행하면 본문이 빈 가중치다 — 서버가 기본값으로 채운다', async () => {
    const fetchMock = stubFetch(jsonResponse(201, ISSUED));
    const user = userEvent.setup();

    render(<IssuePage storage={LOADED_STORAGE} />);
    await user.click(issueButton());

    expect(bodyOf(fetchMock)).toBe('{"weights":{}}');
  });

  it('입력한 가중치 원문이 그대로 요청 본문에 실린다', async () => {
    const fetchMock = stubFetch(jsonResponse(201, ISSUED));
    const user = userEvent.setup();

    render(<IssuePage storage={LOADED_STORAGE} />);
    await user.type(screen.getByLabelText('랜덤 신호'), '2');
    await user.click(issueButton());

    expect(bodyOf(fetchMock)).toBe('{"weights":{"random":2}}');
  });
});
