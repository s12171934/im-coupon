import { Module } from '@nestjs/common';

import { DATA_DIR } from '../shared/infrastructure/data-dir.token';
import { resolveDataDir } from '../shared/infrastructure/data-dir';
import { HealthController } from './presentation/health.controller';
import { HealthService } from './application/health.service';

import { STORAGE_HEALTH } from './application/ports/storage-health';
import { JsonStorageHealth } from './infrastructure/json-storage-health';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: STORAGE_HEALTH, useClass: JsonStorageHealth },
    { provide: DATA_DIR, useFactory: resolveDataDir },
  ],
})
export class HealthModule {}
