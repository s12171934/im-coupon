import { Body, Controller, Post } from '@nestjs/common';
import type { IssueCouponRequest, IssueCouponResponse } from '@im-coupon/contracts';
import { ISSUE_COUPON_PATH } from '@im-coupon/contracts';

import { manualTrigger } from '../issuance/manual-trigger';
import { CouponsService } from './coupons.service';

/**
 * 앱이 붙이는 전역 접두. 계약 상수에서 이만큼 덜어 낸 것이 컨트롤러가 선언할 경로다 —
 * 경로의 뒷부분을 손으로 다시 적으면 계약과 어긋날 수 있고, 잘라 쓰면 그 어긋남이 없다.
 *
 * 이 값이 계약 상수와 어긋나면 잘라 낸 자리가 그만큼 빗나가고, 계약 상수로 요청을 보내는
 * 이 폴더의 단위 테스트가 `404` 로 곧바로 짚는다. 짚지 못하는 것은 반대쪽이 갈라질 때뿐이다 —
 * `main.ts` 의 `setGlobalPrefix` 가 다른 접두를 붙이면 앱을 손수 띄우는 단위 테스트는 자기가
 * 접두를 정하므로 그대로 통과한다. 그쪽은 빌드 산출물을 띄우는 e2e 가 짚는다.
 */
const GLOBAL_PREFIX = '/api';
const ISSUE_ROUTE = ISSUE_COUPON_PATH.slice(GLOBAL_PREFIX.length);

/**
 * 발급 엔드포인트 — 시연 트리거의 진입점.
 *
 * 하는 일은 요청 본문을 시연 트리거에 넘겨 발급 명령으로 옮기고 그것을 발급 유스케이스에
 * 넘기는 것뿐이다. 이후 에픽의 트리거는 각자의 계기에서 같은 명령을 만들어 같은 유스케이스를
 * 부르므로, 컨트롤러가 유스케이스를 직접 부르지 않고 트리거를 거치는 이 형태가 그 자리를 남긴다.
 *
 * 발급 가중치는 여기서 손대지 않는다 — 지정하지 않은 값 걷어내기도, `null` 거부도, 기본값
 * 채우기도 병합을 맡은 엔진 한 곳의 몫이고, 걷어내는 자리를 늘리면 두 자리의 판정이 어긋날 때
 * 조용히 다른 결과가 난다.
 */
@Controller()
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Post(ISSUE_ROUTE)
  issue(@Body() body: IssueCouponRequest | undefined): Promise<IssueCouponResponse> {
    return this.coupons.issue(manualTrigger.toCommand(body));
  }
}
