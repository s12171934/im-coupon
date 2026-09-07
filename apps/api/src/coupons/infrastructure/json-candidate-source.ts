import { readCollection } from '../../shared/infrastructure/read-collection';
import type { CandidateSource } from '../application/ports/candidate-source';
import { Inject, Injectable } from '@nestjs/common';
import type { Citizen, Merchant } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';

import { DATA_DIR } from '../../shared/infrastructure/data-dir.token';
import type { Candidate } from '../../issuance/domain/signals/signal';

/** 시드로만 들어오고 발급은 읽기만 한다. 쓰기가 없으므로 직렬화 큐도 필요 없다. */
const MERCHANTS_COLLECTION = 'merchants';
const CITIZENS_COLLECTION = 'citizens';

/**
 * 발급 후보를 만드는 자리 — `merchants`·`citizens` 를 읽어 가맹점×시민 전체 쌍을 낸다.
 *
 * 발급 후보가 0건인 것은 여기서 실패로 다루지 않는다. 컬렉션이 비면 빈 목록을 그대로
 * 내보내고 `NO_CANDIDATES` 는 그 목록을 받은 엔진이 던진다. 엔진은 가중치 검증과 후보
 * 선택을 `selectCandidate` 한 자리에서 하고 검증을 먼저 하므로, 빈 목록의 거부는 가중치
 * 거부 뒤에 선다. 적재가 그 앞에서 먼저 던지면 순서가 뒤집혀, `merchants` 가 비고 가중치도
 * 틀린 요청이 `400 INVALID_WEIGHTS` 대신 `422 NO_CANDIDATES` 를 받는다 — 적재는 늘
 * 선택보다 먼저 도므로 이 뒤집힘은 우연이 아니라 항상이다.
 *
 * 파일 IO 실패는 `IssuanceError('STORAGE_FAILURE')` 로 감싸 올린다. 쿠폰 저장과 같은
 * 이유다 — 발급의 실패를 한 예외로 모아야 API 층이 한 종류만 잡아 오류 응답으로 옮긴다.
 */
@Injectable()
export class JsonCandidateSource implements CandidateSource {
  private readonly db: JsonFileDb;

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.db = new JsonFileDb(dataDir);
  }

  /**
   * 가맹점을 바깥, 시민을 안쪽 순회로 둔다.
   *
   * 어느 쪽이 바깥이든 쌍의 집합은 같지만 순서는 갈리고, 그 순서가 곧 계약이다 —
   * 최고점이 여럿일 때 발급되는 쿠폰을 "목록에서 먼저 온 쪽"이 정하기 때문이다.
   * 둘 중 이 순서를 고른 것은 `Candidate` 의 필드 순서와 발급 후보를 부르는 말
   * ("가맹점×시민 전체 쌍")이 이미 가맹점을 앞에 두고 있어서다. 읽는 쪽이 코드를 열지
   * 않고도 순서를 맞게 짚으려면 세 자리가 같은 방향이어야 한다.
   *
   * 각 컬렉션 안의 순서는 파일에 든 순서 그대로다 — 정렬하지 않으므로 시드를 고치지
   * 않는 한 같은 목록이 나온다.
   */
  async load(): Promise<Candidate[]> {
    const [merchants, citizens] = await Promise.all([
      readCollection<Merchant>(this.db, MERCHANTS_COLLECTION),
      readCollection<Citizen>(this.db, CITIZENS_COLLECTION),
    ]);

    const candidates: Candidate[] = [];
    for (const merchant of merchants) {
      for (const citizen of citizens) {
        candidates.push({ merchant, citizen });
      }
    }
    return candidates;
  }
}
