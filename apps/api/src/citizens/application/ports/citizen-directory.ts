import type { Citizen } from '@im-coupon/contracts';

export interface CitizenDirectory {
  list(): Promise<Citizen[]>;
}

export const CITIZEN_DIRECTORY = Symbol('CITIZEN_DIRECTORY');
