import { describe, expect, it } from 'vitest';

import { randomSignal } from './random-signal';
import type { Candidate } from '../ports/signal';

/**
 * 고정 수열을 순서대로 돌려주는 RNG 스텁. 수열이 모자라면 조용히 다른 값을 내지 않고
 * 곧바로 실패하게 하여, 테스트가 의도한 수보다 많이 뽑는 구현을 놓치지 않는다.
 */
function fixedRng(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error(`RNG 스텁의 고정 수열이 모자란다 (${index + 1}번째 호출)`);
    index += 1;
    return value;
  };
}

function candidate(serial: string): Candidate {
  return {
    merchant: { id: `mer-${serial}`, name: `가맹점 ${serial}`, category: '서점' },
    citizen: { id: `cit-${serial}`, name: `시민 ${serial}` },
  };
}

const candidates = [candidate('001'), candidate('002'), candidate('003')];

/** 발급 후보 목록에 고정 수열 하나를 태워 점수를 매긴다. */
function scoreAll(sequence: readonly number[]): number[] {
  const random = fixedRng(sequence);
  return candidates.map((each) => randomSignal.score(each, { random }));
}

describe('randomSignal', () => {
  it('고정 수열 RNG 스텁이 내는 값이 그대로 발급 후보의 점수가 된다', () => {
    expect(scoreAll([0.25, 0.5, 0.75])).toEqual([0.25, 0.5, 0.75]);
  });

  it('같은 발급 후보 목록에 같은 고정 수열을 주면 두 번 호출이 같은 점수를 낸다', () => {
    const sequence = [0.11, 0.42, 0.73];

    expect(scoreAll(sequence)).toEqual(scoreAll(sequence));
  });

  it('가중치에 없는 키를 쓰지 않도록 자기 키를 `SignalWeights` 의 키로 선언한다', () => {
    expect(randomSignal.key).toBe('random');
  });
});
