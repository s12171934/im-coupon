import type { ApiErrorResponse, Citizen, ListCitizensResponse } from '@im-coupon/contracts';
import { CITIZENS_PATH } from '@im-coupon/contracts';
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
import { STORAGE_FAILURE_MESSAGE } from '../../coupons/presentation/issuance-error.filter';
import { resolveSeedDir } from '../../shared/infrastructure/data-dir';
import { DATA_DIR } from '../../shared/infrastructure/data-dir.token';

let app: INestApplication;
let dataDir: string;

/** 시민 컬렉션의 파일 이름. 테스트가 응답과 대조하려고 같은 디렉터리를 직접 읽는다 */
const CITIZENS_COLLECTION = 'citizens';

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
 * 시민 모듈이 아니라 `AppModule` 을 띄운다. 모듈만 직접 띄우면 그 모듈이 앱에 등록되어
 * 있는지는 아무도 보지 않아, `app.module.ts` 에서 등록을 빼도 여기가 전부 초록인 채 실제
 * 앱만 `404` 를 낸다. 전역으로 등록된 오류 필터가 이 경로에도 걸리는지도 조립된 앱에서만 보인다.
 *
 * 데이터 디렉터리만 갈아끼운다 — 시민 목록에는 시계도 난수도 걸리지 않는다. 환경변수를
 * 건드리지 않으므로 실제 `data/runtime` 은 이 파일에서 읽히지도 쓰이지도 않는다 (12장).
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

function listCitizens(): request.Test {
  return request(app.getHttpServer()).get(CITIZENS_PATH);
}

/** 앱이 읽는 그 디렉터리를 테스트가 직접 읽어 응답의 대조본으로 쓴다. */
function storedCitizens(): Promise<Citizen[]> {
  return new JsonFileDb(dataDir).readCollection<Citizen>(CITIZENS_COLLECTION);
}

afterEach(async () => {
  await app?.close();
});

describe(`GET ${CITIZENS_PATH}`, () => {
  /**
   * 시민의 이름을 하드코딩하지 않는다. 시드 위치를 정하는 `resolveSeedDir()` 이
   * `IM_COUPON_SEED_DIR` 를 우선하므로 그 환경변수가 설정된 머신은 다른 시드를 읽는다 (12장).
   * 대신 앱이 읽은 그 디렉터리를 테스트도 직접 읽어 순서까지 같은지 보고, 거기에
   * `TC-01-01` 이 고정한 시드의 성질(5건·`cit-` 접두·`id` 유일)을 얹는다.
   */
  it('TC-04-04 시드 순서 그대로 시민 5건을 낸다', async () => {
    await boot();

    const response = await listCitizens();

    expect(response.status).toBe(200);
    const { citizens } = response.body as ListCitizensResponse;
    expect(citizens).toEqual(await storedCitizens());
    expect(citizens).toHaveLength(5);
    expect(citizens.every((citizen) => citizen.id.startsWith('cit-'))).toBe(true);
    expect(new Set(citizens.map((citizen) => citizen.id)).size).toBe(citizens.length);
  });

  /**
   * 시드가 `id` 오름차순으로 커밋되어 있어, 위 케이스는 저장 순서를 그대로 내보내는 구현과
   * `id` 로 정렬하는 구현을 갈라 놓지 못한다. 파일 순서를 `id` 순서와 어긋내 두면 그 둘이
   * 갈린다 — "정렬하지 않는다"(8장)를 실제로 드는 것은 이 케이스다.
   */
  it('파일에 든 순서가 id 순서와 어긋나도 그 순서를 그대로 낸다', async () => {
    const shuffled: Citizen[] = [
      { id: 'cit-003', name: '세 번째' },
      { id: 'cit-001', name: '첫 번째' },
      { id: 'cit-002', name: '두 번째' },
    ];
    await boot({
      prepare: (dir) => new JsonFileDb(dir).writeCollection(CITIZENS_COLLECTION, shuffled),
    });

    const response = await listCitizens();

    expect(response.status).toBe(200);
    expect((response.body as ListCitizensResponse).citizens).toEqual(shuffled);
  });
});

/**
 * 컬렉션 읽기가 이 엔드포인트의 유일한 실패 자리다. 그래서 여기 둘을 나란히 든다 —
 * 읽기가 실패하는 것과, 컬렉션이 아직 없는 것. 뒤쪽은 실패가 아니다.
 */
describe(`GET ${CITIZENS_PATH} 의 저장소 경로`, () => {
  /**
   * 오류 필터가 이 경로에도 실제로 걸리는지 본다.
   *
   * 필터는 `app.module.ts` 에서 `APP_FILTER` 로 전역 등록되어 있지만, 등록을 읽는 것과
   * 이 경로가 그것을 지나는 것은 다른 사실이다 — 시민 모듈만 따로 띄우거나 등록이 풀리면
   * `IssuanceError` 가 아무도 잡지 않는 예외로 남아 NestJS 기본 `500`(`{statusCode,
   * message}`)이 나가고, 화면의 오류 영역은 `error.code` 를 읽지 못한다. 그래서 조립된
   * 앱에서 상태·코드·본문 모양을 함께 단언한다.
   *
   * 읽기 실패는 컬렉션 파일을 깨뜨려 만든다. 권한으로 막지 않으므로 실행 사용자와
   * 무관하다 — root 도 깨진 JSON 은 파싱하지 못한다.
   *
   * 응답에 나가는 말까지 본다. `JSON.parse` 의 오류는 실패한 파일의 절대 경로를 메시지에
   * 싣고 그 경로에는 서버를 돌리는 계정 이름이 들어가는데, 이 응답은 그대로 시연 화면의
   * 오류 영역에 뜬다. 감싸는 쪽이 원인을 메시지에 남기고 무엇을 내보일지는 오류 필터 한
   * 곳이 정하는 가름이 시민 경로에서도 서는지 보는 것이다.
   */
  it('citizens 읽기가 실패하면 500 과 STORAGE_FAILURE 를 내고 원인은 서버 로그에만 남긴다', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await boot({
      prepare: async (dir) => {
        await bootstrapSeed(dir);
        await writeFile(join(dir, `${CITIZENS_COLLECTION}.json`), '{깨진 JSON', 'utf8');
      },
    });

    const response = await listCitizens();

    expect(response.status).toBe(500);
    const { error } = response.body as ApiErrorResponse;
    expect(error.code).toBe('STORAGE_FAILURE');
    expect(error.message).not.toContain(dataDir);
    expect(error.message).toBe(STORAGE_FAILURE_MESSAGE);
    expect(logged.mock.calls.flat().join(' ')).toContain('citizens 컬렉션을 읽지 못했다');
    logged.mockRestore();
  });

  /**
   * 컬렉션이 아직 없는 디렉터리다. 시드 부트스트랩이 아직 돌지 않은 상태가 여기 해당하고,
   * `JsonFileDb` 는 없는 컬렉션을 빈 배열로 읽으므로 파일 부재는 실패가 아니다 (7장).
   * 부재를 읽기 실패로 다루면 내 쿠폰 화면의 소유자 선택이 `500` 만 띄운 채 뜬다.
   */
  it('citizens 컬렉션이 없으면 500 이 아니라 200 과 빈 배열을 낸다', async () => {
    await boot({ prepare: () => Promise.resolve() });

    const response = await listCitizens();

    expect(response.status).toBe(200);
    expect((response.body as ListCitizensResponse).citizens).toEqual([]);
  });
});
