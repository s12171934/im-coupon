import { useState } from 'react';
import type { SignalWeights } from '@im-coupon/contracts';

import { ErrorNotice } from '../../shared/components/ErrorNotice/ErrorNotice';
import { IssuedCouponCard } from '../../features/issuance/components/IssuedCouponCard/IssuedCouponCard';
import { SIGNAL_KEYS } from '../../features/issuance/model/signal-labels';
import { StorageStatus, type StorageStatusState } from '../../features/storage/components/StorageStatus/StorageStatus';
import { WeightsEditor, type WeightsDraft } from '../../features/issuance/components/WeightsEditor/WeightsEditor';
import { useIssueCoupon } from '../../features/issuance/hooks/use-issue-coupon';

export interface IssuePageProps {
  /**
   * 저장소 상태. 헬스 조회는 탭 셸(`CP-05-01`)이 들고 이 화면은 받아서 넘기기만 한다 —
   * 화면이 다시 조회하면 탭을 오갈 때마다 같은 요청이 되풀이된다.
   */
  storage: StorageStatusState;
}

/**
 * 입력 원문의 초기값. 전 신호를 빈 문자열로 둔다 — "지정하지 않음"이라 요청 본문에서 키가
 * 빠지고, 서버가 병합 2단계에서 `params.ts` 기본값으로 채운다 (설계문서 8장).
 */
const EMPTY_DRAFT: WeightsDraft = Object.fromEntries(
  SIGNAL_KEYS.map((key) => [key, '']),
) as WeightsDraft;

/**
 * 발급 실행 화면 (`CP-05-07`, 설계문서 11장 와이어프레임). 훅과 UI 전용 컴포넌트를
 * 조립만 한다 — `fetch` 를 직접 부르지 않고, 요청·상태·오류 판단은 전부
 * `useIssueCoupon` 이 진다 (4장 결정 10).
 */
export function IssuePage({ storage }: IssuePageProps) {
  /*
    입력 원문은 화면이 든다. 훅은 `issue(draft)` 인자로만 받으므로(`CP-05-06`) 이 초안은
    fetch·업무 로직이 아니라 가중치 입력과 훅을 잇는 폼 상태다.
  */
  const [draft, setDraft] = useState<WeightsDraft>(EMPTY_DRAFT);
  const { state, issue } = useIssueCoupon();
  const issuing = state.status === 'issuing';

  return (
    <>
      <h2>쿠폰 발급 실행 — 시연·관리 시점</h2>
      <StorageStatus state={storage} />
      <WeightsEditor
        value={draft}
        onChange={(key: keyof SignalWeights, text: string) =>
          setDraft((previous) => ({ ...previous, [key]: text }))
        }
        disabled={issuing}
      />
      <p>
        <button type="button" disabled={issuing} onClick={() => void issue(draft)}>
          발급 1건 실행
        </button>
      </p>
      {/*
        버튼의 `disabled` 는 훅의 재호출 가드와 겹치는 중복 방어다. 훅이 요청을 막아도
        버튼이 살아 있으면 누를 때마다 아무 일도 없는 화면이 되어, 진행 중이라는 사실이
        사용자에게 보이지 않는다.
      */}
      {issuing && <p role="status">발급하는 중…</p>}
      {/*
        훅의 상태가 판별 유니온이라 결과 카드와 오류 영역이 동시에 그려질 수 없다
        (설계문서 4장 결정 10 — 화면은 조립만 하고 이 판별을 스스로 만들지 않는다).
      */}
      {state.status === 'succeeded' && <IssuedCouponCard {...state.result} />}
      {state.status === 'failed' && (
        <ErrorNotice code={state.error.code} message={state.error.message} />
      )}
    </>
  );
}
