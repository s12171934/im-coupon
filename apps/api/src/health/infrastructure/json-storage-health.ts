import { Inject, Injectable } from '@nestjs/common';
import { JsonFileDb } from '@im-coupon/db';
import type { HealthResponse } from '@im-coupon/contracts';

import { DATA_DIR } from '../../shared/infrastructure/data-dir.token';
import type { StorageHealth } from '../application/ports/storage-health';

@Injectable()
export class JsonStorageHealth implements StorageHealth {
  private readonly db: JsonFileDb;

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.db = new JsonFileDb(dataDir);
  }

  check(): Promise<HealthResponse['storage']> {
    return this.db.checkHealth();
  }
}
