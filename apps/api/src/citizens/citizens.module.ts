import { Module } from '@nestjs/common';

import { resolveDataDir } from '../data-dir';
import { DATA_DIR } from '../data-dir.token';
import { CitizenDirectory } from './citizen-directory';
import { CitizensController } from './citizens.controller';

@Module({
  controllers: [CitizensController],
  providers: [CitizenDirectory, { provide: DATA_DIR, useFactory: resolveDataDir }],
})
export class CitizensModule {}
