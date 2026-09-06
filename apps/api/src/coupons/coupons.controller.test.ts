import type { Citizen, Coupon, IssueCouponResponse, Merchant } from '@im-coupon/contracts';
import { ISSUE_COUPON_PATH } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { resolveSeedDir } from '../data-dir';
import { DATA_DIR } from '../data-dir.token';
import { DEFAULT_ISSUANCE_PARAMS } from '../issuance/params';
import { ISSUE_CLOCK, ISSUE_RANDOM } from './coupons.service';

let app: INestApplication;
let dataDir: string;

/** 발급 시각. 실제 지금과 다른 값이라, 시계를 주입받지 않는 구현이면 기한 단언이 어긋난다. */
const ISSUED_AT = new Date('2026-09-10T05:00:00.000Z');

/** 기본 난수 스텁이 내는 신호 점수. 발급 파라미터의 수치가 아니라 이 테스트가 정한 값이다. */
const SCORE = 0.5;

/**
 * 쿠폰 id 의 모양 — `cpn-` 접두 + `crypto.randomUUID()` 의 v4 UUID.
 *
 * 접두만 보면 `cpn-1` 이나 `cpn-<타임스탬프>` 같은 id 도 통과한다. 7장이 `id` 에 건 제약은
 * 컬렉션 안 유일성 하나이고 그 수단으로 지목한 것이 `randomUUID` 이므로, 재기동이나 동시
 * 발급에서 유일성이 깨지는 생성 방식으로 돌아가는 것을 여기서 막는다.
 */
const COUPON_ID = /^cpn-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 하루의 길이. 두 기한 파라미터가 일 단위라 기대 시각을 만들 때 쓴다. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 커밋된 시드를 임시 디렉터리에 부트스트랩한 앱을 띄운다.
 *
 * 발급 모듈이 아니라 `AppModule` 을 띄운다. 모듈만 직접 띄우면 그 모듈이 앱에 등록되어
 * 있는지는 아무도 보지 않아, `app.module.ts` 에서 등록을 빼도 여기가 전부 초록인 채
 * 실제 앱만 `404` 를 낸다. 조립된 앱을 띄우면 그 배선까지 이 케이스들이 함께 진다.
 *
 * 데이터 디렉터리·시계·난수를 갈아끼운다. 실제 `data/runtime` 을 건드리지 않으면서
 * 발급 후보 선택과 두 기한을 결정적으로 만들기 위한 것이다 — `coupon.id` 의 UUID 는
 * 주입하지 않으므로 값까지 결정적이지는 않다. 값을 못 박지 못하는 것이지 모양을 보지 못하는
 * 것은 아니므로, 아래 단언은 값 대신 접두와 UUID 모양을 본다.
 */
async function boot(options: { random?: () => number } = {}): Promise<void> {
  dataDir = await mkdtemp(join(tmpdir(), 'im-coupon-api-'));
  await new JsonFileDb(dataDir).bootstrapFromSeed(resolveSeedDir());

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATA_DIR)
    .useValue(dataDir)
    .overrideProvider(ISSUE_CLOCK)
    .useValue(() => ISSUED_AT)
    .overrideProvider(ISSUE_RANDOM)
    .useValue(options.random ?? (() => SCORE))
    .compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
}

/**
 * 컬렉션을 API 를 거치지 않고 파일에서 직접 읽는다 — 저장이 됐는지는 파일이 답한다.
 * 디렉터리를 인자로 받는 것은 발급 후보 수를 부트스트랩 **전에** 알아야 하는 자리가
 * 있어서다. 그때는 같은 내용이 든 시드 디렉터리를 본다.
 */
function collection<T>(dir: string, name: string): Promise<T[]> {
  return new JsonFileDb(dir).readCollection<T>(name);
}

function storedCoupons(): Promise<Coupon[]> {
  return collection<Coupon>(dataDir, 'coupons');
}

function issue(): request.Test {
  return request(app.getHttpServer()).post(ISSUE_COUPON_PATH);
}

function daysAfter(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * DAY_MS);
}

/**
 * 고정 수열을 순서대로 돌려주는 난수 스텁. 수열이 모자라면 조용히 다른 값을 내지 않고
 * 던져서, 의도한 수보다 많이 뽑는 구현이면 발급이 `500` 으로 떨어져 상태 단언에 걸린다.
 */
function fixedRng(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error(`난수 스텁의 고정 수열이 모자란다 (${index + 1}번째 호출)`);
    index += 1;
    return value;
  };
}

afterEach(async () => {
  await app?.close();
});

