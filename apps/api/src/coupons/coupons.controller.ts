import { Controller, Post, Req } from '@nestjs/common';
import type { IssueCouponRequest, IssueCouponResponse } from '@im-coupon/contracts';
import { ISSUE_COUPON_PATH } from '@im-coupon/contracts';

import { IssuanceError } from '../issuance/engine';
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
 * 발급 요청에서 이 컨트롤러가 보는 것. 본문뿐 아니라 헤더도 보므로 `@Body()` 가 아니라
 * 요청 자체를 받고, 플랫폼 타입 전체를 끌어오는 대신 보는 두 자리만 적는다.
 */
interface IssueRequest {
  headers: { 'content-type'?: string };
  /** 파서가 JSON 으로 읽어 낸 본문. 파서가 건너뛰었으면 값이 없다 */
  body?: IssueCouponRequest;
}

/**
 * 본문의 모양을 본다 — 8장 1단계다.
 *
 * 두 가지를 본다. 하나는 본문이 JSON 으로 읽혔는가다. 파서가 값을 만들지 못한 요청은
 * 본문을 아예 싣지 않았거나(그때는 정상 발급이다 — 8장이 요청 본문을 생략 가능하다고 둔다),
 * JSON 이 아닌 형식을 선언해 파서가 건너뛴 것이다. 뒤쪽을 통과시키면 `text/plain` 으로 보낸
 * `{"weights":{"random":9}}` 가 조용히 무시된 채 기본값으로 발급되어, 호출자는 자기가 지정한
 * 가중치가 사라진 줄 모르고 `201` 을 받는다. 요청 내용이 소리 없이 버려지는 쪽보다 8장의
 * `INVALID_BODY` 로 돌려주는 쪽이 맞다. 형식 선언의 유무로 둘을 가른다.
 *
 * 다른 하나는 `weights` 가 객체인가다. 키를 들었는데 값이 객체가 아니면 그 본문으로는
 * 가중치를 읽을 수 없다. `typeof` 만으로 판정하지 않는 것은 `typeof null` 과 `typeof []` 가
 * 둘 다 `'object'` 라서다 — 그대로 두면 `null`·`[]` 는 "가중치 없음"으로 읽혀 발급되고,
 * `[1]` 은 인덱스 `0` 이 모르는 신호 키 행세를 해 `INVALID_WEIGHTS` 로 갈린다. 같은 종류의
 * 잘못된 본문이 길이에 따라 다른 코드를 받는 셈이라, 셋을 한 판정으로 모은다.
 *
 * 값이 `undefined` 인 것은 지정하지 않은 것으로 본다. JSON 본문에는 없는 형태지만
 * `Partial<SignalWeights>` 에서 `undefined` 는 "지정하지 않음"이고, 키를 생략한 요청과
 * 결과가 갈리면 안 된다 (8장 2단계).
 */
function checkShape(request: IssueRequest): void {
  if (request.body === undefined) {
    if (request.headers['content-type'] === undefined) return;
    throw new IssuanceError('INVALID_BODY', '요청 본문이 JSON 으로 파싱되지 않았다');
  }

  const weights: unknown = request.body.weights;
  if (weights === undefined) return;
  if (typeof weights !== 'object' || weights === null || Array.isArray(weights)) {
    throw new IssuanceError('INVALID_BODY', '요청 본문의 weights 가 객체가 아니다');
  }
}

/**
 * 발급 엔드포인트 — 시연 트리거의 진입점.
 *
 * 하는 일은 요청 본문을 시연 트리거에 넘겨 발급 명령으로 옮기고 그것을 발급 유스케이스에
 * 넘기는 것뿐이다. 이후 에픽의 트리거는 각자의 계기에서 같은 명령을 만들어 같은 유스케이스를
 * 부르므로, 컨트롤러가 유스케이스를 직접 부르지 않고 트리거를 거치는 이 형태가 그 자리를 남긴다.
 *
 * 본문의 모양(객체인가)은 여기서 본다 — 8장이 `INVALID_BODY` 를 컨트롤러 층에 둔 자리다.
 * 발급 가중치의 **값**은 여기서 손대지 않는다 — 지정하지 않은 값 걷어내기도, `null` 거부도,
 * 기본값 채우기도 병합을 맡은 엔진 한 곳의 몫이고, 걷어내는 자리를 늘리면 두 자리의 판정이
 * 어긋날 때 조용히 다른 결과가 난다. 모양과 값의 경계가 곧 `INVALID_BODY` 와
 * `INVALID_WEIGHTS` 의 경계다.
 */
@Controller()
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Post(ISSUE_ROUTE)
  issue(@Req() request: IssueRequest): Promise<IssueCouponResponse> {
    checkShape(request);
    return this.coupons.issue(manualTrigger.toCommand(request.body));
  }
}
