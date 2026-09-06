import type { Coupon } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { IssuanceError } from '../issuance/engine';
import { DEFAULT_ISSUANCE_PARAMS } from '../issuance/params';
import { CouponRepository } from './coupon.repository';

let dataDir: string;

/**
 * 컬렉션의 실제 파일 상태를 리포지터리를 거치지 않고 본다. 리포지터리가 자기 말로
 * 자기를 증명하지 않게 하려는 것이다 — 저장이 됐는지는 파일이 답한다.
 */
function storedCoupons(): Promise<Coupon[]> {
  return new JsonFileDb(dataDir).readCollection<Coupon>('coupons');
}

/** 발급 유스케이스가 만들어 넘길 완성된 쿠폰. 액면·배분 비율은 발급 파라미터에서 끌어다 쓴다. */
function coupon(serial: string): Coupon {
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

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'im-coupon-api-'));
});

describe('CouponRepository', () => {
  it('컬렉션 파일이 없던 상태에서 쿠폰 1건을 저장하면 0건이 1건이 된다', async () => {
    const repository = new CouponRepository(dataDir);
    expect(await storedCoupons()).toHaveLength(0);

    await repository.append(coupon('0001'));

    expect(await storedCoupons()).toEqual([coupon('0001')]);
  });

  it('이미 레코드가 든 컬렉션에는 기존 행을 남긴 채 뒤에 이어 붙인다', async () => {
    // 재기동 뒤 앞 프로세스가 써 둔 파일에 새 인스턴스가 이어 쓰는 경로다.
    await writeFile(join(dataDir, 'coupons.json'), JSON.stringify([coupon('0001')]), 'utf8');

    await new CouponRepository(dataDir).append(coupon('0002'));

    expect(await storedCoupons()).toEqual([coupon('0001'), coupon('0002')]);
  });
});

describe('CouponRepository 의 동시 저장', () => {
  it('저장 여러 건이 겹쳐도 유실이 없다', async () => {
    const repository = new CouponRepository(dataDir);
    const coupons = ['0001', '0002', '0003', '0004', '0005'].map(coupon);

    await Promise.all(coupons.map((each) => repository.append(each)));

    const stored = await storedCoupons();
    expect(stored.map((each) => each.id).sort()).toEqual(coupons.map((each) => each.id));
  });
});

describe('CouponRepository 의 저장 실패', () => {
  it('컬렉션을 읽지 못하면 `STORAGE_FAILURE` 를 든 `IssuanceError` 로 올린다', async () => {
    await writeFile(join(dataDir, 'coupons.json'), '{ 깨진 JSON', 'utf8');
    const repository = new CouponRepository(dataDir);

    const call = repository.append(coupon('0001'));

    await expect(call).rejects.toThrowError(IssuanceError);
    await expect(call).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
  });

  /**
   * 유효한 JSON 이되 배열이 아닌 파일이다. 손으로 고친 파일에서 나올 수 있는 형태이고,
   * 객체는 퍼뜨릴 때 터지지만 문자열은 글자로 쪼개져 조용히 컬렉션을 오염시킨다.
   */
  it.each(['null', '{}', '42', '"abc"'])(
    '컬렉션이 배열이 아니면(%s) `STORAGE_FAILURE` 를 든 `IssuanceError` 로 올린다',
    async (content) => {
      await writeFile(join(dataDir, 'coupons.json'), content, 'utf8');
      const repository = new CouponRepository(dataDir);

      const call = repository.append(coupon('0001'));

      await expect(call).rejects.toThrowError(IssuanceError);
      await expect(call).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
    },
  );

  /**
   * root 는 디렉터리의 쓰기 권한 비트를 무시하므로 이 케이스만 실행 사용자를 가린다.
   * 쓰기 실패를 권한 말고 다른 방법으로 만들려면 `JsonFileDb` 의 임시 파일 명명 같은
   * 사적 사정에 기대야 해서, 판정 대신 건너뛰기를 택했다. 읽기 쪽 `STORAGE_FAILURE` 는
   * 깨진 JSON·배열 아님으로 실행 사용자와 무관하게 검증된다.
   */
  it.skipIf(process.getuid?.() === 0)(
    '컬렉션을 쓰지 못하면 `STORAGE_FAILURE` 를 든 `IssuanceError` 로 올린다',
    async () => {
      // 읽기는 되고 쓰기만 막힌 상태를 만든다 — 없는 컬렉션은 빈 배열로 읽히므로 읽기는 지나간다.
      await chmod(dataDir, 0o555);
      const repository = new CouponRepository(dataDir);

      const call = repository.append(coupon('0001'));

      await expect(call).rejects.toThrowError(IssuanceError);
      await expect(call).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
    },
  );

  it('앞선 저장이 거부된 뒤에도 같은 리포지터리의 다음 저장은 성공한다', async () => {
    // 실패한 저장이 큐 꼬리에 남으면 뒤따르는 무관한 저장까지 옛 오류로 줄줄이 거부된다 —
    // 시연 중 저장이 한 번 막혔다 풀려도 재기동 전까지 발급이 전부 실패하는 회귀다.
    // 막는 수단으로 권한이 아니라 깨진 파일을 쓴다 — 꼬리 복구는 실패 원인과 무관한 동작이고,
    // 이쪽은 root 로 돌려도 같은 것을 검증한다.
    const collection = join(dataDir, 'coupons.json');
    const repository = new CouponRepository(dataDir);
    await writeFile(collection, '{ 깨진 JSON', 'utf8');
    await expect(repository.append(coupon('0001'))).rejects.toMatchObject({
      code: 'STORAGE_FAILURE',
    });

    await rm(collection);
    await repository.append(coupon('0002'));

    expect(await storedCoupons()).toEqual([coupon('0002')]);
  });
});