describe(`POST ${ISSUE_COUPON_PATH}`, () => {
  it('TC-03-01 시드를 부트스트랩한 뒤 발급하면 201 과 발급 응답이 오고 쿠폰이 0건에서 1건이 된다', async () => {
    await boot();
    const [merchants, citizens] = await Promise.all([
      collection<Merchant>(dataDir, 'merchants'),
      collection<Citizen>(dataDir, 'citizens'),
    ]);
    expect(await storedCoupons()).toHaveLength(0);

    const response = await issue();

    expect(response.status).toBe(201);
    const { coupon, decision } = response.body as IssueCouponResponse;
    expect(coupon.id).toMatch(COUPON_ID);
    expect(coupon.status).toBe('held');
    expect(coupon.trigger).toBe('manual');
    expect(coupon.faceValue).toBe(DEFAULT_ISSUANCE_PARAMS.faceValue);
    expect(coupon.benefitSplit).toEqual(DEFAULT_ISSUANCE_PARAMS.benefitSplit);
    // 스냅샷이 발급 후보에서 통째로 온 것인지 본다 — id 와 이름의 짝이 어긋나면 걸린다.
    expect(merchants).toContainEqual({
      id: coupon.merchantId,
      name: coupon.merchantName,
      category: expect.any(String),
    });
    expect(citizens).toContainEqual({ id: coupon.ownerId, name: coupon.ownerName });
    // 난수를 고정했으므로 점수도 총점도 값 하나로 정해진다 — `NaN` 이나 곱하지 않은 총점이
    // 응답에 실려 나가도 통과하지 않게, 자리만 보지 말고 값을 못 박는다.
    expect(decision).toEqual({
      candidateCount: merchants.length * citizens.length,
      scores: { random: SCORE },
      total: SCORE * DEFAULT_ISSUANCE_PARAMS.weights.random,
    });
    expect(await storedCoupons()).toEqual([coupon]);
  });
});

describe('발급이 굳히는 두 기한', () => {
  it('발급 시각에 소유자 점유 기한을, 그 끝에 유효 소비 기한을 더해 절대 시각으로 굳힌다', async () => {
    // 주입한 시계의 값에서 계산하므로, 유스케이스가 전역 시각을 직접 읽으면 어긋난다.
    await boot();
    const { ownerHoldDays, openValidDays } = DEFAULT_ISSUANCE_PARAMS;

    const response = await issue();

    expect(response.status).toBe(201);
    const { coupon } = response.body as IssueCouponResponse;
    expect(coupon.issuedAt).toBe(ISSUED_AT.toISOString());
    expect(coupon.heldUntil).toBe(daysAfter(ISSUED_AT, ownerHoldDays).toISOString());
    expect(coupon.expiresAt).toBe(daysAfter(ISSUED_AT, ownerHoldDays + openValidDays).toISOString());
  });
});

describe('발급 후보 선택에 쓰이는 난수', () => {
  it('고정 수열 난수를 주입하면 어느 발급 후보가 발급되는지가 정해진다', async () => {
    // 발급 후보 하나에 신호 하나를 태우므로 수열의 n 번째가 n 번째 발급 후보의 점수다.
    // 기대 쌍은 8장이 정한 순서(가맹점 바깥·시민 안쪽)대로 여기서 다시 만들어, 그 n 번째를
    // 그대로 짚는다 — 적재가 순서를 바꾸면 기대와 어긋난다.
    const seedDir = resolveSeedDir();
    const [merchants, citizens] = await Promise.all([
      collection<Merchant>(seedDir, 'merchants'),
      collection<Citizen>(seedDir, 'citizens'),
    ]);
    const pairs = merchants.flatMap((merchant) =>
      citizens.map((citizen) => ({ merchantId: merchant.id, ownerId: citizen.id })),
    );
    // 최고점 자리를 목록 한가운데에서 비켜 둔다 — 한가운데는 목록을 뒤집어도 제자리라,
    // 유스케이스가 발급 후보 목록의 순서를 뒤집어 넘기는 회귀를 놓친다.
    const chosen = Math.floor(pairs.length / 3);
    const scores = Array.from({ length: pairs.length }, (_, index) =>
      index === chosen ? 0.9 : 0.1,
    );
    await boot({ random: fixedRng(scores) });

    const response = await issue();

    expect(response.status).toBe(201);
    const { coupon } = response.body as IssueCouponResponse;
    expect({ merchantId: coupon.merchantId, ownerId: coupon.ownerId }).toEqual(pairs[chosen]);
  });
});

describe('요청이 실은 발급 가중치', () => {
  it('덮어쓴 발급 가중치가 엔진까지 그대로 가 총점에 곱해진다', async () => {
    // 발급 파라미터 기본값과 다른 값을 써야 가중치를 흘리는 구현과 갈린다.
    const weight = DEFAULT_ISSUANCE_PARAMS.weights.random + 1;
    await boot();

    const response = await issue().send({ weights: { random: weight } });

    expect(response.status).toBe(201);
    const { decision } = response.body as IssueCouponResponse;
    expect(decision.scores.random).toBe(SCORE);
    expect(decision.total).toBe(SCORE * weight);
  });
});
