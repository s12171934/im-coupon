import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import type {
  ConsumptionActionResponse,
  ConsumptionSnapshot,
  ReserveCouponRequest,
  ConsumeCouponRequest,
} from "@im-coupon/contracts";

import { ConsumptionService } from "./consumption.service";

@Controller("consumption")
export class ConsumptionController {
  constructor(private readonly consumption: ConsumptionService) {}

  @Get()
  snapshot(): Promise<ConsumptionSnapshot> {
    return this.consumption.snapshot();
  }

  @Delete()
  reset(): Promise<ConsumptionActionResponse> {
    return this.consumption.reset();
  }

  @Post("coupons/:couponId/reserve")
  reserve(
    @Param("couponId") couponId: string,
    @Body() request: ReserveCouponRequest,
  ): Promise<ConsumptionActionResponse> {
    return this.consumption.reserve(couponId, request?.consumerId);
  }

  @Post("coupons/:couponId/simulate-owner-expiry")
  simulateOwnerExpiry(
    @Param("couponId") couponId: string,
  ): Promise<ConsumptionActionResponse> {
    return this.consumption.simulateOwnerExpiry(couponId);
  }

  @Post("coupons/:couponId/consume")
  consume(
    @Param("couponId") couponId: string,
    @Body() request: ConsumeCouponRequest,
  ): Promise<ConsumptionActionResponse> {
    return this.consumption.consume(couponId, request?.consumerId);
  }
}
