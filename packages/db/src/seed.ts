import { resolve } from 'node:path';

import { JsonFileDb } from './json-file-db';

async function main(): Promise<void> {
  const repoRoot = resolve(__dirname, '../../..');
  const dataDir = resolve(process.env.IM_COUPON_DATA_DIR ?? resolve(repoRoot, 'data/runtime'));
  const seedDir = resolve(process.env.IM_COUPON_SEED_DIR ?? resolve(repoRoot, 'data/seed'));
  const db = new JsonFileDb(dataDir);

  await db.bootstrapFromSeed(seedDir);

  const health = await db.checkHealth();
  console.log(`DB: ${dataDir} (schemaVersion: ${health.schemaVersion})`);
  for (const name of health.collections) {
    const rows = await db.readCollection(name);
    console.log(`${name}: ${rows.length}건`);
  }
  console.log('시드 초기화 완료 (기존 컬렉션이 있으면 보존합니다).');
}

main().catch((error: unknown) => {
  console.error('시드 초기화 실패:', error);
  process.exitCode = 1;
});
