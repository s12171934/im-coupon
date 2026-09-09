import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IssuedCoupon } from '@im-coupon/contracts';

import { CouponCard } from './CouponCard';

/** 설계문서 7장 `coupons` 예시 레코드. 수치는 값 표의 시연 기본값이고 세 시각은 `Z` 다. */
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

function renderCard(overrides: Partial<IssuedCoupon> = {}) {
  render(<CouponCard {...COUPON} {...overrides} />);
  return screen.getByRole('article', { name: overrides.merchantName ?? COUPON.merchantName });
}

/** 거래조건 고지 세 줄. 라벨 앞머리로 집어, 문구가 바뀌어도 어느 줄인지 잃지 않는다. */
function benefitSplitLine() {
  return screen.getByText(/^배분 비율/);
}

function heldUntilLine() {
  return screen.getByText(/^소유자 점유 기한/);
}

function expiresAtLine() {
  return screen.getByText(/^유효 소비 기한/);
}

function noticeLines() {
  return [benefitSplitLine(), heldUntilLine(), expiresAtLine()];
}

/** 고지가 견줄 본문 줄. "본문과 같은 글자 크기"의 기준을 액면 줄로 둔다 (설계문서 11장). */
function faceValueLine() {
  return screen.getByText(/^액면/);
}

/** 배분 비율 줄에서 두 퍼센트 수를 읽는다. 표기 방식을 모르고 결과만 본다. */
function shownPercents(): { owner: number; consumer: number } {
  const text = benefitSplitLine().textContent ?? '';
  const matched = /소유자 ([\d.]+)% \/ 소비자 ([\d.]+)%/.exec(text);
  expect(matched, `배분 비율 줄을 읽지 못했다: ${text}`).not.toBeNull();
  const [, owner = '', consumer = ''] = matched ?? [];

  return { owner: Number(owner), consumer: Number(consumer) };
}

/**
 * 배분 비율 경계값. `ownerRatio` 는 `0..1` 의 수이고 화면에는 퍼센트로 적는다 (설계문서 7장).
 * `곱셈오차` 는 `비율 * 100` 이 IEEE 754 에서 정확한 값을 내지 못하는 쌍을 표시한다 —
 * 그 쌍에서 오차가 화면에 새지 않는 것이 이 표의 요지다.
 */
const RATIO_CASES: { owner: number; consumer: number; shown: [string, string]; 곱셈오차: boolean }[] =
  [
    // 7장 값 표의 시연 기본값
    { owner: 0.2, consumer: 0.8, shown: ['20', '80'], 곱셈오차: false },
    // `0.07 * 100 === 7.000000000000001`
    { owner: 0.07, consumer: 0.93, shown: ['7', '93'], 곱셈오차: true },
    // `0.29 * 100 === 28.999999999999996` · `0.71 * 100 === 71.00000000000001` — 양쪽 다 어긋난다
    { owner: 0.29, consumer: 0.71, shown: ['29', '71'], 곱셈오차: true },
    // 정수로 반올림하면 `13% / 88%` 가 되어 합이 101% 가 된다
    { owner: 0.125, consumer: 0.875, shown: ['12.5', '87.5'], 곱셈오차: false },
    // 계약상 유효한 극단값 (`0..1`)
    { owner: 0, consumer: 1, shown: ['0', '100'], 곱셈오차: false },
    { owner: 1, consumer: 0, shown: ['100', '0'], 곱셈오차: false },
  ];

