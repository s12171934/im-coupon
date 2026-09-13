import type { Signal } from '../signal';
import type { PersonalFitContext } from './personal-fit-input';

/** 시민별로 준비한 점수만 동기 조회한다. 재준비와 context 교체는 호출자의 책임이다. */
export const personalFitSignal: Signal<'personalFit', PersonalFitContext> = {
  key: 'personalFit',
  score: (candidate, context) => {
    const citizenId = candidate.citizen.id;
    const merchantId = candidate.merchant.id;
    const prepared = context.personalFitByCitizenId.get(citizenId);
    if (prepared === undefined) return 0;

    // 비활성이어도 다른 시민의 결과를 잘못 꽂은 context는 먼저 거부한다.
    if (prepared.citizenId !== citizenId) {
      throw new Error(`personalFit: CITIZEN_MISMATCH citizen=${citizenId} merchant=${merchantId}`);
    }
    // 비활성은 시민 전체에 적용되므로 후보 점수 조회 없이 0을 반환한다.
    if (prepared.enabled === false) return 0;

    // 저장된 0은 유효하며, 프로토타입에서 물려받은 키는 준비된 후보가 아니다.
    if (!Object.hasOwn(prepared.scoresByMerchantId, merchantId)) {
      throw new Error(`personalFit: CANDIDATE_NOT_PREPARED citizen=${citizenId} merchant=${merchantId}`);
    }
    const score = prepared.scoresByMerchantId[merchantId];
    // 활성 결과의 계약 위반은 재계산하거나 범위를 보정해 숨기지 않는다.
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
      throw new Error(`personalFit: INVALID_SCORE citizen=${citizenId} merchant=${merchantId}`);
    }
    return score;
  },
};
