import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CITIZENS_PATH,
  COUPONS_PATH,
  OWNER_ID_QUERY,
  type ApiErrorCode,
  type ApiErrorResponse,
  type Citizen,
  type Coupon,
  type ListCitizensResponse,
  type ListCouponsResponse,
} from '@im-coupon/contracts';

import { MyCouponsPage } from './MyCouponsPage';

/** 설계문서 7장 `citizens` 예시 레코드. 소유자 선택이 로그인을 대신한다 (8장 시민 목록). */
const CITIZENS: Citizen[] = [
  { id: 'cit-001', name: '김시민' },
  { id: 'cit-002', name: '이시민' },
];

/**
 * 설계문서 7장 `coupons` 예시 레코드. 수치는 값 표의 시연 기본값이고 세 시각은 `Z` 다 —
 * `benefitSplit` 이 `0.2`/`0.8` 이라 카드에 `소유자 20% / 소비자 80%` 가 실제로 나온다.
 */
const COUPON: Coupon = {
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

/**
 * `Response` 를 흉내 낸다. 두 훅이 읽는 것은 `ok`·`status`·`json()` 셋뿐이다
 * (`issue-page.test.tsx` 가 같은 틀을 쓴다).
 */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function citizensResponse(citizens: Citizen[]): Response {
  const body: ListCitizensResponse = { citizens };
  return jsonResponse(200, body);
}

function couponsResponse(coupons: Coupon[]): Response {
  const body: ListCouponsResponse = { coupons };
  return jsonResponse(200, body);
}

function errorResponse(status: number, code: ApiErrorCode, message: string): Response {
  const body: ApiErrorResponse = { error: { code, message } };
  return jsonResponse(status, body);
}

function couponOf(overrides: Partial<Coupon>): Coupon {
  return { ...COUPON, ...overrides };
}

/** 화면에 그려진 쿠폰 카드를 그린 순서대로 가맹점명으로 읽는다 */
function shownMerchantNames(): (string | null)[] {
  return screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'));
}

/**
 * 경로별로 갈리는 `fetch` 스텁. 화면이 시민 목록과 쿠폰 목록 둘을 조회하므로 호출 순서가
 * 아니라 경로로 갈라야 한다. 경로는 계약 상수에서 가져온다 — 경로 문자열을 직접 박지 않는
 * 것이 이 워크스페이스의 규율이다 (설계문서 8장 경로 상수 표).
 */
function stubRoutes(routes: {
  citizens: () => Response | Promise<Response>;
  coupons: (ownerId: string) => Response | Promise<Response>;
}) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const path = String(input);
    if (path.startsWith(CITIZENS_PATH)) return routes.citizens();
    if (path.startsWith(COUPONS_PATH)) return routes.coupons(ownerIdOf(path));
    throw new Error(`스텁하지 않은 경로: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 내 쿠폰 조회 URL 에서 소유자 쿼리를 읽는다 (설계문서 8장 `OWNER_ID_QUERY`). */
function ownerIdOf(path: string): string {
  const query = path.slice(path.indexOf('?') + 1);
  return new URLSearchParams(query).get(OWNER_ID_QUERY) ?? '';
}

/** 소유자를 고르는 사용자 동작. 초기 상태가 미선택이라 이 동작을 지나야 쿠폰 조회가 나간다. */
async function selectOwner(user: ReturnType<typeof userEvent.setup>, ownerId: string) {
  await user.selectOptions(await screen.findByLabelText('소유자 선택'), ownerId);
}

/** 거래조건 고지 세 줄. 라벨 앞머리로 집어, 문구가 바뀌어도 어느 줄인지 잃지 않는다. */
function noticeLines(): HTMLElement[] {
  return [
    screen.getByText(/^배분 비율/),
    screen.getByText(/^소유자 점유 기한/),
    screen.getByText(/^유효 소비 기한/),
  ];
}

/**
 * 고지 줄에서 문서 뿌리까지 올라가며 글자를 줄이는 조상을 모은다.
 *
 * 컴포넌트 수준(`coupon-card.test.tsx`)이 카드 **안**에서 든 성질을 조립을 지나서도 다시
 * 보는 자리다. 조립이 카드를 축소 컨테이너에 넣으면 컴포넌트 테스트는 그대로 통과하고
 * 화면만 깨지므로, 여기서는 카드 밖 조상까지 훑어야 한다.
 */
function shrinkingAncestors(node: HTMLElement): string[] {
  const found: string[] = [];
  for (let element: HTMLElement | null = node; element !== null; element = element.parentElement) {
    if (['SMALL', 'SUP', 'SUB'].includes(element.tagName)) found.push(element.tagName);
    const className = element.getAttribute('class');
    if (className !== null) found.push(`class=${className}`);
    if (element.style.fontSize !== '') found.push(`font-size=${element.style.fontSize}`);
    if (element.style.opacity !== '') found.push(`opacity=${element.style.opacity}`);
    if (element.style.transform !== '') found.push(`transform=${element.style.transform}`);
  }
  return found;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MyCouponsPage', () => {
  it('TC-06-01 소유자를 고르면 카드에 액면·배분 비율·두 기한이 축소 없이 본문 단락으로 나타난다', async () => {
    stubRoutes({ citizens: () => citizensResponse(CITIZENS), coupons: () => couponsResponse([COUPON]) });
    const user = userEvent.setup();

    render(<MyCouponsPage />);
    await selectOwner(user, 'cit-001');

    const card = await screen.findByRole('article', { name: '달성책방' });
    expect(card).toHaveTextContent('액면 5000원 페이백');
    expect(noticeLines().map((line) => line.textContent)).toEqual([
      '배분 비율 — 소유자 20% / 소비자 80%',
      '소유자 점유 기한 — 2026-09-13 14:00 KST 까지는 소유자만 사용',
      '유효 소비 기한 — 2026-09-15 14:00 KST 에 만료',
    ]);

    /*
      "본문과 같은 글자 크기"의 기준을 문서 본문(`body`)으로 둔다. 카드 안의 다른 줄을
      기준으로 삼으면 조립이 카드 전체를 축소했을 때 기준과 고지가 함께 줄어 단언이 통과한다.
    */
    const bodyFontSize = getComputedStyle(document.body).fontSize;
    for (const line of noticeLines()) {
      expect(line.tagName).toBe('P');
      expect(line.closest('small')).toBeNull();
      expect(shrinkingAncestors(line)).toEqual([]);
      expect(getComputedStyle(line).fontSize).toBe(bodyFontSize);
      expect(getComputedStyle(line).opacity).toBe('1');
    }
  });

  it('TC-06-02 고른 소유자의 쿠폰이 없으면 발급된 쿠폰이 없습니다 만 보여준다', async () => {
    stubRoutes({ citizens: () => citizensResponse(CITIZENS), coupons: () => couponsResponse([]) });
    const user = userEvent.setup();

    render(<MyCouponsPage />);
    await selectOwner(user, 'cit-001');

    expect(await screen.findByText('발급된 쿠폰이 없습니다')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('화면 제목을 조립 층의 헤딩 레벨로 둔다', () => {
    stubRoutes({ citizens: () => citizensResponse(CITIZENS), coupons: () => couponsResponse([]) });

    render(<MyCouponsPage />);

    // 탭 셸 `h1` · 화면 조립 `h2` · 컴포넌트 `h3` 이하 (설계문서 10장)
    expect(screen.getByRole('heading', { name: '내 쿠폰 — 시민 시점', level: 2 })).toBeInTheDocument();
  });

  it('소유자를 고르기 전에는 쿠폰을 조회하지 않고 빈 상태 문구도 내지 않는다', async () => {
    const fetchMock = stubRoutes({
      citizens: () => citizensResponse(CITIZENS),
      coupons: () => couponsResponse([]),
    });

    render(<MyCouponsPage />);
    await screen.findByLabelText('소유자 선택');

    // 고르지 않은 것과 골랐는데 없는 것은 다른 사실이라 빈 상태 문구를 여기 쓰지 않는다
    expect(screen.queryByText('발급된 쿠폰이 없습니다')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    for (const [input] of fetchMock.mock.calls) {
      expect(String(input).startsWith(COUPONS_PATH)).toBe(false);
    }
  });

  it('시민 목록 조회가 실패하면 화면 전체를 막는다 — 소유자 선택과 쿠폰 목록 자리가 없다', async () => {
    const fetchMock = stubRoutes({
      citizens: () => errorResponse(500, 'STORAGE_FAILURE', '저장소를 읽지 못했습니다'),
      coupons: () => couponsResponse([COUPON]),
    });

    render(<MyCouponsPage />);

    expect(await screen.findByTestId('error-code')).toHaveTextContent('STORAGE_FAILURE');
    // 소유자를 고를 수 없으면 쿠폰 목록에 의미가 없다
    expect(screen.queryByLabelText('소유자 선택')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.queryByText('발급된 쿠폰이 없습니다')).not.toBeInTheDocument();
    for (const [input] of fetchMock.mock.calls) {
      expect(String(input).startsWith(COUPONS_PATH)).toBe(false);
    }
  });

  it('시민 목록이 실패한 화면에는 쿠폰 목록 오류가 나올 자리가 없다', async () => {
    stubRoutes({
      citizens: () => errorResponse(500, 'STORAGE_FAILURE', '저장소를 읽지 못했습니다'),
      coupons: () => errorResponse(500, 'STORAGE_FAILURE', '저장소를 읽지 못했습니다'),
    });

    render(<MyCouponsPage />);
    await screen.findByTestId('error-code');

    // 오류 둘을 겹쳐 보이지 않는다 — 쿠폰 조회가 아예 시작되지 않아 자리 자체가 생기지 않는다
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByTestId('error-code')).toHaveLength(1);
  });

  it('쿠폰 목록 조회가 실패하면 목록 자리에만 오류를 내고 소유자 선택은 그대로 둔다', async () => {
    stubRoutes({
      citizens: () => citizensResponse(CITIZENS),
      coupons: () => errorResponse(404, 'UNKNOWN_OWNER', '시민 목록에 없는 소유자입니다'),
    });
    const user = userEvent.setup();

    render(<MyCouponsPage />);
    await selectOwner(user, 'cit-001');

    expect(await screen.findByTestId('error-code')).toHaveTextContent('UNKNOWN_OWNER');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    // 소유자 선택은 살아 있고 조작할 수 있다 — 실패가 화면을 막는 것은 시민 목록 쪽뿐이다
    const select = screen.getByLabelText('소유자 선택');
    expect(select).toBeEnabled();
    expect(select).toHaveValue('cit-001');
    expect(screen.queryByText('발급된 쿠폰이 없습니다')).not.toBeInTheDocument();
  });

  it('쿠폰이 여러 건이면 카드를 그 수만큼 응답 순서 그대로 세로로 반복한다', async () => {
    /*
      `issuedAt` 이 내림차순이 **아닌** 세 건이다. 화면이 다시 정렬하면 이 순서가 뒤집혀
      드러난다 — 순서는 서버가 지는 계약이다 (설계문서 8장).
    */
    const coupons = [
      couponOf({ id: 'cpn-1', merchantName: '달성책방', issuedAt: '2026-09-01T05:00:00.000Z' }),
      couponOf({ id: 'cpn-2', merchantName: '수성문구', issuedAt: '2026-09-20T05:00:00.000Z' }),
      couponOf({ id: 'cpn-3', merchantName: '중구빵집', issuedAt: '2026-09-10T05:00:00.000Z' }),
    ];
    stubRoutes({ citizens: () => citizensResponse(CITIZENS), coupons: () => couponsResponse(coupons) });
    const user = userEvent.setup();

    render(<MyCouponsPage />);
    await selectOwner(user, 'cit-001');

    await screen.findByRole('article', { name: '달성책방' });
    expect(shownMerchantNames()).toEqual(['달성책방', '수성문구', '중구빵집']);
    expect(screen.queryByText('발급된 쿠폰이 없습니다')).not.toBeInTheDocument();
  });

  it('소유자를 바꾸면 새 소유자의 쿠폰으로 바뀌고 앞 소유자의 카드가 남지 않는다', async () => {
    const byOwner: Record<string, Coupon[]> = {
      'cit-001': [couponOf({ id: 'cpn-a', merchantName: '달성책방' })],
      'cit-002': [couponOf({ id: 'cpn-b', merchantName: '수성문구' })],
    };
    stubRoutes({
      citizens: () => citizensResponse(CITIZENS),
      coupons: (ownerId) => couponsResponse(byOwner[ownerId] ?? []),
    });
    const user = userEvent.setup();

    render(<MyCouponsPage />);
    await selectOwner(user, 'cit-001');
    await screen.findByRole('article', { name: '달성책방' });

    await selectOwner(user, 'cit-002');

    await screen.findByRole('article', { name: '수성문구' });
    expect(shownMerchantNames()).toEqual(['수성문구']);
  });

  it('조회하는 동안 진행 중임을 알린다', async () => {
    let releaseCoupons: (response: Response) => void = () => {};
    stubRoutes({
      citizens: () => citizensResponse(CITIZENS),
      // 붙들어 두는 응답. 조회 중 상태를 화면에서 관찰하려고 쓴다
      coupons: () =>
        new Promise<Response>((resolve) => {
          releaseCoupons = resolve;
        }),
    });
    const user = userEvent.setup();

    render(<MyCouponsPage />);
    await selectOwner(user, 'cit-001');

    expect(await screen.findByRole('status')).toHaveTextContent('쿠폰을 불러오는 중…');

    releaseCoupons(couponsResponse([COUPON]));

    await screen.findByRole('article', { name: '달성책방' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
