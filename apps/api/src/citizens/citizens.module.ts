import { CitizensService } from './application/citizens.service';
import { CITIZEN_DIRECTORY } from './application/ports/citizen-directory';
import { Module } from '@nestjs/common';

import { resolveDataDir } from '../shared/infrastructure/data-dir';
import { DATA_DIR } from '../shared/infrastructure/data-dir.token';
import { JsonCitizenDirectory } from './infrastructure/json-citizen-directory';
import { CitizensController } from './presentation/citizens.controller';

@Module({
  controllers: [CitizensController],
  providers: [CitizensService, { provide: CITIZEN_DIRECTORY, useClass: JsonCitizenDirectory }, { provide: DATA_DIR, useFactory: resolveDataDir }],
})
export class CitizensModule {}
