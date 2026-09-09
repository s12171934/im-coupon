/**
 * 쿠폰의 상태. 발급 이후 상태의 이름과 수는 기획 노선이 정해지지 않았으므로,
 * 지금 추측한 값을 미리 넣어 결정을 조용히 닫지 않는다. 라이프사이클 에픽이 값을 늘린다.
 */
export type IssuedCouponStatus = 'held';

/**
 * 발급을 일으킨 트리거의 유형. 소비 도달·참여 리워드·가맹점 요청 값은
 * 각 트리거를 구현하는 에픽에서 여기에 추가한다.
 */
export type TriggerType = 'manual';

/** 액면을 소유자 몫과 소비자 몫으로 나누는 비율. 각 `0..1` 이고 합이 `1` 이다. */
export interface BenefitSplit {
  ownerRatio: number;
  consumerRatio: number;
}

/**
 * 발급된 쿠폰 한 건.
 *
 * 가맹점명·소유자명·액면·배분 비율·두 기한은 발급 시점의 스냅샷이다. 배분 비율과 기한은
 * 거래조건 고지 대상이라, 발급 뒤에 파라미터 기본값이 바뀌어도 이미 발급된 쿠폰의 고지
 * 내용이 따라 바뀌면 안 된다. 부수 효과로 내 쿠폰 조회가 이 컬렉션 하나로 닫혀 조인이 없다.
 */
export interface IssuedCoupon {
  /** `cpn-` 접두 + UUID. `coupons` 컬렉션 안에서 유일하다 */
  id: string;
  status: IssuedCouponStatus;
  trigger: TriggerType;
  /** `citizens.id` 참조 */
  ownerId: string;
  ownerName: string;
  /** `merchants.id` 참조 */
  merchantId: string;
  merchantName: string;
  /** 양의 정수(원) */
  faceValue: number;
  benefitSplit: BenefitSplit;
  /** ISO 8601 */
  issuedAt: string;
  /**
   * 소유자 점유 기한의 끝. ISO 8601 이며 `issuedAt` 이후다.
   * 파라미터(일수)가 아니라 절대 시각으로 굳혀, 화면과 테스트가 계산 없이 판정한다.
   */
  heldUntil: string;
  /**
   * 유효 소비 기한의 끝. ISO 8601 이며 `heldUntil` 이후다.
   * 두 기한 모두 등호 없는 "이후"이므로, 기한을 만드는 두 일수 파라미터는 양수여야 한다.
   */
  expiresAt: string;
}
