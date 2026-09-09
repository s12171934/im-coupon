export type CouponStatus = 'owner_hold' | 'public' | 'reserved' | 'used' | 'expired';

export interface Coupon {
  id: string;
  issuerName: string;
  ownerName: string | null;
  reservedBy: string | null;
  merchantName: string;
  title: string;
  /** 결제해야 하는 금액. 페이백 권리 금액과 다른 값이다. */
  requiredSpendAmount: number;
  /** 결제 완료 뒤 배분되는 총 페이백 권리 금액이다. */
  rewardAmount: number;
  status: CouponStatus;
  issuedAt: string;
  usedAt: string | null;
  ownerExclusiveUntil: string;
  expiresAt: string;
  reservationExpiresAt: string | null;
}

export interface PointEntry {
  id: string;
  couponId: string;
  /** 수령자별 내역을 분리해 다른 사용자의 리워드를 화면에 노출하지 않는다. */
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

export interface IssueCouponRequest {
  ownerName: string;
  merchantName: string;
  requiredSpendAmount: number;
  rewardAmount: number;
}

export interface ReserveCouponRequest { consumerName: string; }
export interface ConsumeCouponRequest { consumerName: string; }

export interface ConsumptionActionResponse extends ConsumptionSnapshot {
  message: string;
}

export const CONSUMPTION_PATH = '/api/consumption' as const;
