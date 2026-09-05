import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DATA_DIR } from '../data-dir.token';
import { HealthModule } from './health.module';

let app: INestApplication;

async function bootWithDataDir(dataDir: string): Promise<void> {
  const moduleRef = await Test.createTestingModule({ imports: [HealthModule] })
    .overrideProvider(DATA_DIR)
    .useValue(dataDir)
    .compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
}

afterEach(async () => {
  await app?.close();
});

describe('GET /api/health', () => {
  it('저장소를 읽을 수 있으면 ok 와 저장소 상태를 함께 돌려준다', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'im-coupon-api-'));
    await writeFile(join(dataDir, '_meta.json'), '{"schemaVersion":1}', 'utf8');
    await writeFile(join(dataDir, 'coupons.json'), '[]', 'utf8');
    await bootWithDataDir(dataDir);

    const response = await request(app.getHttpServer()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      storage: { readable: true, schemaVersion: 1, collections: ['coupons'] },
    });
  });

  it('저장소를 읽을 수 없으면 degraded 로 내려간다', async () => {
    await bootWithDataDir(join(await mkdtemp(join(tmpdir(), 'im-coupon-api-')), '없음'));

    const response = await request(app.getHttpServer()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
  });
});
