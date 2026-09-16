import { Inject, Injectable } from '@nestjs/common';
import { JsonFileDb } from '@im-coupon/db';
import type { Candidate } from '../../issuance/domain/signals/signal';
import type { PersonalFitMerchantVector, PersonalFitUsageEvent, PreparedPersonalFit } from '../../issuance/domain/signals/implementations/personal-fit-input';
import { preparePersonalFit } from '../../issuance/domain/signals/implementations/prepare-personal-fit';
import { DATA_DIR } from '../../shared/infrastructure/data-dir.token';
import { readCollection } from '../../shared/infrastructure/read-collection';
import type { PersonalFitSource } from '../application/ports/personal-fit-source';

/** 후보의 내용 버전은 벡터 존재 여부와 독립적으로 결정한다. */
interface MerchantContent {
  merchantId: string;
  contentVersion: string;
  knownAt: number;
  verifiedAt: number;
}

/** JSON은 입력 어댑터에서만 읽는다. main의 개인화 계산은 메모리 입력 그대로 사용한다. */
@Injectable()
export class JsonPersonalFitSource implements PersonalFitSource {
  private readonly db: JsonFileDb;
  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.db = new JsonFileDb(dataDir);
  }

  async prepare(candidates: readonly Candidate[], asOf: number): Promise<ReadonlyMap<string, PreparedPersonalFit>> {
    const prepared = new Map<string, PreparedPersonalFit>();
    if (candidates.length === 0) return prepared;
    const [events, vectors, contents] = await Promise.all([
      readCollection<PersonalFitUsageEvent>(this.db, 'personal-fit-events'),
      readCollection<PersonalFitMerchantVector>(this.db, 'merchant-vectors'),
      readCollection<MerchantContent>(this.db, 'merchant-contents'),
    ]);
    // 최신 내용의 벡터가 없으면 MISSING_VECTOR로 알린다. 예전 메뉴 벡터로 대체하지 않는다.
    const current = new Map<string, MerchantContent>();
    for (const content of contents) {
      if (!content || typeof content.merchantId !== 'string' || !content.merchantId.trim()
        || typeof content.contentVersion !== 'string' || !content.contentVersion.trim()
        || !Number.isFinite(content.knownAt) || !Number.isFinite(content.verifiedAt)
        || content.knownAt > asOf || content.verifiedAt > asOf) continue;
      const previous = current.get(content.merchantId);
      if (!previous || content.knownAt > previous.knownAt
        || (content.knownAt === previous.knownAt && content.verifiedAt > previous.verifiedAt)
        || (content.knownAt === previous.knownAt && content.verifiedAt === previous.verifiedAt
          && content.contentVersion > previous.contentVersion)) current.set(content.merchantId, content);
    }
    const merchantsByCitizen = new Map<string, Set<string>>();
    for (const candidate of candidates) {
      let merchants = merchantsByCitizen.get(candidate.citizen.id);
      if (!merchants) {
        merchants = new Set();
        merchantsByCitizen.set(candidate.citizen.id, merchants);
      }
      merchants.add(candidate.merchant.id);
    }
    for (const [citizenId, merchants] of merchantsByCitizen) {
      prepared.set(citizenId, preparePersonalFit({
        citizenId, asOf, events, vectors,
        candidates: [...merchants].map((merchantId) => ({
          merchantId, contentVersion: current.get(merchantId)?.contentVersion ?? 'unavailable',
        })),
      }));
    }
    return prepared;
  }
}
