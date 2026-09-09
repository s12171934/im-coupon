import { Inject, Injectable } from '@nestjs/common';
import type { HealthResponse } from '@im-coupon/contracts';

import { STORAGE_HEALTH, type StorageHealth } from './ports/storage-health';

@Injectable()
export class HealthService {
  constructor(@Inject(STORAGE_HEALTH) private readonly storage: StorageHealth) {}

  async check(): Promise<HealthResponse> {
    const storage = await this.storage.check();
    return { status: storage.readable ? 'ok' : 'degraded', storage };
  }
}
