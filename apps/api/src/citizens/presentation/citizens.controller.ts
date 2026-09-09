import { Controller, Get } from '@nestjs/common';
import type { ListCitizensResponse } from '@im-coupon/contracts';
import { CITIZENS_PATH } from '@im-coupon/contracts';

import { CitizensService } from '../application/citizens.service';

/**
 * 앱이 붙이는 전역 접두. 계약 상수에서 이만큼 덜어 낸 것이 컨트롤러가 선언할 경로다 —
 * 경로의 뒷부분을 손으로 다시 적으면 계약과 어긋날 수 있고, 잘라 쓰면 그 어긋남이 없다.
 * 가름의 근거는 `coupons/coupons.controller.ts` 의 같은 상수에 적혀 있다.
 */
const GLOBAL_PREFIX = '/api';
const LIST_ROUTE = CITIZENS_PATH.slice(GLOBAL_PREFIX.length);

/**
 * 시민 목록 엔드포인트 — 내 쿠폰 화면의 소유자 선택을 채운다.
 *
 * 볼 요청 모양이 없다. 쿼리도 본문도 받지 않으므로 이 층이 거부할 것이 없고, 남는 실패는
 * 컬렉션 읽기뿐이라 `readCollection` 이 올린 `IssuanceError` 를 전역 오류 필터가
 * 그대로 8장의 오류 응답으로 옮긴다 (4장 결정 11).
 */
@Controller()
export class CitizensController {
  constructor(private readonly citizens: CitizensService) {}

  @Get(LIST_ROUTE)
  async list(): Promise<ListCitizensResponse> {
    return this.citizens.list();
  }
}
