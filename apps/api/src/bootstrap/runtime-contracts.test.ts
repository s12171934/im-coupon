import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { assertRuntimeContracts } from './runtime-contracts';

it('오래된 공유 패키지는 API 기동 단계에서 명확히 거부한다', () => {
  expect(() => assertRuntimeContracts({})).toThrow('공유 패키지');
  expect(() => assertRuntimeContracts({ couponBenefits: () => ({}) })).not.toThrow();
});
it('개발 명령의 조건은 공유 패키지 원본과 새 함수를 로드한다', () => {
  const result = execFileSync(process.execPath, ['--conditions=im-coupon-source', '--require', '@swc-node/register', '-e',
    'console.log(JSON.stringify({path:require.resolve("@im-coupon/contracts"),fn:typeof require("@im-coupon/contracts").couponBenefits}))'],
    { cwd: resolve(__dirname, '../..'), encoding: 'utf8' });
  expect(JSON.parse(result)).toMatchObject({ path: expect.stringContaining('/packages/contracts/src/index.ts'), fn: 'function' });
});
