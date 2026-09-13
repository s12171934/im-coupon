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

/**
 * 발급 후보 하나에 `0` 이상 점수를 주는 단위. 신호가 늘면 이 인터페이스의 구현이 는다.
 *
 * 타입 인자 둘 다 기본값을 들어, 인자 없는 `Signal` 이 이전과 같은 타입으로 남는다 —
 * 이미 `Signal` 로 적혀 있는 자리(`randomSignal`, 엔진의 `SelectCandidateInput.signals`,
 * 발급 유스케이스의 신호 맵)를 한 글자도 고치지 않고 확장하기 위한 형태다.
 *
 * `C` 는 그 신호가 점수를 내는 데 필요한 주변값이다. 기본 `SignalContext` 로는 모자란
 * 신호 — 이력처럼 미리 준비한 값을 읽어야 하는 신호 — 가 `SignalContext` 를 확장한
 * 타입을 주고 자기 요구를 타입으로 적는다.
 *
 * `score` 를 메서드가 아니라 함수 타입 프로퍼티로 적는 이유가 여기 있다. 메서드로 적으면
 * 매개변수가 양변성으로 비교되어, 키만 맞으면 확장 context 를 요구하는 신호도 기본
 * `Signal` 자리에 그대로 들어간다 — 엔진이 넘기는 context 에 그 필드가 없어도 컴파일이
 * 통과하고 런타임에 가서야 터진다. 프로퍼티로 적으면 매개변수가 반변으로 비교되어,
 * 그런 신호는 엔진의 context 타입이 요구를 갖추기 전까지 신호 맵에 들어가지 못한다.
 */
export interface Signal<
  K extends string = keyof SignalWeights,
  C extends SignalContext = SignalContext,
> {
  /**
   * 이 신호가 어느 발급 가중치와 짝인지에 대한 신호 자신의 선언. 타입 인자를 주지 않으면
   * 키 집합이 계약의 `SignalWeights` 로 좁혀져, 신호가 가중치에 없는 키를 쓰면 여기서
   * 컴파일 오류가 난다. 가중치에 아직 키가 없는 신호는 `Signal<'키'>` 로 키를 직접 적어
   * 그 제약 밖에 선다 — `SignalWeights` 는 web 까지 함께 보는 계약이라 가중치를 늘리는
   * 것이 도메인 밖 변경을 부르므로, 도메인 안에서 신호를 먼저 세우는 길을 남긴다.
   *
   * 반대 방향 — 가중치에 키를 더하고 신호 구현을 빠뜨리는 것 — 은 이 타입이 막지
   * 못하며, 결합 엔진이 신호를 `Record<keyof SignalWeights, Signal>` 로 받는 형태
   * (`SelectCandidateInput.signals`)가 막는다. 키를 직접 적은 신호는 그 맵에 들어가지
   * 않는 동안 어느 쪽 검사도 받지 않으므로, 맵에 등록하는 시점이 그 신호의 키와 가중치를
   * 맞추는 자리다.
   *
   * 두 자리가 어긋날 수 있으므로 엔진은 맵의 키만 신뢰하고 이 필드를 조회에 쓰지 않는다.
   */
  key: K;
  score: (candidate: Candidate, context: C) => number;
}
