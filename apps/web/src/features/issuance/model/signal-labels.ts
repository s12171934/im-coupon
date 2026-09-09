import type { SignalWeights } from '@im-coupon/contracts';

/**
 * 신호별 화면 라벨. 키 집합을 `SignalWeights` 에서 끌어와, 이후 에픽이 신호를 더하면
 * 이 표가 컴파일 오류로 그 사실을 알린다 (설계문서 4장 결정 2).
 *
 * 가중치를 입력받는 자리와 점수를 보여주는 자리가 같은 표를 쓴다 — 표가 두 벌로 갈리면
 * 한쪽만 새 신호를 알게 되어 위 강제가 반쪽이 된다.
 */
export const SIGNAL_LABELS: Record<keyof SignalWeights, string> = {
  random: '랜덤 신호',
};

/** 신호 키 문자열이 흩어지지 않도록 라벨 표 하나에서 끌어온다. */
export const SIGNAL_KEYS = Object.keys(SIGNAL_LABELS) as (keyof SignalWeights)[];
