import type { Coupon } from '@im-coupon/contracts';

export interface CouponRepository {
  findByOwner(ownerId: string): Promise<Coupon[]>;
  append(coupon: Coupon): Promise<void>;
}

export const COUPON_REPOSITORY = Symbol('COUPON_REPOSITORY');
