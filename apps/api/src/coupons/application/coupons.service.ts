import { Inject, Injectable } from '@nestjs/common';
import type { Coupon, IssueCouponResponse, SignalWeights, TriggerType } from '@im-coupon/contracts';
import { randomUUID } from 'node:crypto';

import { selectCandidate } from '../../issuance/domain/services/engine';
import { DEFAULT_ISSUANCE_PARAMS } from '../../issuance/domain/params';
import { randomSignal } from '../../issuance/domain/signals/implementations/random-signal';
import type { Candidate, Signal } from '../../issuance/domain/signals/signal';
import type { IssueCommand } from '../../issuance/domain/triggers/issue-trigger';
import { CANDIDATE_SOURCE, type CandidateSource } from './ports/candidate-source';
import { COUPON_REPOSITORY, type CouponRepository } from './ports/coupon.repository';

/**
 * 발급 시각을 공급하는 자리의 주입 토큰. 전역 `Date.now` 를 유스케이스가 직접 읽으면
 * 두 기한이 실행 시각에 매달려 테스트가 자릿수까지 판정할 수 없다.
 */
export const ISSUE_CLOCK = 'ISSUE_CLOCK';
/** 신호에 넘길 난수의 주입 토큰. `SignalContext.random` 과 같은 모양이다. */
export const ISSUE_RANDOM = 'ISSUE_RANDOM';

/** 하루의 길이. 두 기한 파라미터가 일 단위라 절대 시각으로 옮길 때 쓴다. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 신호 키마다 점수를 낼 신호. 이번 에픽의 신호가 랜덤 하나뿐이라 상수로 둔다 —
 * 신호가 늘면 `Record<keyof SignalWeights, Signal>` 이 구현 누락을 컴파일에서 잡는다.
 */
const SIGNALS: Record<keyof SignalWeights, Signal> = { random: randomSignal };

/**
 * 발급 유스케이스 — 발급 후보 적재 → 발급 가중치 검증·결합 → 쿠폰 생성 → 저장.
 *
 * 가중치를 여기서 보지 않는다. 병합과 검증은 `selectCandidate` 한 곳이다. 발급 후보가
 * 0건인 것도 보지 않는다 — 빈 목록의 거부도 같은 자리의 몫이다.
 *
 * 이 단계 순서가 오류 우선순위의 앞머리를 진다. 적재를 먼저 부르므로 읽기 실패가 가중치
 * 거부보다 앞선다. 그 뒤 둘의 순서는 이 파일이 지는 것이 아니라 엔진이 진다 —
 * `selectCandidate` 가 병합·검증을 후보 순회보다 먼저 해서 가중치 거부가 발급 후보 없음보다
 * 앞서고, 여기서는 두 거부를 한 호출에 모아 그 순서를 그대로 받을 뿐이다.
 *
 * 설계가 예상하는 실패는 전부 `IssuanceError` 로 올라온다 — 엔진의 거부와, 적재·저장이 감싼
 * 파일 IO 실패다. 여기서 다시 감싸는 자리를 만들지 않는다. 그 밖의 예외는 감싸지 않고
 * 그대로 지나가게 둔다 — 주입된 난수나 신호 구현이 던지는 것이 거기 해당한다.
 */
@Injectable()
export class CouponsService {
  constructor(
    @Inject(CANDIDATE_SOURCE) private readonly candidates: CandidateSource,
    @Inject(COUPON_REPOSITORY) private readonly coupons: CouponRepository,
    @Inject(ISSUE_CLOCK) private readonly now: () => Date,
    @Inject(ISSUE_RANDOM) private readonly random: () => number,
  ) {}

  async issue(command: IssueCommand): Promise<IssueCouponResponse> {
    const candidates = await this.candidates.load();
    const { candidate, decision } = selectCandidate({
      candidates,
      signals: SIGNALS,
      weights: command.weights,
      context: { random: this.random },
    });

    const coupon = this.mint(candidate, command.trigger);
    await this.coupons.append(coupon);

    return { coupon, decision };
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
  private mint(candidate: Candidate, trigger: TriggerType): Coupon {
    const { faceValue, benefitSplit, ownerHoldDays, openValidDays } = DEFAULT_ISSUANCE_PARAMS;
    const issuedAt = this.now();
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
