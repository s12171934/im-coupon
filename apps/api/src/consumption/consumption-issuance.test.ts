import type { IssuedCoupon } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConsumptionService } from './consumption.service';

let dir: string;
let db: JsonFileDb;
let service: ConsumptionService;
let issued: IssuedCoupon;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'consumption-issuance-'));
  db = new JsonFileDb(dir);
  service = new ConsumptionService(dir);
  issued = {
    id: 'cpn-linked', status: 'held', trigger: 'manual',
    ownerId: 'cit-1', ownerName: '소유자', merchantId: 'mer-1', merchantName: '가맹점',
    faceValue: 6000, benefitSplit: { ownerRatio: 0.3, consumerRatio: 0.7 },
    issuedAt: new Date().toISOString(),
    heldUntil: new Date(Date.now() + 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 172800000).toISOString(),
  };
  await db.writeCollection('issued-coupons', [issued]);
  await db.writeCollection('citizens', [{ id: 'cit-1', name: '소유자' }, { id: 'cit-2', name: '참여자' }, { id: 'cit-3', name: '소유자' }]);
});

afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await rm(dir, { recursive: true, force: true }); });

it('발급된 쿠폰을 같은 ID와 발급 조건으로 한 번만 가져온다', async () => {
  await service.snapshot();
  const result = await service.snapshot();
  expect(result.coupons).toHaveLength(1);
  expect(result.coupons[0]).toMatchObject({
    id: issued.id, status: 'held', ownerName: issued.ownerName,
    merchantName: issued.merchantName, faceValue: issued.faceValue,
    benefitSplit: issued.benefitSplit, heldUntil: issued.heldUntil,
    expiresAt: issued.expiresAt,
  });
});

it('소비 상태를 재조회에도 보존하고 발급 당시 비율로 혜택을 배분한다', async () => {
  await service.snapshot();
  await service.simulateOwnerExpiry(issued.id);
  await service.reserve(issued.id, 'cit-2');
  await service.consume(issued.id, 'cit-2');
  const result = await service.snapshot();
  expect(result.coupons[0]?.status).toBe('used');
  expect(result.paybackAmount).toBe(4200);
  expect(result.ownerRewardAmount).toBe(1800);
  expect(result.pointEntries).toHaveLength(2);
});

it('동시에 도착한 소비 요청은 같은 쿠폰의 혜택을 두 번 지급하지 않는다', async () => {
  await service.snapshot();
  const results = await Promise.allSettled([
    service.consume(issued.id, issued.ownerId),
    service.consume(issued.id, issued.ownerId),
    service.snapshot(),
  ]);
  expect(results[0]?.status).toBe('fulfilled');
  expect(results[1]?.status).toBe('rejected');
  expect((await service.snapshot()).pointEntries).toHaveLength(1);
});

it('초기화한 쿠폰은 다시 가져오지 않고 이후 새로 발급한 쿠폰만 가져온다', async () => {
  await service.snapshot();
  expect((await service.reset()).coupons).toEqual([]);
  expect((await new ConsumptionService(dir).snapshot()).coupons).toEqual([]);
  expect(await db.readCollection('issued-coupons')).toEqual([issued]);
  await db.writeCollection('issued-coupons', [issued, { ...issued, id: 'cpn-new' }]);
  expect((await service.snapshot()).coupons.map((coupon) => coupon.id)).toEqual(['cpn-new']);
});


it('동명이인이라도 소유자 ID가 다르면 전용 쿠폰을 사용할 수 없다', async () => {
  await expect(service.consume(issued.id, 'cit-3')).rejects.toThrow('사용 권한');
  await service.consume(issued.id, issued.ownerId);
  const result = await service.snapshot();
  expect(result.paybackAmount).toBe(issued.faceValue);
  expect(result.ownerRewardAmount).toBe(0);
  expect(result.pointEntries[0]?.recipientId).toBe(issued.ownerId);
});

