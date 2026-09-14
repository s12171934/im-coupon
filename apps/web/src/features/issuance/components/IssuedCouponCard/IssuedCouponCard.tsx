import type { IssueCouponResponse } from '@im-coupon/contracts';

import { SIGNAL_KEYS, SIGNAL_LABELS } from '../../model/signal-labels';

/**
 * 발급 결과 카드의 props 는 발급 엔드포인트의 `201` 응답 그대로다 (설계문서 8장).
 * 응답을 펼쳐 넘기면 되고, 카드가 자기 모양을 따로 정의해 계약과 어긋날 자리가 없다.
 */
export type IssuedCouponCardProps = IssueCouponResponse;

/**
 * 방금 발급된 쿠폰 한 건을 와이어프레임의 세 줄로 보여준다 (설계문서 11장).
 * props 만 받아 그리는 UI 전용 컴포넌트다 — fetch·상태 로직을 갖지 않는다 (4장 결정 10).
 */
export function IssuedCouponCard({ coupon, decision }: IssuedCouponCardProps) {
  const scoreText = SIGNAL_KEYS.map(
    (key) => `${SIGNAL_LABELS[key]} 점수 ${decision.scores[key]}`,
  ).join(' · ');

  return (
    <section aria-label="방금 발급된 쿠폰">
      <h2>방금 발급된 쿠폰</h2>
      <p>
        가맹점 <strong data-testid="issued-merchant-name">{coupon.merchantName}</strong> · 소유자{' '}
        <strong data-testid="issued-owner-name">{coupon.ownerName}</strong>
      </p>
      <p>{`액면 ${coupon.faceValue}원 · ${scoreText} · 발급 후보 ${decision.candidateCount}건`}</p>
      <p>가중 합산 점수: {decision.total}</p>
      {decision.personalFit && <p>{decision.personalFit.enabled
        ? '행동 이력 개인화 점수가 계산됐습니다.'
        : `개인화 점수는 0으로 처리됐습니다: ${personalFitReason(decision.personalFit.reason)}`}</p>}
      {/*
        두 기한은 응답의 ISO 8601 문자열을 그대로 보여준다. 세 시각을 UTC(`Z`)로 굳혀
        화면·테스트가 계산 없이 판정하게 한 결정(설계문서 7장)이 이 형태이고, 사람이 읽는
        날짜 표기를 정하는 것은 거래조건 고지를 지는 쿠폰 카드(`CP-06-02`)의 몫이다.
        여기서 먼저 형식을 고르면 두 화면의 표기가 갈린다.
      */}
      <p>{`소유자 점유 기한 ${coupon.heldUntil} · 유효 소비 기한 ${coupon.expiresAt}`}</p>
    </section>
  );
}

function personalFitReason(reason: string | null): string {
  const reasons: Record<string, string> = {
    NO_HISTORY: '계산에 사용할 행동 이력이 없습니다.',
    INVALID_HISTORY: '행동 이력에 오류나 충돌이 있습니다.',
    MISSING_VECTOR: '필요한 가맹점 벡터가 없습니다.',
    INVALID_VECTOR: '가맹점 벡터의 형식이 맞지 않습니다.',
    INVALID_PROFILE: '행동 이력으로 선호를 계산할 수 없습니다.',
  };
  return reasons[reason ?? ''] ?? '개인화 입력을 확인해 주세요.';
}
