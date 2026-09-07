import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveDataDir, resolveSeedDir } from './data-dir';

afterEach(() => vi.unstubAllEnvs());

describe('데이터 디렉터리 해석', () => {
  it('파일 이동 후에도 저장소 루트의 runtime과 seed를 사용한다', () => {
    vi.stubEnv('IM_COUPON_DATA_DIR', undefined);
    vi.stubEnv('IM_COUPON_SEED_DIR', undefined);
    // 테스트 실행 cwd는 apps/api이며 소스 파일 깊이에 의존하지 않는다.
    expect(resolveDataDir()).toBe(resolve(process.cwd(), '../../data/runtime'));
    expect(resolveSeedDir()).toBe(resolve(process.cwd(), '../../data/seed'));
  });

  it('환경 변수로 지정한 경로를 우선한다', () => {
    vi.stubEnv('IM_COUPON_DATA_DIR', '/tmp/custom-runtime');
    vi.stubEnv('IM_COUPON_SEED_DIR', '/tmp/custom-seed');
    expect(resolveDataDir()).toBe('/tmp/custom-runtime');
    expect(resolveSeedDir()).toBe('/tmp/custom-seed');
  });
});
