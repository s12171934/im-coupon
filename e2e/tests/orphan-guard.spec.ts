import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * 빌드된 API 프로세스를 밖에서 띄워, 삭제된 워크트리가 남기던 좀비의 두 증상을 검증한다.
 * Playwright 가 관리하는 3000 번과 부딪히지 않도록 테스트마다 다른 포트를 쓴다.
 */
const REPO_ROOT = resolve(__dirname, '../..');

interface Started {
  child: ChildProcess;
  stderr: () => string;
  exit: Promise<number | null>;
}

/** 테스트가 실패해도 프로세스가 포트를 붙든 채 남지 않도록 전부 여기 모아 뒷정리한다. */
const started: Started[] = [];
const temporaryDirs: string[] = [];

test.afterEach(async () => {
  await Promise.all(
    started.splice(0).map(async (api) => {
      if (api.child.exitCode === null) api.child.kill('SIGKILL');
      await api.exit;
    }),
  );
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function startApi(port: number, guardDir: string, dataDir: string): Started {
  const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), IM_COUPON_GUARD_DIR: guardDir, IM_COUPON_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const api: Started = {
    child,
    stderr: () => stderr,
    exit: new Promise((done) => child.once('exit', (code) => done(code))),
  };
  started.push(api);
  return api;
}

async function waitUntilServing(port: number): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`http://localhost:${port}/api/health`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 20_000 },
    )
    .toBe(200);
}

async function temporaryDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirs.push(dir);
  return dir;
}

test('소스 디렉터리가 사라진 API 는 스스로 종료하고 포트를 놓는다', async () => {
  const port = 3991;
  const guardDir = await temporaryDir('im-coupon-e2e-guard-');
  const dataDir = await temporaryDir('im-coupon-e2e-data-');
  const api = startApi(port, guardDir, dataDir);
  await waitUntilServing(port);

  await rm(guardDir, { recursive: true });

  expect(await api.exit).not.toBe(0);
  expect(api.stderr()).toContain('소스 디렉터리가 사라졌습니다');

  // 포트를 실제로 놓았는지는 같은 포트에 다시 붙어 확인한다.
  startApi(port, dataDir, dataDir);
  await waitUntilServing(port);
});

test('이미 물린 포트로 띄우면 점유자를 찾는 법을 알려주고 종료한다', async () => {
  const port = 3992;
  const guardDir = await temporaryDir('im-coupon-e2e-guard-');
  const dataDir = await temporaryDir('im-coupon-e2e-data-');
  startApi(port, guardDir, dataDir);
  await waitUntilServing(port);

  const blocked = startApi(port, guardDir, dataDir);

  expect(await blocked.exit).not.toBe(0);
  expect(blocked.stderr()).toContain(`lsof -nP -iTCP:${port} -sTCP:LISTEN`);
  expect(blocked.stderr()).toContain('워크트리');
});
