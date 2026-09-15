import { Inject, Injectable } from '@nestjs/common';
import { JsonFileDb } from '@im-coupon/db';
import { STORE_CODE_CATALOG } from '@im-coupon/contracts';
import type { SalesRecoverySource } from '../application/ports/sales-recovery-source';
import type { Candidate } from '../../issuance/domain/signals/signal';
import { prepareSalesRecovery } from '../../issuance/domain/signals/implementations/sales-recovery';
import { DATA_DIR } from '../../shared/infrastructure/data-dir.token';
import { readCollection } from '../../shared/infrastructure/read-collection';
@Injectable()
export class JsonSalesRecoverySource implements SalesRecoverySource {
  private readonly db: JsonFileDb;
  constructor(@Inject(DATA_DIR) dataDir: string) { this.db = new JsonFileDb(dataDir); }
  async prepare(candidates: readonly Candidate[]) {
    const [monthly,metadata] = await Promise.all([
      readCollection<unknown>(this.db,'district-consumption-monthly'),
      readCollection<unknown>(this.db,'sales-recovery-dataset'),
    ]);
    return prepareSalesRecovery(candidates,monthly,metadata,STORE_CODE_CATALOG.districts);
  }
}
