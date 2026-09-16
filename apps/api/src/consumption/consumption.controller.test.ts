import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JsonFileDb } from '@im-coupon/db';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { DATA_DIR } from '../shared/infrastructure/data-dir.token';
import { resolveSeedDir } from '../shared/infrastructure/data-dir';

let app: INestApplication;
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'consumption-http-'));
  await new JsonFileDb(directory).bootstrapFromSeed(resolveSeedDir());
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DATA_DIR).useValue(directory).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});
afterEach(async () => { await app?.close(); await rm(directory, { recursive: true, force: true }); });
function api() { return request(app.getHttpServer()); }
async function issue() {
  const response = await api().post('/api/coupons/issue').send({});
  expect(response.status).toBe(201);
  return response.body.coupon;
}

it('시민 조회→발급→소유자 조회→소유자 결제→재조회가 HTTP로 정상 처리된다', async () => {
  expect((await api().get('/api/citizens')).status).toBe(200);
  const coupon = await issue();
  const mine = await api().get('/api/coupons').query({ ownerId: coupon.ownerId });
  expect(mine.status).toBe(200);
  expect(mine.body.coupons[0].id).toBe(coupon.id);
  const paid = await api().post(`/api/consumption/coupons/${coupon.id}/consume`).send({ consumerId: coupon.ownerId });
  expect(paid.status).toBe(201);
  expect(paid.body.paybackAmount).toBe(coupon.faceValue);
  expect(paid.body.coupons[0].status).toBe('used');
  expect(paid.body.pointEntries).toHaveLength(1);
  const repeated = await api().post(`/api/consumption/coupons/${coupon.id}/consume`).send({ consumerId: coupon.ownerId });
  expect(repeated.status).toBe(409);
  expect((await api().get('/api/consumption')).body.pointEntries).toHaveLength(1);
});

it('공개 전 타인 결제는 거부하고 공개→점유→타인 결제에서 발급 비율로 지급한다', async () => {
  const coupon = await issue();
  const consumerId = coupon.ownerId === 'cit-001' ? 'cit-002' : 'cit-001';
  expect((await api().post(`/api/consumption/coupons/${coupon.id}/consume`).send({ consumerId })).status).toBe(409);
  expect((await api().post(`/api/consumption/coupons/${coupon.id}/simulate-owner-expiry`)).status).toBe(201);
  expect((await api().post(`/api/consumption/coupons/${coupon.id}/reserve`).send({ consumerId })).status).toBe(201);
  const paid = await api().post(`/api/consumption/coupons/${coupon.id}/consume`).send({ consumerId });
  expect(paid.status).toBe(201);
  expect(paid.body.paybackAmount).toBe(Math.round(coupon.faceValue * coupon.benefitSplit.consumerRatio));
  expect(paid.body.paybackAmount + paid.body.ownerRewardAmount).toBe(coupon.faceValue);
  expect(paid.body.pointEntries).toHaveLength(2);
});

it.each([{}, { consumerId: '' }, { consumerId: 7 }, { consumerId: [] }])('잘못된 소비자 입력 %j 는 500이 아닌 400과 안내를 반환한다', async (body) => {
  const response = await api().post('/api/consumption/coupons/unknown/consume').send(body);
  expect(response.status).toBe(400);
  expect(response.body.error.message).toBe('소비자 ID가 필요합니다.');
});

it('없는 시민·쿠폰은 404로 처리한다', async () => {
  expect((await api().post('/api/consumption/coupons/unknown/consume').send({ consumerId: 'unknown' })).status).toBe(404);
  expect((await api().post('/api/consumption/coupons/unknown/consume').send({ consumerId: 'cit-001' })).status).toBe(404);
});

it.each([[], [1], { weights: null }, { weights: [] }, { weights: { random: 0, personalFit: 0 } }])('잘못된 발급 입력 %j 는 발급하지 않고 400으로 처리한다', async (body) => {
  expect((await api().post('/api/coupons/issue').send(body)).status).toBe(400);
  expect((await new JsonFileDb(directory).readCollection('issued-coupons'))).toEqual([]);
});

it('시연 초기화 뒤 발급 기록은 보존되고 이후 발급 쿠폰도 사용할 수 있다', async () => {
  const previous = await issue();
  expect((await api().delete('/api/consumption')).body.coupons).toEqual([]);
  expect((await api().get('/api/coupons').query({ ownerId: previous.ownerId })).body.coupons).toHaveLength(1);
  const next = await issue();
  expect((await api().post(`/api/consumption/coupons/${next.id}/consume`).send({ consumerId: next.ownerId })).status).toBe(201);
});
