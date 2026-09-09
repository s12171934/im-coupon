import type { Citizen } from './citizen';
import type { IssuedCoupon } from './coupon';

/** 쿠폰 발급 */
export const ISSUE_COUPON_PATH = '/api/coupons/issue' as const;
/** 내 쿠폰 조회. `ownerId` 쿼리로 소유자를 지정한다 */
export const COUPONS_PATH = '/api/coupons' as const;
/** 시민 목록 */
export const CITIZENS_PATH = '/api/citizens' as const;

/**
 * 발급 신호별 가중치. 이번 에픽은 랜덤 신호 하나만 구현하지만 결합 구조는 남겨 두어,
 * 제외된 네 신호를 이후 에픽이 같은 틀로 키만 더해 확장한다.
 */
export interface SignalWeights {
  random: number;
}

/** 요청 본문은 생략 가능하고, 생략하면 발급 파라미터 기본값으로 발급한다. */
export interface IssuanceRequest {
  /** 발급 가중치 덮어쓰기. `SignalWeights` 전체를 교체하며, 일부 신호만 지정하는 형태는 없다 */
  weights?: SignalWeights;
}

/** 시연에서 "왜 이 후보인가"를 보여주는 부속 정보. 쿠폰 자체에는 남기지 않는다. */
export interface IssueDecision {
  /** 점수를 매긴 발급 후보 수 */
  candidateCount: number;
  /**
   * 선택된 발급 후보의 신호별 점수. 키 집합을 `SignalWeights` 에서 끌어와,
   * 신호가 늘 때 가중치에만 키를 더하고 점수에 빠뜨리면 컴파일 오류가 나게 한다.
   */
  scores: Record<keyof SignalWeights, number>;
  /** 발급 가중치를 곱해 합산한 총점 */
  total: number;
}

export interface IssueCouponResponse {
  coupon: IssuedCoupon;
  decision: IssueDecision;
}

/** `issuedAt` 내림차순이고, 소유한 쿠폰이 없으면 빈 배열이다. */
export interface ListCouponsResponse {
  coupons: IssuedCoupon[];
}

/** 시드에 든 순서 그대로다. */
export interface ListCitizensResponse {
  citizens: Citizen[];
}

export type ApiErrorCode =
  /** 발급 가중치가 숫자가 아니거나 음수이거나 합이 0, 또는 모르는 신호 키 */
  | 'INVALID_WEIGHTS'
  /** `merchants` 또는 `citizens` 가 비어 발급 후보가 없음 */
  | 'NO_CANDIDATES'
  /** `ownerId` 쿼리가 없거나 빈 문자열 */
  | 'MISSING_OWNER_ID'
  /** `citizens` 에 없는 `ownerId` */
  | 'UNKNOWN_OWNER'
  /** JSON 파일 읽기·쓰기 실패 */
  | 'STORAGE_FAILURE';

/** 오류 응답 본문. 세 엔드포인트가 같은 형태를 쓴다. */
export interface ApiErrorResponse {
  error: { code: ApiErrorCode; message: string };
}
