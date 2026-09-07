import { Inject, Injectable } from '@nestjs/common';
import type { ListCitizensResponse } from '@im-coupon/contracts';

import { CITIZEN_DIRECTORY, type CitizenDirectory } from './ports/citizen-directory';

@Injectable()
export class CitizensService {
  constructor(@Inject(CITIZEN_DIRECTORY) private readonly citizens: CitizenDirectory) {}

  async list(): Promise<ListCitizensResponse> {
    return { citizens: await this.citizens.list() };
  }
}
