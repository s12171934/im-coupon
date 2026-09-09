import { Module } from "@nestjs/common";

import { resolveDataDir } from "../shared/infrastructure/data-dir";
import { DATA_DIR } from "../shared/infrastructure/data-dir.token";
import { ConsumptionController } from "./consumption.controller";
import { ConsumptionService } from "./consumption.service";

@Module({
  controllers: [ConsumptionController],
  providers: [
    ConsumptionService,
    { provide: DATA_DIR, useFactory: resolveDataDir },
  ],
})
export class ConsumptionModule {}
