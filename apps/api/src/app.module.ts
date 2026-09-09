import { Module } from "@nestjs/common";

import { HealthModule } from "./health/health.module";
import { ConsumptionModule } from "./consumption/consumption.module";

@Module({ imports: [HealthModule, ConsumptionModule] })
export class AppModule {}
