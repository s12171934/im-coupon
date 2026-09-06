import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { CitizensModule } from './citizens/citizens.module';
import { CouponsModule } from './coupons/coupons.module';
import { IssuanceErrorFilter } from './coupons/presentation/issuance-error.filter';
import { HealthModule } from './health/health.module';

/**
 * 오류 필터를 전역으로 등록한다. 컨트롤러에 붙이면 라우트에 닿기 전에 나는 실패 —
 * 본문 파싱 실패가 그렇다 — 를 지나치므로, 오류 응답 본문이 경로에 따라 두 모양으로 갈린다.
 */
@Module({
  imports: [HealthModule, CouponsModule, CitizensModule],
  providers: [{ provide: APP_FILTER, useClass: IssuanceErrorFilter }],
})
export class AppModule {}
