import type { ApiErrorResponse, IssuedCoupon, ListCouponsResponse } from '@im-coupon/contracts';
import { COUPONS_PATH, OWNER_ID_QUERY } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../app.module';
import { resolveSeedDir } from '../../shared/infrastructure/data-dir';
import { DATA_DIR } from '../../shared/infrastructure/data-dir.token';
import { DEFAULT_ISSUANCE_PARAMS } from '../../issuance/domain/params';
import { STORAGE_FAILURE_MESSAGE } from './issuance-error.filter';

let app: INestApplication;
let dataDir: string;

/** 하루의 길이. 픽스처의 두 기한을 발급 시각에서 만들 때 쓴다. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 조회가 돌려주는 쿠폰 한 건. 7장 `coupons` 테이블의 모양 그대로 만든다 — 조회는 레코드를
 * 해석하지 않고 그대로 실어 보내므로, 저장된 레코드와 응답이 필드 하나까지 같아야 한다.
 *
 * 두 기한을 발급 시각에서 계산해 두는 것은 레코드가 7장의 "이후" 조건을 지키게 하려는
 * 것이다. 고정 문자열로 박으면 발급 시각을 케이스마다 바꿀 때 기한이 발급 이전으로 넘어간다.
 */
function coupon(serial: string, ownerId: string, issuedAt: string): IssuedCoupon {
  const { faceValue, benefitSplit, ownerHoldDays, openValidDays } = DEFAULT_ISSUANCE_PARAMS;
  const issued = new Date(issuedAt);
  const held = new Date(issued.getTime() + ownerHoldDays * DAY_MS);
  return {
    id: `cpn-${serial}`,
    status: 'held',
    trigger: 'manual',
    ownerId,
    ownerName: `소유자 ${ownerId}`,
    merchantId: 'mer-001',
    merchantName: '별빛분식',
    faceValue,
    benefitSplit,
    issuedAt: issued.toISOString(),
    heldUntil: held.toISOString(),
    expiresAt: new Date(held.getTime() + openValidDays * DAY_MS).toISOString(),
  };
}

interface BootOptions {
  /** 데이터 디렉터리를 채우는 단계. 생략하면 커밋된 시드를 그대로 부트스트랩한다 */
  prepare?: (dataDir: string) => Promise<void>;
}

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
 * 데이터 디렉터리만 갈아끼운다 — 조회에는 시계도 난수도 걸리지 않는다. 환경변수를 건드리지
 * 않으므로 실제 `data/runtime` 은 이 파일에서 읽히지도 쓰이지도 않는다 (12장).
 */
async function boot(options: BootOptions = {}): Promise<void> {
  dataDir = await mkdtemp(join(tmpdir(), 'im-coupon-api-'));
  await (options.prepare ?? bootstrapSeed)(dataDir);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATA_DIR)
    .useValue(dataDir)
    .compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
}

/** 시드를 부트스트랩한 뒤 `coupons` 컬렉션을 주어진 레코드로 채운다. */
function withCoupons(...rows: IssuedCoupon[]): (dir: string) => Promise<void> {
  return async (dir) => {
    await bootstrapSeed(dir);
    await new JsonFileDb(dir).writeCollection('issued-coupons', rows);
  };
}

/**
 * 조회 요청. 쿼리 문자열을 통째로 받는 것은 이 엔드포인트의 판정이 쿼리의 **모양**에
 * 걸려 있어서다 — 키가 없는 것·값이 빈 것·키가 두 번 온 것을 객체로는 구별해 실어 보낼 수
 * 없다. 값은 이미 URL 인코딩된 상태로 적는다.
 */
function list(query = ''): request.Test {
  const url = query === '' ? COUPONS_PATH : `${COUPONS_PATH}?${query}`;
  return request(app.getHttpServer()).get(url);
}

/** 소유자 쿼리 한 벌. 키를 손으로 적지 않도록 계약 상수에서 만든다. */
function owner(value: string): string {
  return `${OWNER_ID_QUERY}=${value}`;
}

afterEach(async () => {
  await app?.close();
});

