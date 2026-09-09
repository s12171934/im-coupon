import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@im-coupon/contracts';

import { HealthService } from '../application/health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): Promise<HealthResponse> {
    return this.health.check();
  }
}
