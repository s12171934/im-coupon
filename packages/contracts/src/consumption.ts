import type { IssuedCoupon } from './coupon';

export type CouponStatus = 'held' | 'public' | 'reserved' | 'used' | 'expired';

/** 발급 당시 조건을 그대로 사용하고, 소비 시점의 상태만 더한다. */
export interface Coupon extends Omit<IssuedCoupon, 'status'> {
  status: CouponStatus;
  reservedById: string | null;
  reservationExpiresAt: string | null;
  usedAt: string | null;
  /** 시연에서만 소유자 기한 경과를 표현한다. 발급 당시 heldUntil은 보존한다. */
  ownerReleasedAt: string | null;
}

export interface PointEntry {
  id: string;
  couponId: string;
  recipientId: string;
  recipientName: string;
  amount: number;
  kind: 'consumer-payback' | 'owner-reward';
  earnedAt: string;
}

export interface ConsumptionSnapshot {
  coupons: Coupon[];
  paybackAmount: number;
  ownerRewardAmount: number;
  pointEntries: PointEntry[];
}

export interface ReserveCouponRequest { consumerId: string; }
export interface ConsumeCouponRequest { consumerId: string; }

export interface ConsumptionActionResponse extends ConsumptionSnapshot {
  message: string;
}

/** 원 단위 반올림 차액은 소유자에게 배분해 총액이 액면과 일치하게 한다. */
export function couponBenefits(
  coupon: Pick<IssuedCoupon, 'faceValue' | 'benefitSplit' | 'ownerId'>,
  consumerId: string,
): { consumerAmount: number; ownerAmount: number } {
  const consumerAmount = coupon.ownerId === consumerId
    ? coupon.faceValue
    : Math.round(coupon.faceValue * coupon.benefitSplit.consumerRatio);
  return { consumerAmount, ownerAmount: coupon.faceValue - consumerAmount };
}

export const CONSUMPTION_PATH = '/api/consumption' as const;
