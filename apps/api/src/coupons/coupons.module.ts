import { OWNER_DIRECTORY } from './application/ports/owner-directory';
import { JsonOwnerDirectory } from './infrastructure/json-owner-directory';
import { COUPON_REPOSITORY } from './application/ports/coupon.repository';
import { CANDIDATE_SOURCE } from './application/ports/candidate-source';
import { Module } from '@nestjs/common';

import { resolveDataDir } from '../shared/infrastructure/data-dir';
import { DATA_DIR } from '../shared/infrastructure/data-dir.token';
import { JsonCandidateSource } from './infrastructure/json-candidate-source';
import { JsonCouponRepository } from './infrastructure/json-coupon.repository';
import { CouponsController } from './presentation/coupons.controller';
import { CouponsService, ISSUE_CLOCK, ISSUE_RANDOM } from './application/coupons.service';

@Module({
  controllers: [CouponsController],
  providers: [
    CouponsService,
    { provide: OWNER_DIRECTORY, useClass: JsonOwnerDirectory },
    { provide: COUPON_REPOSITORY, useClass: JsonCouponRepository },
    { provide: CANDIDATE_SOURCE, useClass: JsonCandidateSource },
    { provide: DATA_DIR, useFactory: resolveDataDir },
    { provide: ISSUE_CLOCK, useValue: () => new Date() },
    { provide: ISSUE_RANDOM, useValue: () => Math.random() },
  ],
})
export class CouponsModule {}
