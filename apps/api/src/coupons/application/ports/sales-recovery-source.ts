import type { Candidate } from '../../../issuance/domain/signals/signal';
import type { PreparedRecovery } from '../../../issuance/domain/signals/implementations/sales-recovery';
export const SALES_RECOVERY_SOURCE = 'SALES_RECOVERY_SOURCE';
export interface SalesRecoverySource { prepare(candidates: readonly Candidate[]): Promise<PreparedRecovery>; }