describe(`GET ${COUPONS_PATH}`, () => {
  it('TC-04-01 소유자의 쿠폰만 돌려주고 소유하지 않은 시민에게는 빈 배열을 돌려준다', async () => {
    const mine = coupon('0001', 'cit-001', '2026-09-10T05:00:00.000Z');
    await boot({ prepare: withCoupons(mine) });

    const owned = await list(owner('cit-001'));
    const none = await list(owner('cit-002'));

    expect(owned.status).toBe(200);
    // 레코드를 통째로 비교한다 — 필드를 골라 실어 보내면 거래조건 고지에 쓰이는
    // 배분 비율·두 기한이 화면에 닿기 전에 빠진다.
    expect((owned.body as ListCouponsResponse).coupons).toEqual([mine]);

    expect(none.status).toBe(200);
    expect((none.body as ListCouponsResponse).coupons).toEqual([]);
  });
});

/**
 * 쿼리가 소유자 id 하나로 읽히지 않는 경우를 한자리에 모은다.
 *
 * 8장이 `MISSING_OWNER_ID` 에 적은 것은 "없거나 빈 문자열" 둘이지만, 키를 두 번 실은
 * 요청도 같은 자리에 든다 — 셋 다 "이 요청에서 소유자를 하나로 정할 수 없다"로 같기
 * 때문이다. 배열의 첫 값을 골라 진행하면 호출자가 지정한 나머지가 소리 없이 버려진 채
 * `200` 이 나가, 다른 시민의 쿠폰을 자기 것으로 읽게 된다.
 */
describe(`GET ${COUPONS_PATH} 의 소유자 쿼리`, () => {
  it('TC-04-02 ownerId 쿼리가 없으면 400 과 MISSING_OWNER_ID 를 낸다', async () => {
    await boot();

    const response = await list();

    expect(response.status).toBe(400);
    const { error } = response.body as ApiErrorResponse;
    expect(error.code).toBe('MISSING_OWNER_ID');
    // 메시지가 비면 화면 오류 영역이 코드만 든 채 뜬다.
    expect(error.message).not.toBe('');
  });

  it.each([
    { label: '값이 빈 문자열이면', query: owner('') },
    { label: '키가 두 번 오면', query: `${owner('cit-001')}&${owner('cit-002')}` },
  ])('$label 400 과 MISSING_OWNER_ID 를 낸다', async ({ query }) => {
    await boot({ prepare: withCoupons(coupon('0001', 'cit-001', '2026-09-10T05:00:00.000Z')) });

    const response = await list(query);

    expect(response.status).toBe(400);
    expect((response.body as ApiErrorResponse).error.code).toBe('MISSING_OWNER_ID');
  });
});

describe(`GET ${COUPONS_PATH} 의 소유자 확인`, () => {
  it('TC-04-03 citizens 에 없는 소유자면 404 와 UNKNOWN_OWNER 를 낸다', async () => {
    // 쿠폰을 한 건 심어 둔다 — 조회 결과가 비어 있다는 것과 소유자가 없다는 것은 다른
    // 답이고, 컬렉션이 비면 둘이 같은 빈 배열로 보여 이 케이스가 무엇도 가리지 못한다.
    await boot({ prepare: withCoupons(coupon('0001', 'cit-001', '2026-09-10T05:00:00.000Z')) });

    const response = await list(owner('cit-999'));

    expect(response.status).toBe(404);
    const { error } = response.body as ApiErrorResponse;
    expect(error.code).toBe('UNKNOWN_OWNER');
    expect(error.message).not.toBe('');
  });

  /**
   * 공백만 든 값은 트림하지 않는다. 8장이 `MISSING_OWNER_ID` 에 둔 것은 "없거나 빈
   * 문자열"이고 공백 하나는 빈 문자열이 아니므로, 소유자 쿼리 판정을 지나 여기서
   * `UNKNOWN_OWNER` 로 떨어지는 것이 계약대로다. 트림을 넣으면 이 값이 `400` 으로
   * 옮겨 갈 뿐 아니라 `' cit-001 '` 까지 조용히 유효해진다.
   */
  it('공백만 든 값은 빈 문자열이 아니므로 400 이 아니라 404 와 UNKNOWN_OWNER 를 낸다', async () => {
    await boot({ prepare: withCoupons(coupon('0001', 'cit-001', '2026-09-10T05:00:00.000Z')) });

    const response = await list(owner('%20'));

    expect(response.status).toBe(404);
    expect((response.body as ApiErrorResponse).error.code).toBe('UNKNOWN_OWNER');
  });

  /**
   * 소유자 확인은 쿠폰이 0건인 시민에게도 걸린다. 확인을 "쿠폰이 없을 때만" 하는 구현은
   * 이 케이스와 TC-04-01 의 `cit-002` 를 갈라 놓지 못하므로, 시드에 있는 시민이 빈 배열을
   * 받는 것과 없는 시민이 `404` 를 받는 것을 같은 조건에서 나란히 든다.
   */
  it('citizens 에 있는 시민은 쿠폰이 0건이어도 200 과 빈 배열을 받는다', async () => {
    await boot({ prepare: withCoupons(coupon('0001', 'cit-001', '2026-09-10T05:00:00.000Z')) });

    const response = await list(owner('cit-005'));

    expect(response.status).toBe(200);
    expect((response.body as ListCouponsResponse).coupons).toEqual([]);
  });
});

