import { Inject, Injectable } from '@nestjs/common';
import type { Citizen } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';

import { DATA_DIR } from '../data-dir.token';
import { readCollection } from '../read-collection';

/** 시드로만 들어오고 조회는 읽기만 한다. 쓰기가 없으므로 직렬화 큐도 필요 없다. */
const CITIZENS_COLLECTION = 'citizens';

/**
 * 내 쿠폰 조회가 소유자를 확인하는 자리 — `citizens` 에 그 id 가 있는지만 답한다.
 *
 * 발급 후보 적재(`CandidateSource`)도 같은 컬렉션을 읽지만 그쪽을 쓰지 않는다. 적재가
 * 내는 것은 가맹점×시민 전체 쌍이라, 소유자 하나가 실재하는지 보려고 부르면 시민 수의
 * 가맹점 배만큼 쌍을 만들어 버린다 — 하는 일과 치르는 값이 맞지 않는다. 그렇다고 읽기가
 * 두 벌이 되지는 않는다 — 읽기·배열 확인·감싸기는 컬렉션을 읽는 자리 전부가
 * `readCollection` 한 곳을 함께 쓴다.
 *
 * 없는 소유자를 여기서 던지지 않고 있는지 없는지만 답한다. `UNKNOWN_OWNER` 를 낼지는
 * 조회 유스케이스의 판단이고, 적재가 발급 후보 0건을 엔진에 맡기는 것과 같은 가름이다.
 */
@Injectable()
export class OwnerDirectory {
  private readonly db: JsonFileDb;

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.db = new JsonFileDb(dataDir);
  }

  /** 정확 일치로만 본다 — 시민 id 는 트림도 대소문자 접기도 하지 않는 값이다. */
  async has(ownerId: string): Promise<boolean> {
    const citizens = await readCollection<Citizen>(this.db, CITIZENS_COLLECTION);
    return citizens.some((citizen) => citizen.id === ownerId);
  }
}
