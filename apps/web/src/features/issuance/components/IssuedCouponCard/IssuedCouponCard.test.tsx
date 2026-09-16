import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IssuedCoupon, IssueDecision, SignalWeights } from '@im-coupon/contracts';

import { IssuedCouponCard } from './IssuedCouponCard';

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

/**
 * 점수는 RNG 가 내는 값이라 7장 값 표에 기본값이 없다. 가중치 기본값 `1` 과 겹치지 않는
 * 값을 골라, 카드가 `decision` 을 실제로 읽는지 고정값을 그리는지 가른다.
 */
const DECISION: IssueDecision = {
  candidateCount: 25,
  scores: { random: 0.42 },
  total: 0.42,
};

/** 신호가 늘면 이 표가 컴파일 오류를 내, 테스트도 새 신호를 함께 보게 된다. */
const EXPECTED_SIGNAL_LINES: Record<keyof SignalWeights, string> = {
  random: '랜덤 신호 점수 0.42',
};

function renderCard() {
  render(<IssuedCouponCard coupon={COUPON} decision={DECISION} />);
  return screen.getByRole('region', { name: '방금 발급된 쿠폰' });
}

describe('IssuedCouponCard', () => {
  it('발급 결과 카드를 접근 가능한 이름으로 집을 수 있다', () => {
    expect(renderCard()).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '방금 발급된 쿠폰' })).toBeInTheDocument();
  });

  it('첫 줄에 가맹점명과 소유자명을 텍스트로 보여준다', () => {
    const card = renderCard();

    expect(screen.getByText('달성책방')).toBeInTheDocument();
    expect(screen.getByText('김시민')).toBeInTheDocument();
    expect(card).toHaveTextContent('가맹점 달성책방 · 소유자 김시민');
  });

  it('둘째 줄에 액면·신호별 점수·발급 후보 수를 보여준다', () => {
    const card = renderCard();

    expect(card).toHaveTextContent('액면 5000원');
    for (const line of Object.values(EXPECTED_SIGNAL_LINES)) {
      expect(card).toHaveTextContent(line);
    }
    expect(card).toHaveTextContent('발급 후보 25건');
  });

  it('점수를 계약의 신호 키 집합대로 빠짐없이 보여준다', () => {
    const card = renderCard();

    for (const key of Object.keys(DECISION.scores) as (keyof SignalWeights)[]) {
      expect(card).toHaveTextContent(String(DECISION.scores[key]));
    }
  });

  it('셋째 줄에 두 기한을 응답의 ISO 8601 문자열 그대로 보여준다', () => {
    const card = renderCard();

    expect(card).toHaveTextContent('소유자 점유 기한 2026-09-13T05:00:00.000Z');
    expect(card).toHaveTextContent('유효 소비 기한 2026-09-15T05:00:00.000Z');
  });

  it('기한을 사람이 읽는 날짜로 바꾸지 않는다', () => {
    const card = renderCard();

    // 표기를 정하는 것은 거래조건 고지를 지는 쿠폰 카드(`CP-06-02`)의 몫이다.
    expect(card.textContent).not.toMatch(/\d{4}년|\d{1,2}월|오전|오후|AM|PM/);
  });
});
