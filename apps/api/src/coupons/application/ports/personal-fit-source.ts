import type { Candidate } from '../../../issuance/domain/signals/signal';
import type { PreparedPersonalFit } from '../../../issuance/domain/signals/implementations/personal-fit-input';

/** 외부 이력을 발급 요청 시점의 시민별 점수로 준비한다. */
export interface PersonalFitSource {
  prepare(candidates: readonly Candidate[], asOf: number): Promise<ReadonlyMap<string, PreparedPersonalFit>>;
}
export const PERSONAL_FIT_SOURCE = Symbol('PERSONAL_FIT_SOURCE');
