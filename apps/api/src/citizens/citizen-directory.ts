import { Inject, Injectable } from '@nestjs/common';
import type { Citizen } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';

import { DATA_DIR } from '../data-dir.token';
import { readCollection } from '../read-collection';

/** 시드로만 들어오고 목록 조회는 읽기만 한다. 쓰기가 없으므로 직렬화 큐도 필요 없다. */
const CITIZENS_COLLECTION = 'citizens';

/**
 * 시민 목록 API 가 `citizens` 를 읽는 자리.
 *
 * 컨트롤러가 직접 읽지 않는다. 이 저장소의 컨트롤러는 요청의 모양만 보고 파일 IO 는 아래
 * 층이 지는데(`coupons` 쪽의 컨트롤러·유스케이스·리포지터리가 그 형태다), 시민 목록에는
 * 볼 요청 모양이 없다는 이유로 그 경계를 이 엔드포인트만 다르게 두면 층이 갈린다.
 *
 * 소유자 확인(`coupons/owner-directory.ts`)·발급 후보 적재(`coupons/candidate-source.ts`)도
 * 같은 컬렉션을 읽지만 그쪽을 쓰지 않고 여기에 셋째 자리를 둔다. 세 자리가 같은 컬렉션에
 * 서로 다른 물음을 던지기 때문이다 — 전체 목록·id 하나의 실재·가맹점×시민 전체 쌍. 하나로
 * 모으면 `coupons` 모듈이 시민 모듈에 매달리는데, 그렇게 사서 얻을 것이 남아 있지 않다:
 * 읽기·배열 확인·`IssuanceError` 감싸기는 컬렉션을 읽는 자리 전부가 `readCollection`
 * 한 곳을 함께 쓰므로, 자리를 늘려도 겹치는 것은 컬렉션 이름 문자열뿐이다.
 */
@Injectable()
export class CitizenDirectory {
  private readonly db: JsonFileDb;

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.db = new JsonFileDb(dataDir);
  }

  /**
   * 정렬하지 않는다 — 파일에 든 순서가 곧 응답 순서다 (8장).
   *
   * 시드가 `id` 오름차순으로 커밋되어 있어 지금은 두 순서가 같아 보이지만, 여기서 정렬을
   * 걸면 시드를 다른 순서로 고치는 순간 계약이 조용히 어긋난다. 화면의 소유자 선택이
   * 시드에 적힌 순서대로 뜨는 것이 이 목록에 기대는 유일한 성질이다.
   */
  list(): Promise<Citizen[]> {
    return readCollection<Citizen>(this.db, CITIZENS_COLLECTION);
  }
}
