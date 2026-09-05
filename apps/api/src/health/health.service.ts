import { Inject, Injectable } from '@nestjs/common';
import type { HealthResponse } from '@im-coupon/contracts';
import { JsonFileDb } from '@im-coupon/db';

import { DATA_DIR } from '../data-dir.token';

@Injectable()
export class HealthService {
  private readonly db: JsonFileDb;

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.db = new JsonFileDb(dataDir);
  }

  async check(): Promise<HealthResponse> {
    const storage = await this.db.checkHealth();
    return { status: storage.readable ? 'ok' : 'degraded', storage };
  }
}
