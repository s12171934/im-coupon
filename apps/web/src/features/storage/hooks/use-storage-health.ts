import { useEffect, useState } from 'react';
import { HEALTH_PATH, type HealthResponse } from '@im-coupon/contracts';

import type { StorageStatusState } from '../components/StorageStatus/StorageStatus';

export interface UseStorageHealth {
  /** 저장소 상태. `StorageStatus`(`CP-05-02`)가 그리는 모양 그대로다 — 새 모양을 만들지 않는다. */
  state: StorageStatusState;
}

/**
 * 저장소 헬스 조회 (설계문서 4장 결정 10 — 로직은 훅이 진다). 마운트 때 한 번 조회하고
 * 상태만 돌려준다. 무엇을 그릴지는 UI 전용 컴포넌트가, 이 상태를 누가 드는지는 탭 셸이 정한다.
 */
export function useStorageHealth(): UseStorageHealth {
  const [state, setState] = useState<StorageStatusState>({ kind: 'loading' });

  useEffect(() => {
    /* 언마운트 뒤에 도착한 응답이 사라진 컴포넌트의 상태를 건드리지 않게 막는다. */
    let cancelled = false;
    fetch(HEALTH_PATH)
      .then((response) => response.json() as Promise<HealthResponse>)
      .then((health) => {
        if (!cancelled) setState({ kind: 'loaded', health });
      })
      /* 요청 실패와 본문을 읽지 못한 것을 한 갈래로 모은다 — 화면이 낼 안내가 같다. */
      .catch(() => {
        if (!cancelled) setState({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { state };
}
