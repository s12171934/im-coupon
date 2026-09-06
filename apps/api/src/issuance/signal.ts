import type { Citizen, Merchant, SignalWeights } from '@im-coupon/contracts';

/**
 * 발급 후보 — 발급 대상이 될 수 있는 가맹점×시민 쌍.
 *
 * 가맹점·시민을 계약 타입 그대로 품는다. 발급이 쿠폰에 굳히는 스냅샷(가맹점 id·명,
 * 소유자 id·명)이 여기서 모두 나오고, 이후 에픽의 신호가 다른 필드를 보게 되어도
 * 이 타입을 넓히지 않아도 된다.
 */
export interface Candidate {
  merchant: Merchant;
  citizen: Citizen;
}

/**
 * 신호가 점수를 매길 때 쓰는 주변값. 전역 `Math.random` 을 신호가 직접 읽지 않고
 * 여기로 받아, 테스트가 고정 값으로 결정적으로 판정한다. 시계처럼 다른 주변값이
 * 필요한 신호가 생기면 그때 이 인터페이스에 필드를 더한다.
 */
export interface SignalContext {
  /** `0` 이상 `1` 미만의 난수. 테스트는 고정 수열 스텁을 준다 */
  random: () => number;
}

/** 발급 후보 하나에 `0` 이상 점수를 주는 단위. 신호가 늘면 이 인터페이스의 구현이 는다. */
export interface Signal {
  /**
   * 결합 엔진이 어느 발급 가중치와 곱할지 아는 키. 키 집합을 계약의 `SignalWeights`
   * 에서 끌어와, 신호가 가중치에 없는 키를 쓰면 컴파일 오류가 나게 한다. 반대 방향 —
   * 가중치에 키를 더하고 신호를 빠뜨리는 것 — 은 이 타입이 막지 못하며, 결합 엔진이
   * 신호 목록을 받는 형태로 막는다.
   */
  key: keyof SignalWeights;
  score(candidate: Candidate, context: SignalContext): number;
}
