import type { Signal } from '../ports/signal';

/**
 * 랜덤 신호 — 이력 없이 작동하는 탐색용 신호.
 *
 * 주변값으로 받은 난수를 그대로 점수로 쓴다. 난수를 직접 뽑지 않으므로
 * 같은 수열을 주면 같은 점수가 나온다.
 */
export const randomSignal: Signal = {
  key: 'random',
  score: (_candidate, context) => context.random(),
};
