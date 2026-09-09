import type { BenefitSplit, SignalWeights } from '@im-coupon/contracts';

/**
 * 발급 파라미터. 발급이 쿠폰에 굳히는 값과 발급 후보 선택에 쓰는 발급 가중치를 함께 든다.
 * 발급 가중치만 요청 본문으로 부분 덮어쓸 수 있고, 나머지는 상수로만 온다.
 */
export interface IssuanceParams {
  /** 액면(원) */
  faceValue: number;
  benefitSplit: BenefitSplit;
  /** 소유자 점유 기한(일). 1 이상의 정수 */
  ownerHoldDays: number;
  /** 유효 소비 기한(일). 1 이상의 정수 */
  openValidDays: number;
  /** 신호별 발급 가중치. 요청이 지정하지 않은 신호는 여기 값으로 채운다 */
  weights: SignalWeights;
}

/**
 * 시연 기본값. 설계문서의 파라미터 값 표를 코드에서 드는 유일한 자리이므로,
 * 이 수치가 다른 파일(테스트 포함)에 다시 등장하면 안 된다 — 값을 알아야 하는 쪽은
 * 수를 적지 말고 여기서 끌어다 쓴다.
 *
 * `ownerHoldDays`·`openValidDays` 는 1 이상의 정수라는 제약이 있으나 요청 본문으로
 * 들어오지 않고 이 상수로만 오므로 런타임 검증을 두지 않는다 — 범위를 지키는 것은
 * 이 상수를 고치는 쪽의 몫이다.
 */
export const DEFAULT_ISSUANCE_PARAMS: IssuanceParams = {
  faceValue: 5000,
  benefitSplit: { ownerRatio: 0.2, consumerRatio: 0.8 },
  ownerHoldDays: 3,
  openValidDays: 2,
  weights: { random: 1 },
};
