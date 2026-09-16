/** 오래된 공유 패키지로 API를 열어 결제 시점에 500을 내는 대신 기동 때 안내한다. */
export function assertRuntimeContracts(contracts: { couponBenefits?: unknown }): void {
  if (typeof contracts.couponBenefits !== 'function') {
    throw new Error('[im-coupon] 공유 패키지의 couponBenefits 함수가 없습니다. 실행 중인 pnpm dev를 완전히 종료한 뒤 다시 실행하세요. 배포 실행은 pnpm build 후 시작하세요.');
  }
}