it('소유자 기한과 전체 기한의 경계에서 자동 전환하고 만료 시 점유도 해제한다', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(issued.heldUntil));
  expect((await service.snapshot()).coupons[0]?.status).toBe('public');
  issued.expiresAt = new Date(Date.now() + 3600000).toISOString();
  await db.writeCollection('issued-coupons', [issued]);
  const reserved = await service.reserve(issued.id, 'cit-2');
  expect(reserved.coupons[0]?.reservationExpiresAt).toBe(issued.expiresAt);
  vi.setSystemTime(new Date(issued.expiresAt));
  const expired = await service.snapshot();
  expect(expired.coupons[0]?.status).toBe('expired');
  expect(expired.coupons[0]?.reservedById).toBeNull();
  await expect(service.consume(issued.id, 'cit-2')).rejects.toThrow('만료');
  expect((await service.snapshot()).pointEntries).toEqual([]);
});

it('한 시민의 점유는 한 장으로 제한하고 기한이 지나면 다른 쿠폰을 점유할 수 있다', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(issued.heldUntil));
  await db.writeCollection('issued-coupons', [issued, { ...issued, id: 'cpn-other' }]);
  await service.reserve(issued.id, 'cit-2');
  await expect(service.reserve('cpn-other', 'cit-2')).rejects.toThrow('한 장');
  vi.setSystemTime(new Date(Date.now() + 3 * 3600000));
  expect((await service.snapshot()).coupons[0]?.status).toBe('public');
  await expect(service.reserve('cpn-other', 'cit-2')).resolves.toBeDefined();
});

it('반올림이 필요한 액면도 혜택 총합이 발급 액면과 일치한다', async () => {
  issued.faceValue = 5001;
  issued.benefitSplit = { ownerRatio: 0.5, consumerRatio: 0.5 };
  await db.writeCollection('issued-coupons', [issued]);
  await service.simulateOwnerExpiry(issued.id);
  await service.reserve(issued.id, 'cit-2');
  const result = await service.consume(issued.id, 'cit-2');
  expect(result.paybackAmount).toBe(2501);
  expect(result.ownerRewardAmount).toBe(2500);
});

it('사용 기록 저장에 실패하면 혜택도 저장되지 않고 재시도 시 한 번만 지급된다', async () => {
  await service.snapshot();
  const write = vi.spyOn(JsonFileDb.prototype, 'writeCollection').mockRejectedValueOnce(new Error('disk full'));
  await expect(service.consume(issued.id, issued.ownerId)).rejects.toThrow('disk full');
  write.mockRestore();
  expect((await service.snapshot()).coupons[0]?.status).toBe('held');
  expect((await service.snapshot()).pointEntries).toEqual([]);
  const result = await service.consume(issued.id, issued.ownerId);
  expect(result.pointEntries).toHaveLength(1);
});

it('기존 연결 쿠폰의 사용 상태를 보존하고 발급되지 않은 시연 쿠폰은 노출하지 않는다', async () => {
  await db.writeCollection('coupons', [
    { id: issued.id, status: 'used', usedAt: issued.issuedAt, ownerExclusiveUntil: issued.heldUntil },
    { id: 'legacy-demo', status: 'owner_hold' },
  ]);
  const result = await service.snapshot();
  expect(result.coupons).toHaveLength(1);
  expect(result.coupons[0]?.status).toBe('used');
  await expect(service.consume(issued.id, issued.ownerId)).rejects.toThrow('사용 권한');
  expect(await db.readCollection('issued-coupons')).toEqual([issued]);
});


it('기존 지급 내역만 저장된 경우에도 같은 쿠폰을 다시 지급하지 않는다', async () => {
  await db.writeCollection('points', [{
    id: 'old-payback', couponId: issued.id, recipientName: '참여자',
    amount: 4200, kind: 'consumer-payback', earnedAt: issued.issuedAt,
  }]);
  const result = await service.snapshot();
  expect(result.coupons[0]?.status).toBe('used');
  await expect(service.consume(issued.id, issued.ownerId)).rejects.toThrow('사용 권한');
  expect(result.pointEntries[0]?.recipientId).toBe('cit-2');
});
