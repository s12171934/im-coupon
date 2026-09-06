import { Module } from '@nestjs/common';

import { resolveDataDir } from '../data-dir';
import { DATA_DIR } from '../data-dir.token';
import { CandidateSource } from './candidate-source';
import { CouponRepository } from './coupon.repository';
import { CouponsController } from './coupons.controller';
import { CouponsService, ISSUE_CLOCK, ISSUE_RANDOM } from './coupons.service';

@Module({
  controllers: [CouponsController],
  providers: [
    CouponsService,
    CouponRepository,
    CandidateSource,
    { provide: DATA_DIR, useFactory: resolveDataDir },
    { provide: ISSUE_CLOCK, useValue: () => new Date() },
    { provide: ISSUE_RANDOM, useValue: () => Math.random() },
  ],
})
export class CouponsModule {}
