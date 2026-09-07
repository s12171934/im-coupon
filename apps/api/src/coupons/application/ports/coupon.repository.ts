import type { Coupon } from '@im-coupon/contracts';

export interface CouponRepository {
  append(coupon: Coupon): Promise<void>;
}

export const COUPON_REPOSITORY = Symbol('COUPON_REPOSITORY');