/**
 * 정렬은 세 시각이 UTC `Z` 로 굳어 있는 것에 기댄다 (7장) — 그래서 문자열 비교가 곧 시각
 * 비교다. 픽스처의 발급 시각도 저장 형태 그대로 `Z` 로 적는다.
 */
describe(`GET ${COUPONS_PATH} 의 정렬`, () => {
  it('issuedAt 내림차순으로 돌려준다', async () => {
    // 저장 순서를 발급 시각 순서와 어긋내 둔다. 두 순서가 같으면 정렬하는 구현과
    // 저장 순서를 그대로 내보내는 구현이 갈리지 않는다.
    const older = coupon('0001', 'cit-001', '2026-09-10T05:00:00.000Z');
    const newest = coupon('0002', 'cit-001', '2026-09-12T05:00:00.000Z');
    const middle = coupon('0003', 'cit-001', '2026-09-11T05:00:00.000Z');
    await boot({ prepare: withCoupons(older, newest, middle) });

    const response = await list(owner('cit-001'));

    expect(response.status).toBe(200);
    expect((response.body as ListCouponsResponse).coupons.map((each) => each.id)).toEqual([
      newest.id,
      middle.id,
      older.id,
    ]);
  });

  /**
   * 같은 밀리초에 발급된 2건은 실제로 일어난다 — 발급은 한 요청에 한 번 시각을 읽고,
   * 겹친 요청 둘이 같은 값을 받을 수 있다. 동률의 순서를 비워 두면 어느 쿠폰이 위에
   * 오는지가 정렬 구현에 매달려 화면이 새로고침마다 달라 보일 수 있다.
   *
   * 저장 순서 유지로 안정시킨다 — 컬렉션에 먼저 들어간 쪽이 먼저 온다. 그 순서가
   * 이 저장소에서 유일하게 이미 정해져 있는 순서이기 때문이다: 저장은 뒤에 이어 붙이므로
   * 컬렉션의 배열 순서가 곧 발급 순서다.
   */
  it('발급 시각이 같으면 저장 순서를 유지한다', async () => {
    const SAME = '2026-09-11T05:00:00.000Z';
    const first = coupon('0001', 'cit-001', SAME);
    const second = coupon('0002', 'cit-001', SAME);
    // 동률 둘을 목록 한가운데에 두고 위아래로 다른 시각을 끼운다 — 정렬이 동률 구간만
    // 건드리는지, 끝자리에서만 우연히 맞는 것은 아닌지 함께 본다.
    const newest = coupon('0003', 'cit-001', '2026-09-12T05:00:00.000Z');
    const oldest = coupon('0004', 'cit-001', '2026-09-10T05:00:00.000Z');
    await boot({ prepare: withCoupons(newest, first, second, oldest) });

    const response = await list(owner('cit-001'));

    expect(response.status).toBe(200);
    expect((response.body as ListCouponsResponse).coupons.map((each) => each.id)).toEqual([
      newest.id,
      first.id,
      second.id,
      oldest.id,
    ]);
  });

  /**
   * 다른 소유자의 쿠폰이 섞여 있어도 정렬은 걸러 낸 뒤의 목록에만 걸린다. 거르기와
   * 정렬의 순서가 뒤바뀌어도 결과는 같지만, 다른 소유자의 레코드가 응답에 새는 회귀는
   * 정렬 케이스가 소유자 하나만 담고 있으면 여기서 드러나지 않는다.
   */
  it('다른 소유자의 쿠폰은 정렬 대상에도 들지 않는다', async () => {
    const mine = coupon('0001', 'cit-001', '2026-09-10T05:00:00.000Z');
    const theirs = coupon('0002', 'cit-002', '2026-09-12T05:00:00.000Z');
    await boot({ prepare: withCoupons(mine, theirs) });

    const response = await list(owner('cit-001'));

    expect(response.status).toBe(200);
    expect((response.body as ListCouponsResponse).coupons).toEqual([mine]);
  });
});

