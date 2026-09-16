import { SALES_RECOVERY_SOURCE } from './application/ports/sales-recovery-source';
import { JsonSalesRecoverySource } from './infrastructure/json-sales-recovery-source';
import { PERSONAL_FIT_SOURCE } from './application/ports/personal-fit-source';
import { JsonPersonalFitSource } from './infrastructure/json-personal-fit-source';
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
import { CouponsService, ISSUE_CLOCK } from './application/coupons.service';

@Module({
  controllers: [CouponsController],
  providers: [
    CouponsService,
    { provide: PERSONAL_FIT_SOURCE, useClass: JsonPersonalFitSource },
    { provide: OWNER_DIRECTORY, useClass: JsonOwnerDirectory },
    { provide: COUPON_REPOSITORY, useClass: JsonCouponRepository },
    { provide: CANDIDATE_SOURCE, useClass: JsonCandidateSource },
    { provide: DATA_DIR, useFactory: resolveDataDir },
    { provide: ISSUE_CLOCK, useValue: () => new Date() },
    { provide: SALES_RECOVERY_SOURCE, useClass: JsonSalesRecoverySource },
  ],
})
export class CouponsModule {}
