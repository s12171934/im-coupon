import type { IssuedCoupon } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ConsumptionService } from '../../consumption/consumption.service';
import { DEFAULT_ISSUANCE_PARAMS } from '../../issuance/domain/params';
import { JsonCouponRepository } from './json-coupon.repository';
let dir: string;
let db: JsonFileDb;
let repository: JsonCouponRepository;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'issuance-migration-'));
  db = new JsonFileDb(dir);
  repository = new JsonCouponRepository(dir);
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
const consumed = { id: 'coupon-consumption', status: 'used', requiredSpendAmount: 10000, rewardAmount: 1000 };
function coupon(serial: string): IssuedCoupon {
  return {
    id: `cpn-${serial}`,
    status: 'held',
    trigger: 'manual',
    ownerId: 'cit-001',
    ownerName: '김시민',
    merchantId: 'mer-001',
    merchantName: '달성책방',
    faceValue: DEFAULT_ISSUANCE_PARAMS.faceValue,
    benefitSplit: DEFAULT_ISSUANCE_PARAMS.benefitSplit,
    issuedAt: '2026-09-10T14:00:00.000+09:00',
    heldUntil: '2026-09-13T14:00:00.000+09:00',
    expiresAt: '2026-09-15T14:00:00.000+09:00',
  };
}

it('기존 발급 쿠폰만 이동하고 소비 쿠폰과 포인트를 보존한다', async () => {
  await db.writeCollection('coupons', [consumed, coupon('1')]);
  await db.writeCollection('points', [{ id: 'point-1' }]);
  await repository.onModuleInit();
  expect(await db.readCollection('coupons')).toEqual([consumed]);
  expect(await db.readCollection('issued-coupons')).toEqual([coupon('1')]);
  expect(await db.readCollection('points')).toEqual([{ id: 'point-1' }]);
});
it('소비 초기화가 발급 쿠폰을 삭제하지 않는다', async () => {
  await repository.onModuleInit();
  await repository.append(coupon('1'));
  await new ConsumptionService(dir).reset();
  expect(await db.readCollection('issued-coupons')).toEqual([coupon('1')]);
});
it('중간에 재시작해도 중복 없이 이동 대상의 최신 값을 보존한다', async () => {
  const updated = { ...coupon('1'), faceValue: 9000 };
  await db.writeCollection('coupons', [consumed, coupon('1')]);
  await db.writeCollection('issued-coupons', [updated]);
  await repository.onModuleInit();
  await repository.onModuleInit();
  expect(await db.readCollection('coupons')).toEqual([consumed]);
  expect(await db.readCollection('issued-coupons')).toEqual([updated]);
});
