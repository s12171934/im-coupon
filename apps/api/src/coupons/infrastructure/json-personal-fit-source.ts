import { Inject, Injectable } from '@nestjs/common';
import { JsonFileDb } from '@im-coupon/db';
import type { Candidate } from '../../issuance/domain/signals/signal';
import type { PersonalFitMerchantVector, PersonalFitUsageEvent, PreparedPersonalFit } from '../../issuance/domain/signals/implementations/personal-fit-input';
import { preparePersonalFit } from '../../issuance/domain/signals/implementations/prepare-personal-fit';
import { DATA_DIR } from '../../shared/infrastructure/data-dir.token';
import { readCollection } from '../../shared/infrastructure/read-collection';
import type { PersonalFitSource } from '../application/ports/personal-fit-source';

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
    const [events, vectors] = await Promise.all([
      readCollection<PersonalFitUsageEvent>(this.db, 'personal-fit-events'),
      readCollection<PersonalFitMerchantVector>(this.db, 'personal-fit-vectors'),
    ]);
    // 기준 시점까지 알려지고 검증된 최신 내용 버전만 현재 후보로 지목한다.
    const current = new Map<string, PersonalFitMerchantVector>();
    for (const vector of vectors) {
      if (!vector || !Number.isFinite(vector.knownAt) || !Number.isFinite(vector.verifiedAt)
        || vector.knownAt > asOf || vector.verifiedAt > asOf) continue;
      const previous = current.get(vector.merchantId);
      if (!previous || vector.knownAt > previous.knownAt
        || (vector.knownAt === previous.knownAt && vector.verifiedAt > previous.verifiedAt)
        || (vector.knownAt === previous.knownAt && vector.verifiedAt === previous.verifiedAt
          && vector.contentVersion > previous.contentVersion)) current.set(vector.merchantId, vector);
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
