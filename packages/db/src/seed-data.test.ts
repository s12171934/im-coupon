import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Citizen, Merchant } from '@im-coupon/contracts';

import { JsonFileDb } from './json-file-db';

/**
 * 커밋된 시드를 검증한다. 임시 디렉터리가 아니라 저장소의 `data/seed` 자체가 대상이다.
 *
 * 이 테스트가 쓰는 `readCollection`·`checkHealth` 는 `readFile`·`readdir` 만 부른다.
 * `JsonFileDb` 에서 파일시스템에 쓰는 것은 `writeCollection` 과 `bootstrapFromSeed` 뿐이고
 * 둘 다 여기서 부르지 않으므로, 이 테스트는 작업 트리의 시드를 건드리지 않는다.
 */
const SEED_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../..', 'data/seed');

/** 문자열이면서 공백만으로 이루어지지 않은 값. 필드 누락도 함께 걸러낸다. */
const nonEmpty = expect.stringMatching(/\S/);

function expectUniqueIds(rows: readonly { id: string }[]): void {
  expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
}

describe('시드 데이터', () => {
  it('TC-01-01 가맹점·시민 시드가 각 5건이고 필수 필드가 채워져 있으며 id 가 컬렉션 안에서 유일하다', async () => {
    const seed = new JsonFileDb(SEED_DIR);

    const merchants = await seed.readCollection<Merchant>('merchants');
    const citizens = await seed.readCollection<Citizen>('citizens');

    expect(merchants).toHaveLength(5);
    expect(citizens).toHaveLength(5);

    for (const merchant of merchants) {
      expect(merchant).toMatchObject({ id: nonEmpty, name: nonEmpty, category: nonEmpty });
    }
    for (const citizen of citizens) {
      expect(citizen).toMatchObject({ id: nonEmpty, name: nonEmpty });
    }

    expectUniqueIds(merchants);
    expectUniqueIds(citizens);
  });

  it('시드가 선언하는 스키마 판이 2 다', async () => {
    const seed = new JsonFileDb(SEED_DIR);

    await expect(seed.checkHealth()).resolves.toMatchObject({ readable: true, schemaVersion: 2 });
  });
});
