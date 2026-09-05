import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { JsonFileDb } from './json-file-db';

async function makeDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'im-coupon-db-'));
}

describe('JsonFileDb', () => {
  it('데이터 디렉터리에 있는 컬렉션 이름을 돌려준다', async () => {
    const dir = await makeDataDir();
    await writeFile(join(dir, 'coupons.json'), '[]', 'utf8');
    await writeFile(join(dir, 'merchants.json'), '[]', 'utf8');
    await writeFile(join(dir, 'README.txt'), 'json 이 아닌 파일', 'utf8');

    const db = new JsonFileDb(dir);

    await expect(db.listCollections()).resolves.toEqual(['coupons', 'merchants']);
  });

  it('컬렉션 파일의 내용을 파싱해 돌려준다', async () => {
    const dir = await makeDataDir();
    await writeFile(join(dir, 'coupons.json'), '[{"id":"c-1"},{"id":"c-2"}]', 'utf8');

    const db = new JsonFileDb(dir);

    await expect(db.readCollection('coupons')).resolves.toEqual([{ id: 'c-1' }, { id: 'c-2' }]);
  });

  it('없는 컬렉션은 빈 배열로 읽힌다', async () => {
    const db = new JsonFileDb(await makeDataDir());

    await expect(db.readCollection('coupons')).resolves.toEqual([]);
  });

  it('쓴 컬렉션을 그대로 다시 읽는다', async () => {
    const db = new JsonFileDb(await makeDataDir());

    await db.writeCollection('coupons', [{ id: 'c-1' }]);

    await expect(db.readCollection('coupons')).resolves.toEqual([{ id: 'c-1' }]);
  });

  it('쓰기는 임시 파일을 남기지 않는다', async () => {
    const dir = await makeDataDir();
    const db = new JsonFileDb(dir);

    await db.writeCollection('coupons', [{ id: 'c-1' }]);

    await expect(readdir(dir)).resolves.toEqual(['coupons.json']);
  });
});

describe('JsonFileDb.checkHealth', () => {
  it('_meta.json 의 schemaVersion 과 도메인 컬렉션 목록을 보고한다', async () => {
    const dir = await makeDataDir();
    await writeFile(join(dir, '_meta.json'), '{"schemaVersion":1}', 'utf8');
    await writeFile(join(dir, 'coupons.json'), '[]', 'utf8');

    const db = new JsonFileDb(dir);

    await expect(db.checkHealth()).resolves.toEqual({
      readable: true,
      schemaVersion: 1,
      collections: ['coupons'],
    });
  });

  it('데이터 디렉터리가 없으면 readable 이 false 다', async () => {
    const db = new JsonFileDb(join(await makeDataDir(), '없는-디렉터리'));

    await expect(db.checkHealth()).resolves.toEqual({
      readable: false,
      schemaVersion: null,
      collections: [],
    });
  });
});

describe('JsonFileDb.bootstrapFromSeed', () => {
  it('런타임 디렉터리가 비어 있으면 시드를 복사한다', async () => {
    const seedDir = await makeDataDir();
    await writeFile(join(seedDir, '_meta.json'), '{"schemaVersion":1}', 'utf8');
    await writeFile(join(seedDir, 'coupons.json'), '[{"id":"c-1"}]', 'utf8');
    const runtimeDir = join(await makeDataDir(), 'runtime');
    const db = new JsonFileDb(runtimeDir);

    await db.bootstrapFromSeed(seedDir);

    await expect(db.listCollections()).resolves.toEqual(['_meta', 'coupons']);
    await expect(db.readCollection('coupons')).resolves.toEqual([{ id: 'c-1' }]);
  });

  it('런타임 데이터가 이미 있으면 덮어쓰지 않는다', async () => {
    const seedDir = await makeDataDir();
    await writeFile(join(seedDir, 'coupons.json'), '[{"id":"시드"}]', 'utf8');
    const runtimeDir = await makeDataDir();
    const db = new JsonFileDb(runtimeDir);
    await db.writeCollection('coupons', [{ id: '이미-있던-것' }]);

    await db.bootstrapFromSeed(seedDir);

    await expect(db.readCollection('coupons')).resolves.toEqual([{ id: '이미-있던-것' }]);
  });
});
