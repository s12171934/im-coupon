import { SALES_RECOVERY_SOURCE, type SalesRecoverySource } from './ports/sales-recovery-source';
import { PERSONAL_FIT_SOURCE, type PersonalFitSource } from './ports/personal-fit-source';
import { personalFitSignal } from '../../issuance/domain/signals/implementations/personal-fit-signal';
import type { PersonalFitContext } from '../../issuance/domain/signals/implementations/personal-fit-input';
import { OWNER_DIRECTORY, type OwnerDirectory } from './ports/owner-directory';
import { Inject, Injectable } from '@nestjs/common';
import type {
  IssuedCoupon,
  IssueCouponResponse,
  ListCouponsResponse,
  SignalWeights,
  TriggerType,
} from '@im-coupon/contracts';
import { randomUUID } from 'node:crypto';

import { IssuanceError, selectCandidate, resolveWeights } from '../../issuance/domain/services/engine';
import { DEFAULT_ISSUANCE_PARAMS } from '../../issuance/domain/params';
import type { Candidate } from '../../issuance/domain/signals/signal';
import type { IssueCommand } from '../../issuance/domain/triggers/issue-trigger';
import { CANDIDATE_SOURCE, type CandidateSource } from './ports/candidate-source';
import { COUPON_REPOSITORY, type CouponRepository } from './ports/coupon.repository';

/**
 * 발급 시각을 공급하는 자리의 주입 토큰. 전역 `Date.now` 를 유스케이스가 직접 읽으면
 * 두 기한이 실행 시각에 매달려 테스트가 자릿수까지 판정할 수 없다.
 */
export const ISSUE_CLOCK = 'ISSUE_CLOCK';

/** 하루의 길이. 두 기한 파라미터가 일 단위라 절대 시각으로 옮길 때 쓴다. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 시민 지정 → 통계·개인화 준비 → 가중평균 선택 → 쿠폰 저장. */
@Injectable()
export class CouponsService {
  constructor(
    @Inject(CANDIDATE_SOURCE) private readonly candidates: CandidateSource,
    @Inject(COUPON_REPOSITORY) private readonly coupons: CouponRepository,
    @Inject(OWNER_DIRECTORY) private readonly owners: OwnerDirectory,
    @Inject(ISSUE_CLOCK) private readonly now: () => Date,
    @Inject(SALES_RECOVERY_SOURCE) private readonly recovery: SalesRecoverySource,
    @Inject(PERSONAL_FIT_SOURCE) private readonly personalFit: PersonalFitSource,
  ) {}

  async issue(command: IssueCommand): Promise<IssueCouponResponse> {
    if(typeof command.citizenId!=='string' || !command.citizenId.trim())
      throw new IssuanceError('MISSING_CITIZEN_ID','발급받을 시민을 선택해 주세요.');
    if(!(await this.owners.has(command.citizenId)))
      throw new IssuanceError('UNKNOWN_CITIZEN','선택한 시민이 존재하지 않습니다.');
    const requestedWeights=resolveWeights(command.weights);
    const candidates = (await this.candidates.load()).filter(c=>c.citizen.id===command.citizenId);
    const recovery=await this.recovery.prepare(candidates);
    const appliedWeights=recovery.enabled ? requestedWeights : {personalFit:requestedWeights.personalFit || 1,salesRecovery:0};
    const issuedAt = this.now();
    const personalFitByCitizenId = await this.personalFit.prepare(candidates, issuedAt.getTime());
    const { candidate, decision } = selectCandidate<PersonalFitContext>({
      candidates,
      signals: {personalFit:personalFitSignal,salesRecovery:{key:'salesRecovery',score:(candidate)=>recovery.enabled ? recovery.byMerchantId.get(candidate.merchant.id)?.score ?? 0 : 0}},
      weights: appliedWeights,
      context: { personalFitByCitizenId },
    });

    const coupon = this.mint(candidate, command.trigger, issuedAt);
    const prepared = personalFitByCitizenId.get(candidate.citizen.id);
    decision.personalFit = prepared
      ? { enabled: prepared.enabled, reason: prepared.reason }
      : { enabled: false, reason: 'NO_HISTORY' };
    const selectedRecovery=recovery.byMerchantId.get(candidate.merchant.id);
    decision.requestedWeights=requestedWeights;
    decision.appliedWeights=appliedWeights;
    if(!recovery.enabled) decision.scores.salesRecovery=null;
    decision.salesRecovery={enabled:recovery.enabled && appliedWeights.salesRecovery>0,
      reason:!recovery.enabled ? recovery.reason : appliedWeights.salesRecovery===0 ? '회복 가중치가 0으로 설정되어 개인화만 적용했습니다.' : null,
      referenceMonth:recovery.referenceMonth,sourceKind:recovery.sourceKind,unavailableMerchants:recovery.unavailableMerchants,
      localDeclineRate:selectedRecovery?.localDeclineRate ?? null,cityDeclineRate:selectedRecovery?.cityDeclineRate ?? null};
    await this.coupons.append(coupon);

    return { coupon, decision };
  }

  /**
   * 내 쿠폰 조회 — 소유자가 든 쿠폰을 모은다.
   *
   * 소유자 확인을 먼저 한다. 쿠폰을 먼저 읽으면 없는 소유자도 빈 배열을 받아 `404` 가
   * 사라지고, 화면은 "쿠폰이 아직 없다"와 "그런 시민이 없다"를 가르지 못한다. 확인이
   * 앞서므로 `UNKNOWN_OWNER` 는 쿠폰이 0건인지와 무관하게 늘 같은 답을 낸다.
   */
  async listByOwner(ownerId: string): Promise<ListCouponsResponse> {
    if (!(await this.owners.has(ownerId))) {
      throw new IssuanceError('UNKNOWN_OWNER', `${ownerId} 는 시민 컬렉션에 없는 소유자다`);
    }
    return { coupons: await this.coupons.findByOwner(ownerId) };
  }

  /**
   * 고른 발급 후보로 쿠폰 레코드를 굳힌다.
   *
   * 가맹점명·소유자명·액면·배분 비율·두 기한은 발급 시점의 스냅샷이다. 거래조건 고지
   * 대상이라 발급 뒤에 파라미터 기본값이 바뀌어도 이미 발급된 쿠폰의 고지 내용이 따라
   * 바뀌면 안 된다. 배분 비율을 펼쳐 복사하는 것도 그래서다 — 상수의 객체를 그대로
   * 실으면 응답으로 나간 쿠폰과 발급 파라미터가 같은 객체를 가리킨다.
   *
   * 두 기한은 일수가 아니라 절대 시각으로 저장한다. 화면과 테스트가 계산 없이 판정하고,
   * 파라미터를 고쳐도 이미 발급된 쿠폰의 기한이 소급해 움직이지 않게 하는 것이다.
   */
  private mint(candidate: Candidate, trigger: TriggerType, issuedAt: Date): IssuedCoupon {
    const { faceValue, benefitSplit, ownerHoldDays, openValidDays } = DEFAULT_ISSUANCE_PARAMS;
    const heldUntil = new Date(issuedAt.getTime() + ownerHoldDays * DAY_MS);
    const expiresAt = new Date(heldUntil.getTime() + openValidDays * DAY_MS);

    return {
      id: `cpn-${randomUUID()}`,
      status: 'held',
      trigger,
      ownerId: candidate.citizen.id,
      ownerName: candidate.citizen.name,
      merchantId: candidate.merchant.id,
      merchantName: candidate.merchant.name,
      faceValue,
      benefitSplit: { ...benefitSplit },
      issuedAt: issuedAt.toISOString(),
      heldUntil: heldUntil.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }
}
