import { existsSync } from 'node:fs';

const DEFAULT_INTERVAL_MS = 5_000;

export interface OrphanGuardOptions {
  /** 이 프로세스가 살아 있을 근거가 되는 디렉터리. 보통 자기 소스·산출물이 놓인 곳이다. */
  dir: string;
  intervalMs?: number;
  onOrphan: (dir: string) => void;
}

/**
 * 자기 근거 디렉터리가 사라졌는지 주기적으로 본다.
 *
 * 워크트리가 삭제돼도 그 안에서 돌던 개발 서버는 살아남아 포트를 계속 붙들고,
 * 사라진 데이터 디렉터리를 보며 degraded 응답을 내놓는다. 그 상태의 프로세스는
 * 아무에게도 쓸모가 없으므로 스스로 물러나게 한다.
 *
 * 타이머는 `unref` 하여 이 감시 자체가 프로세스의 수명을 늘리지 않게 한다.
 */
export function watchForOrphan({
  dir,
  intervalMs = DEFAULT_INTERVAL_MS,
  onOrphan,
}: OrphanGuardOptions): () => void {
  const timer = setInterval(() => {
    if (existsSync(dir)) return;
    clearInterval(timer);
    onOrphan(dir);
  }, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}

/**
 * 감시할 디렉터리. 기본값은 호출자가 넘긴 자기 위치이고,
 * `IM_COUPON_GUARD_DIR` 로 덮어쓸 수 있다. 테스트는 이 값을 임시 디렉터리로 갈아끼운다.
 */
export function resolveGuardDir(ownDir: string): string {
  return process.env.IM_COUPON_GUARD_DIR ?? ownDir;
}
