import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveGuardDir, watchForOrphan } from './orphan-guard';

const stops: Array<() => void> = [];

async function temporaryDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'im-coupon-guard-'));
}

function watch(dir: string, onOrphan: (dir: string) => void): () => void {
  const stop = watchForOrphan({ dir, intervalMs: 10, onOrphan });
  stops.push(stop);
  return stop;
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 80));
}

afterEach(() => {
  while (stops.length > 0) stops.pop()?.();
});

describe('watchForOrphan', () => {
  it('디렉터리가 남아 있는 동안에는 고아로 판단하지 않는다', async () => {
    const dir = await temporaryDir();
    const onOrphan = vi.fn();
    watch(dir, onOrphan);

    await settle();

    expect(onOrphan).not.toHaveBeenCalled();
  });

  it('디렉터리가 사라지면 고아로 판단해 알린다', async () => {
    const dir = await temporaryDir();
    const onOrphan = vi.fn();
    watch(dir, onOrphan);

    await rm(dir, { recursive: true });

    await vi.waitFor(() => expect(onOrphan).toHaveBeenCalledWith(dir), { timeout: 2000 });
  });

  it('감시를 멈춘 뒤에는 디렉터리가 사라져도 알리지 않는다', async () => {
    const dir = await temporaryDir();
    const onOrphan = vi.fn();
    const stop = watch(dir, onOrphan);

    stop();
    await rm(dir, { recursive: true });
    await settle();

    expect(onOrphan).not.toHaveBeenCalled();
  });
});

describe('resolveGuardDir', () => {
  const original = process.env.IM_COUPON_GUARD_DIR;

  afterEach(() => {
    if (original === undefined) delete process.env.IM_COUPON_GUARD_DIR;
    else process.env.IM_COUPON_GUARD_DIR = original;
  });

  it('기본값은 호출자가 넘긴 자기 위치다', () => {
    delete process.env.IM_COUPON_GUARD_DIR;

    expect(resolveGuardDir('/앱/자리')).toBe('/앱/자리');
  });

  it('IM_COUPON_GUARD_DIR 로 덮어쓸 수 있다', () => {
    process.env.IM_COUPON_GUARD_DIR = '/임시/자리';

    expect(resolveGuardDir('/앱/자리')).toBe('/임시/자리');
  });
});