describe(`GET ${COUPONS_PATH} 의 저장소 경로`, () => {
  /**
   * 발급이 한 번도 일어나지 않은 상태다. `coupons` 는 시드에 없고 발급의 최초 쓰기가
   * 만드는 파일이라(7장), 시연 시작 직후의 내 쿠폰 화면이 늘 지나는 경로다. 없는 컬렉션을
   * 읽기 실패로 다루면 그 화면이 첫 발급 전까지 `500` 만 띄운다.
   */
  it('coupons 파일이 아직 없으면 500 이 아니라 200 과 빈 배열을 낸다', async () => {
    await boot();

    const response = await list(owner('cit-001'));

    expect(response.status).toBe(200);
    expect((response.body as ListCouponsResponse).coupons).toEqual([]);
  });

  /**
   * 읽기 실패는 컬렉션 파일을 깨뜨려 만든다. 권한으로 막지 않으므로 실행 사용자와
   * 무관하다 — root 도 깨진 JSON 은 파싱하지 못한다.
   *
   * 응답에 나가는 말까지 본다. Node 의 fs 오류와 `JSON.parse` 의 오류는 실패한 파일의
   * 절대 경로를 메시지에 싣고 그 경로에는 서버를 돌리는 계정 이름이 들어가는데, 이 응답은
   * 그대로 시연 화면의 오류 영역에 뜬다. 감싸는 쪽이 원인을 메시지에 남기고 무엇을
   * 내보일지는 오류 필터 한 곳이 정하는 가름이 조회 경로에서도 서는지 보는 것이다.
   */
  it('coupons 읽기가 실패하면 500 과 STORAGE_FAILURE 를 내고 원인은 서버 로그에만 남긴다', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await boot({
      prepare: async (dir) => {
        await bootstrapSeed(dir);
        await writeFile(join(dir, 'issued-coupons.json'), '{깨진 JSON', 'utf8');
      },
    });

    const response = await list(owner('cit-001'));

    expect(response.status).toBe(500);
    const { error } = response.body as ApiErrorResponse;
    expect(error.code).toBe('STORAGE_FAILURE');
    expect(error.message).not.toContain(dataDir);
    expect(error.message).toBe(STORAGE_FAILURE_MESSAGE);
    expect(logged.mock.calls.flat().join(' ')).toContain('coupons 컬렉션을 읽지 못했다');
    logged.mockRestore();
  });

  /**
   * 소유자 확인이 읽는 `citizens` 도 같은 자리로 모인다. 조회가 두 컬렉션을 읽으므로
   * 한쪽만 덮으면 다른 쪽의 읽기 실패가 감싸지지 않은 채 새어 `500` 의 본문 모양이 갈린다.
   */
  it('citizens 읽기가 실패해도 같은 500 과 STORAGE_FAILURE 로 모인다', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await boot({
      prepare: async (dir) => {
        await bootstrapSeed(dir);
        await writeFile(join(dir, 'citizens.json'), '{깨진 JSON', 'utf8');
      },
    });

    const response = await list(owner('cit-001'));

    expect(response.status).toBe(500);
    const { error } = response.body as ApiErrorResponse;
    expect(error.code).toBe('STORAGE_FAILURE');
    expect(error.message).toBe(STORAGE_FAILURE_MESSAGE);
    expect(logged.mock.calls.flat().join(' ')).toContain('citizens 컬렉션을 읽지 못했다');
    logged.mockRestore();
  });
});