describe('CouponCard', () => {
  it('가맹점명을 카드 제목으로 두고 카드를 그 이름으로 집을 수 있다', () => {
    const card = renderCard();

    expect(card).toBeInTheDocument();
    // 헤딩 레벨은 층을 따른다 — 탭 셸 `h1` · 화면 조립 `h2` · 컴포넌트 `h3` 이하 (설계문서 10장)
    expect(screen.getByRole('heading', { name: '달성책방', level: 3 })).toBeInTheDocument();
  });

  it('상태 값을 상태 배지 문구로 옮겨 보여준다', () => {
    const card = renderCard();

    expect(card).toHaveTextContent('소유자 점유');
    expect(screen.getByText('소유자 점유')).toBeInTheDocument();
    // 레코드의 상태 값 자체는 화면에 내보이지 않는다
    expect(card.textContent).not.toContain('held');
  });

  it('액면을 와이어프레임의 문구로 보여준다', () => {
    renderCard();

    expect(faceValueLine()).toHaveTextContent('액면 5000원 페이백');
  });

  it('구분선 아래에 거래조건 소제목을 카드 제목보다 한 칸 아래 헤딩으로 둔다', () => {
    const card = renderCard();

    expect(card.querySelector('hr')).not.toBeNull();
    expect(screen.getByRole('heading', { name: '거래조건', level: 4 })).toBeInTheDocument();
  });

  it('거래조건 세 줄을 와이어프레임의 문구로 보여준다', () => {
    renderCard();

    expect(noticeLines().map((line) => line.textContent)).toEqual([
      '배분 비율 — 소유자 20% / 소비자 80%',
      '소유자 점유 기한 — 2026-09-13 14:00 KST 까지는 소유자만 사용',
      '유효 소비 기한 — 2026-09-15 14:00 KST 에 만료',
    ]);
  });

  it('거래조건 고지를 본문 단락으로 두고 본문과 같은 글자 크기로 보여준다', () => {
    renderCard();
    const bodyFontSize = getComputedStyle(faceValueLine()).fontSize;

    for (const line of noticeLines()) {
      // 본문 단락 — `p` 요소로 두고 액면 같은 다른 본문 줄과 같은 층에 둔다
      expect(line.tagName).toBe('P');
      expect(line.closest('small')).toBeNull();
      // 계산된 값으로 본다 — `small` 조상·인라인 글자 크기·낮춘 `opacity` 가 전부 여기 드러난다
      expect(getComputedStyle(line).fontSize).toBe(bodyFontSize);
      expect(getComputedStyle(line).opacity).toBe('1');
    }
  });

  it('카드 안 어느 요소도 축소 요소·축소 클래스·축소 인라인 스타일을 갖지 않는다', () => {
    const card = renderCard();

    // 이 저장소에는 CSS 프레임워크나 클래스 체계가 없다. 축소 클래스를 만들지 않는 것이
    // 고지를 지키는 방법이므로, 테스트는 그 부재를 카드 전체에 걸어 단언한다.
    for (const element of [card, ...card.querySelectorAll<HTMLElement>('*')]) {
      expect(element.getAttribute('class')).toBeNull();
      expect([
        element.style.fontSize,
        element.style.opacity,
        element.style.transform,
      ]).toEqual(['', '', '']);
    }
    expect(card.querySelectorAll('small')).toHaveLength(0);
  });

  it('거래조건을 각주로 처리하지 않는다', () => {
    const card = renderCard();

    // 별표·아래 첨자·접기 — 어느 것도 고지를 본문 밖으로 내보내는 처리다
    expect(card.querySelectorAll('sup, sub, details, summary')).toHaveLength(0);
    expect(card.textContent).not.toMatch(/[*†‡]|자세히|더 보기|더보기/);
  });

  for (const { owner, consumer, shown, 곱셈오차 } of RATIO_CASES) {
    it(`배분 비율 ${owner}/${consumer} 을 ${shown[0]}% / ${shown[1]}% 로 적는다`, () => {
      renderCard({ benefitSplit: { ownerRatio: owner, consumerRatio: consumer } });

      expect(benefitSplitLine()).toHaveTextContent(
        `배분 비율 — 소유자 ${shown[0]}% / 소비자 ${shown[1]}%`,
      );
      if (곱셈오차) {
        // `ratio * 100` 원시값을 그대로 적으면 이 단언이 깨진다
        expect(benefitSplitLine().textContent).not.toMatch(/\d\.\d{5}/);
      }
    });

    it(`배분 비율 ${owner}/${consumer} 의 두 퍼센트 합이 100 이다`, () => {
      renderCard({ benefitSplit: { ownerRatio: owner, consumerRatio: consumer } });

      // 7장이 두 비율의 합을 `1` 로 제약하므로 화면의 두 퍼센트 합도 100 이어야 한다.
      // 합이 어긋난 수를 보이는 고지는 그 자체가 의심받는다.
      const { owner: ownerPercent, consumer: consumerPercent } = shownPercents();
      expect(ownerPercent + consumerPercent).toBe(100);
    });
  }

  it('두 기한을 절대 시각 `YYYY-MM-DD HH:mm KST` 로 적고 ISO 표기를 화면에 남기지 않는다', () => {
    const card = renderCard();

    // 저장 값은 UTC(`Z`) 이고 표기는 고정 오프셋 +09:00 을 더한 KST 다 (설계문서 11장)
    expect(card).toHaveTextContent('2026-09-13 14:00 KST');
    expect(card).toHaveTextContent('2026-09-15 14:00 KST');
    // `2026-09-13T05:00:00.000Z` 를 그대로 두면 이 둘이 깨진다
    expect(card.textContent).not.toMatch(/\dT\d/);
    expect(card.textContent).not.toContain('Z');
  });

  it('시간대를 표기에 밝혀, 읽는 사람에게 변환을 넘기지 않는다', () => {
    const card = renderCard();

    // 시간대 자리가 없는 표기는 어느 시간대의 시각인지 화면에서 구분되지 않는다
    for (const line of [heldUntilLine(), expiresAtLine()]) {
      expect(line).toHaveTextContent(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} KST/);
    }
  });

  it('두 기한을 상대 표현으로 바꾸지 않는다', () => {
    const card = renderCard();

    expect(card.textContent).not.toMatch(/일 뒤|일 후|시간 뒤|곧 |남음|지남/);
  });

  it('+09:00 변환이 날짜를 넘길 때 날짜 자리까지 함께 넘긴다', () => {
    /*
      UTC 15:00 이후는 KST 로 다음 날이다. UTC 값을 그대로 적으면 날짜 자리가 하루 어긋나
      두 단언이 함께 깨진다 — 시각만 맞추고 날짜를 놓치는 구현을 가리는 자리다.
    */
    const card = renderCard({
      heldUntil: '2026-09-13T15:30:00.000Z',
      expiresAt: '2026-09-30T16:00:00.000Z',
    });

    expect(card).toHaveTextContent('소유자 점유 기한 — 2026-09-14 00:30 KST 까지는 소유자만 사용');
    // 월까지 넘어가는 값 — 시·분만 더하는 계산이면 `2026-09-31` 같은 없는 날짜가 나온다
    expect(card).toHaveTextContent('유효 소비 기한 — 2026-10-01 01:00 KST 에 만료');
  });

  it('+09:00 변환이 해를 넘길 때 연 자리까지 함께 넘긴다', () => {
    const card = renderCard({
      heldUntil: '2026-12-31T14:59:00.000Z',
      expiresAt: '2026-12-31T15:00:00.000Z',
    });

    expect(card).toHaveTextContent('2026-12-31 23:59 KST');
    expect(card).toHaveTextContent('2027-01-01 00:00 KST');
  });

  it('기한 표기가 실행 머신의 시간대에 따라 갈리지 않는다', () => {
    /*
      고정 오프셋 산술로만 변환하므로 표기는 실행 머신의 시간대와 무관하다. 로컬 시간대
      게터로 뽑으면 KST 로 맞춰 둔 머신에서만 우연히 같고 나머지 머신에서는 어긋난다 —
      자정을 넘기는 값이라 날짜 자리에서 먼저 드러난다. 그래서 테스트가 시간대를 갈아
      끼우지 않고 고정 기대값을 그대로 단언한다 (설계문서 12장의 재현성).
    */
    const card = renderCard({
      heldUntil: '2026-09-13T15:30:00.000Z',
      expiresAt: '2026-09-13T20:30:00.000Z',
    });

    expect(card).toHaveTextContent('2026-09-14 00:30 KST');
    expect(card).toHaveTextContent('2026-09-14 05:30 KST');
  });

  it('한 자리 월·일·시·분을 두 자리로 채워 적는다', () => {
    const card = renderCard({
      heldUntil: '2026-01-01T18:04:00.000Z',
      expiresAt: '2026-01-01T20:05:00.000Z',
    });

    expect(card).toHaveTextContent('2026-01-02 03:04 KST');
    expect(card).toHaveTextContent('2026-01-02 05:05 KST');
  });

  it('액면이 큰 정수여도 구분 기호 없이 레코드의 수를 그대로 적는다', () => {
    renderCard({ faceValue: 1234567 });

    // 같은 액면을 발급 결과 카드(`CP-05-04`)가 구분 기호 없이 그리므로 표기를 맞춘다
    expect(faceValueLine()).toHaveTextContent('액면 1234567원 페이백');
    expect(faceValueLine().textContent).not.toMatch(/1,234,567|1 234 567/);
  });

  it('와이어프레임에 없는 식별자와 발급 시각을 카드에 그리지 않는다', () => {
    const card = renderCard();

    for (const hidden of [
      COUPON.id,
      COUPON.ownerId,
      COUPON.merchantId,
      COUPON.trigger,
      COUPON.issuedAt,
      '2026-09-10',
    ]) {
      expect(card.textContent).not.toContain(hidden);
    }
  });
});
