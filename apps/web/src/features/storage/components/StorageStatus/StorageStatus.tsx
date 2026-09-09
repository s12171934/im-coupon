import type { HealthResponse } from '@im-coupon/contracts';

export type StorageStatusState =
  | { kind: 'loading' }
  | { kind: 'loaded'; health: HealthResponse }
  | { kind: 'failed' };

export function StorageStatus({ state }: { state: StorageStatusState }) {
  return (
    <section aria-label="저장소 상태">
      <h2>저장소</h2>
      {state.kind === 'loading' && <p>확인 중…</p>}
      {state.kind === 'failed' && <p>API 에 연결하지 못했습니다</p>}
      {state.kind === 'loaded' && <Loaded health={state.health} />}
    </section>
  );
}

function Loaded({ health }: { health: HealthResponse }) {
  const { storage } = health;
  return (
    <>
      <p data-testid="storage-status">{health.status === 'ok' ? '정상' : '점검 필요'}</p>
      <p data-testid="storage-detail">
        {storage.readable
          ? `스키마 ${storage.schemaVersion ?? '?'}판 · 컬렉션 ${storage.collections.length}개`
          : '데이터 디렉터리를 읽지 못했습니다'}
      </p>
    </>
  );
}
