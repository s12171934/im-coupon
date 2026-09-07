export interface OwnerDirectory {
  has(ownerId: string): Promise<boolean>;
}

export const OWNER_DIRECTORY = Symbol('OWNER_DIRECTORY');
