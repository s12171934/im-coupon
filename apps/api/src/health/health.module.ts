import { Module } from '@nestjs/common';

import { DATA_DIR } from '../data-dir.token';
import { resolveDataDir } from '../data-dir';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, { provide: DATA_DIR, useFactory: resolveDataDir }],
})
export class HealthModule {}
