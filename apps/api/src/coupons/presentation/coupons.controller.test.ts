import type {
  ApiErrorResponse,
  Citizen,
  Coupon,
  IssueCouponResponse,
  Merchant,
} from '@im-coupon/contracts';
import { ISSUE_COUPON_PATH } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../app.module';
import { resolveSeedDir } from '../../shared/infrastructure/data-dir';
import { DATA_DIR } from '../../shared/infrastructure/data-dir.token';
import { DEFAULT_ISSUANCE_PARAMS } from '../../issuance/domain/params';
import { STORAGE_FAILURE_MESSAGE } from './issuance-error.filter';
import { ISSUE_CLOCK, ISSUE_RANDOM } from '../application/coupons.service';

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

interface BootOptions {
  random?: () => number;
  /** 데이터 디렉터리를 채우는 단계. 생략하면 커밋된 시드를 그대로 부트스트랩한다 */
  prepare?: (dataDir: string) => Promise<void>;
}

/** 기본 준비 — 커밋된 시드를 임시 디렉터리로 부트스트랩한다. */
function bootstrapSeed(dir: string): Promise<void> {
  return new JsonFileDb(dir).bootstrapFromSeed(resolveSeedDir());
}

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
 *
 * `prepare` 는 데이터 디렉터리를 채우는 단계를 통째로 갈아끼운다. 오류 경로의 케이스들이
 * 시드에 더해 컬렉션을 비우거나 깨뜨리거나 권한을 막아야 해서, 부트스트랩 뒤에 손대는
 * 훅이 아니라 단계 자체를 대신하게 두었다 — 부트스트랩을 아예 하지 않는 준비도 같은
 * 자리에서 표현된다.
 */
