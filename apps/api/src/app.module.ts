import { Module } from '@nestjs/common';

import { CouponsModule } from './coupons/coupons.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [HealthModule, CouponsModule] })
export class AppModule {}
