import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../..');

/**
 * 런타임 데이터 디렉터리의 위치. `IM_COUPON_DATA_DIR` 로 덮어쓸 수 있고,
 * 기본값은 저장소 루트의 `data/runtime` 이다. 이 디렉터리는 커밋되지 않는다.
 */
export function resolveDataDir(): string {
  return process.env.IM_COUPON_DATA_DIR ?? resolve(REPO_ROOT, 'data/runtime');
}

/** 커밋된 시드 데이터의 위치. 런타임 디렉터리가 비어 있을 때 여기서 복사해 온다. */
export function resolveSeedDir(): string {
  return process.env.IM_COUPON_SEED_DIR ?? resolve(REPO_ROOT, 'data/seed');
}
