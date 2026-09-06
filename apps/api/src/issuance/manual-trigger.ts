import type { IssueCouponRequest } from '@im-coupon/contracts';

import type { IssueTrigger } from './trigger';

/**
 * 시연 트리거 — 이번 에픽의 유일한 트리거이자 발급 엔드포인트의 진입점.
 *
 * 계기는 발급 요청 본문이고, 본문은 생략될 수 있으므로 계기 타입이 `undefined` 를 든다.
 * 하는 일은 본문의 발급 가중치를 발급 명령에 옮겨 싣는 것뿐이다 — 가중치의 검증도, 지정하지
 * 않은 신호를 발급 파라미터 기본값으로 채우는 것도 병합을 맡은 엔진의 몫이라 여기서 하지
 * 않는다. 그래서 이 트리거는 값을 판정하지 않고 받은 그대로 통과시킨다.
 */
export const manualTrigger: IssueTrigger<IssueCouponRequest | undefined, 'manual'> = {
  type: 'manual',
  toCommand: (request) => ({ trigger: 'manual', weights: request?.weights }),
};
