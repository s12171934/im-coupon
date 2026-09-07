import type { HealthResponse } from '@im-coupon/contracts';

/** 저장 방식과 무관하게 헬스 유스케이스가 요구하는 저장소 점검 계약. */
export interface StorageHealth {
  check(): Promise<HealthResponse['storage']>;
}

export const STORAGE_HEALTH = Symbol('STORAGE_HEALTH');
