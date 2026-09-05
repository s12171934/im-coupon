import type { Citizen } from './citizen';
import type { Coupon } from './coupon';

/** 쿠폰 발급 */
export const ISSUE_COUPON_PATH = '/api/coupons/issue' as const;
/** 내 쿠폰 조회. `OWNER_ID_QUERY` 쿼리로 소유자를 지정한다 */
export const COUPONS_PATH = '/api/coupons' as const;
/** 내 쿠폰 조회에서 소유자를 지정하는 쿼리 키 */
export const OWNER_ID_QUERY = 'ownerId' as const;
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
export interface IssueCouponRequest {
  /**
   * 발급 가중치 부분 덮어쓰기. 지정한 신호만 덮어쓰고, 지정하지 않은 신호는
   * 발급 파라미터 기본값으로 채운다. 생략하거나 `{}` 로 보내면 전부 기본값이다.
   * `INVALID_WEIGHTS` 의 값 검증은 이 본문이 아니라 병합 후 가중치에 걸린다.
   */
  weights?: Partial<SignalWeights>;
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
  coupon: Coupon;
  decision: IssueDecision;
}

/** `issuedAt` 내림차순이고, 소유한 쿠폰이 없으면 빈 배열이다. */
export interface ListCouponsResponse {
  coupons: Coupon[];
}

/** 시드에 든 순서 그대로다. */
export interface ListCitizensResponse {
  citizens: Citizen[];
}

export type ApiErrorCode =
  /** 요청 본문이 JSON 으로 파싱되지 않거나 `weights` 가 객체가 아님 */
  | 'INVALID_BODY'
  /**
   * 병합된 발급 가중치의 값이 숫자가 아니거나 음수이거나 합이 0, 또는 요청에
   * 모르는 신호 키가 있음. 마지막 하나만 병합 전 요청 본문에 대한 검사다
   */
  | 'INVALID_WEIGHTS'
  /** `merchants` 또는 `citizens` 가 비어 발급 후보가 없음 */
  | 'NO_CANDIDATES'
  /** `OWNER_ID_QUERY` 쿼리가 없거나 빈 문자열 */
  | 'MISSING_OWNER_ID'
  /** `citizens` 에 없는 `OWNER_ID_QUERY` 값 */
  | 'UNKNOWN_OWNER'
  /** JSON 파일 읽기·쓰기 실패 */
  | 'STORAGE_FAILURE';

/** 오류 응답 본문. 세 엔드포인트가 같은 형태를 쓴다. */
export interface ApiErrorResponse {
  error: { code: ApiErrorCode; message: string };
}
