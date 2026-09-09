import type { IssuedCoupon } from '@im-coupon/contracts';

export interface CouponRepository {
  findByOwner(ownerId: string): Promise<IssuedCoupon[]>;
  append(coupon: IssuedCoupon): Promise<void>;
}

export const COUPON_REPOSITORY = Symbol('COUPON_REPOSITORY');