async function boot(options: BootOptions = {}): Promise<void> {
  dataDir = await mkdtemp(join(tmpdir(), 'im-coupon-api-'));
  await (options.prepare ?? bootstrapSeed)(dataDir);

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

/**
 * JSON 으로 파싱되지 않는 본문을 보낸다. 본문을 문자열로 넘기면 superagent 가 그대로
 * 실어 보내므로 헤더만 JSON 으로 선언해 파서가 파싱을 시도하다 실패하게 만든다.
 */
function unparsableBody(raw: string): request.Test {
  return issue().set('Content-Type', 'application/json').send(raw);
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

describe('오류 4종의 HTTP 매핑', () => {
  it('TC-03-02 가중치가 음수면 400 과 INVALID_WEIGHTS 를 낸다', async () => {
    // 시드를 그대로 부트스트랩해 발급 후보는 넉넉히 둔다 — 가중치 거부와 발급 후보 없음이
    // 한 요청에 겹치면 어느 쪽이 상태를 정했는지 이 케이스가 가리지 못한다.
    await boot();

    const response = await issue().send({ weights: { random: -1 } });

    expect(response.status).toBe(400);
    const { error } = response.body as ApiErrorResponse;
    expect(error.code).toBe('INVALID_WEIGHTS');
    // 메시지는 요청 내용에서 나오므로 그대로 내보낸다. 빈 문자열이면 화면 오류 영역이
    // 코드만 든 채 뜨므로 자리를 비워 두지 않았는지 본다.
    expect(error.message).not.toBe('');
    expect(await storedCoupons()).toHaveLength(0);
  });

  it('TC-03-03 발급 후보가 없으면 422 와 NO_CANDIDATES 를 낸다', async () => {
    // `merchants` 만 비운다. 곱의 한쪽이 비면 쌍이 0건이므로 8장의 "또는"이 실제로 서는지
    // 보이고, 가중치는 기본값 그대로여서 이 요청에 겹치는 거부가 없다.
    await boot({
      prepare: async (dir) => {
        await bootstrapSeed(dir);
        await new JsonFileDb(dir).writeCollection('merchants', []);
      },
    });

    const response = await issue();

    expect(response.status).toBe(422);
    const { error } = response.body as ApiErrorResponse;
    expect(error.code).toBe('NO_CANDIDATES');
    expect(error.message).not.toBe('');
    expect(await storedCoupons()).toHaveLength(0);
  });

  /**
   * 쓰기만 막는다 — 데이터 디렉터리에서 쓰기 비트를 걷으면 시드 읽기는 그대로 되고
   * `coupons.json` 을 만드는 자리만 막힌다. 그래서 이 케이스가 짚는 것은 쓰기 실패다.
   *
   * root 는 디렉터리의 권한 비트를 무시하므로 그때는 쓰기가 성공해 버린다. 건너뛰지 않으면
   * root 로 도는 환경에서 이 케이스가 거짓 RED 를 낸다 — 구현이 아니라 실행 사용자가 원인이다.
   */
  it.skipIf(process.getuid?.() === 0)(
    'TC-03-04 쿠폰 쓰기가 실패하면 500 과 STORAGE_FAILURE 를 내고 원인은 서버 로그에만 남긴다',
    async () => {
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await boot({
        prepare: async (dir) => {
          await bootstrapSeed(dir);
          await chmod(dir, 0o555);
        },
      });

      const response = await issue();

      expect(response.status).toBe(500);
      const { error } = response.body as ApiErrorResponse;
      expect(error.code).toBe('STORAGE_FAILURE');
      // Node 의 fs 오류 메시지는 절대 경로를 싣는다. 그대로 내보내면 심사 대상인 시연 화면의
      // 오류 영역에 서버 파일시스템 경로가 뜨므로, 이 코드만 고정 문구로 바꿔 내보낸다.
      expect(error.message).not.toContain(dataDir);
      expect(error.message).toBe(STORAGE_FAILURE_MESSAGE);
      // 가린 원인이 어디에도 남지 않으면 이 실패는 디버깅할 수 없다. 응답에서 걷어낸 만큼
      // 서버 로그가 받아야 하므로, 원 메시지가 로그로 갔는지까지 본다.
      expect(logged.mock.calls.flat().join(' ')).toContain('쿠폰 컬렉션을 쓰지 못했다');
      logged.mockRestore();
      await chmod(dataDir, 0o755);
    },
  );

  /**
   * 읽기 실패는 컬렉션 파일을 깨뜨려 만든다. 권한으로 막지 않으므로 실행 사용자와 무관하고,
   * 그래서 이 케이스에는 root 가드가 필요 없다 — root 도 깨진 JSON 은 파싱하지 못한다.
   */
  it('발급 후보 읽기가 실패해도 같은 500 과 STORAGE_FAILURE 로 모인다', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await boot({
      prepare: async (dir) => {
        await bootstrapSeed(dir);
        await writeFile(join(dir, 'merchants.json'), '{깨진 JSON', 'utf8');
      },
    });

    const response = await issue();

    expect(response.status).toBe(500);
    const { error } = response.body as ApiErrorResponse;
    expect(error.code).toBe('STORAGE_FAILURE');
    expect(error.message).toBe(STORAGE_FAILURE_MESSAGE);
    expect(logged.mock.calls.flat().join(' ')).toContain('merchants 컬렉션을 읽지 못했다');
    logged.mockRestore();
  });

  it('TC-03-06 weights 가 객체가 아니거나 본문이 JSON 으로 파싱되지 않으면 400 과 INVALID_BODY 를 낸다', async () => {
    await boot();

    const notObject = await issue().send({ weights: 1 });
    const notJson = await unparsableBody('{발급');

    for (const response of [notObject, notJson]) {
      expect(response.status).toBe(400);
      const { error } = response.body as ApiErrorResponse;
      expect(error.code).toBe('INVALID_BODY');
      expect(error.message).not.toBe('');
    }
    expect(await storedCoupons()).toHaveLength(0);
  });

  /**
   * `weights` 자리에 올 수 있는 비객체 값들. `null`·`[]`·`true` 는 판정을 `typeof` 하나로
   * 두면 "가중치 없음"으로 읽혀 `201` 이 나가고, `[1]`·`'abc'` 는 인덱스나 글자가 모르는 신호
   * 키 행세를 해 `INVALID_WEIGHTS` 로 갈린다. 같은 종류의 잘못된 본문이 값에 따라 세 갈래로
   * 흩어지는 것을 막는 것이 이 목록의 목적이라, 대표 하나가 아니라 다섯을 모두 든다.
   */
  it.each([
    { label: 'null', weights: null },
    { label: '빈 배열', weights: [] },
    { label: '원소 있는 배열', weights: [1] },
    { label: '참', weights: true },
    { label: '문자열', weights: 'abc' },
  ])('weights 가 $label 이면 400 과 INVALID_BODY 를 낸다', async ({ weights }) => {
    await boot();

    const response = await issue().send({ weights });

    expect(response.status).toBe(400);
    expect((response.body as ApiErrorResponse).error.code).toBe('INVALID_BODY');
  });

  /**
   * JSON 이 아닌 형식으로 선언된 본문. 파서가 건너뛰어 본문이 없는 것과 구별되지 않으므로
   * 판정하지 않으면 그대로 기본값 발급이 된다 — 요청이 실은 가중치가 소리 없이 사라진 채
   * `201` 이 나가는 경로다. 기본값과 다른 가중치를 실어, 통과했다면 발급이 되어 버리는
   * 본문으로 보낸다.
   */
  it('JSON 이 아닌 형식으로 선언된 본문은 400 과 INVALID_BODY 를 낸다', async () => {
    await boot();
    const weight = DEFAULT_ISSUANCE_PARAMS.weights.random + 1;

    const response = await issue()
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ weights: { random: weight } }));

    expect(response.status).toBe(400);
    expect((response.body as ApiErrorResponse).error.code).toBe('INVALID_BODY');
    expect(await storedCoupons()).toHaveLength(0);
  });

  /**
   * 모양 판정이 넘겨야 하는 쪽. `weights` 를 생략하거나 `{}` 로 보내는 것은 8장 2단계가
   * "전부 기본값"으로 두는 정상 경로다. 판정을 "본문이 객체인가"로 넓히면 이 둘이 함께
   * 막히므로, 좁힌 자리가 실제로 좁은지 여기서 든다.
   */
  it.each([
    { label: 'weights 를 생략한 본문', body: {} },
    { label: '빈 weights', body: { weights: {} } },
  ])('$label 은 모양 판정을 지나 기본값으로 발급된다', async ({ body }) => {
    await boot();

    const response = await issue().send(body);

    expect(response.status).toBe(201);
    expect((response.body as IssueCouponResponse).decision.total).toBe(
      SCORE * DEFAULT_ISSUANCE_PARAMS.weights.random,
    );
  });
});

describe('동시 발급', () => {
  it('TC-03-05 발급 요청 2건이 겹쳐도 쿠폰 2건이 모두 저장된다', async () => {
    // 두 요청을 기다리지 않고 함께 띄운다. 저장이 읽고-더하고-쓰는 한 묶음이라, 직렬화가
    // 없으면 나중 쓰기가 앞 쓰기를 덮어 파일에 1건만 남는다 — 두 응답은 둘 다 `201` 이므로
    // 유실은 응답이 아니라 파일이 답한다.
    await boot();

    const responses = await Promise.all([issue(), issue()]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const stored = await storedCoupons();
    expect(stored).toHaveLength(2);
    // 같은 레코드가 두 번 쓰인 것도 2건이므로, 두 응답의 쿠폰이 각각 들어갔는지까지 본다.
    expect(stored.map((coupon) => coupon.id).sort()).toEqual(
      responses.map((response) => (response.body as IssueCouponResponse).coupon.id).sort(),
    );
  });
});
