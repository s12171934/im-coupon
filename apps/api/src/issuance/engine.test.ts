import type { SignalWeights } from '@im-coupon/contracts';
import { describe, expect, it } from 'vitest';

import { IssuanceError, selectCandidate } from './engine';
import { DEFAULT_ISSUANCE_PARAMS } from './params';
import { randomSignal } from './random-signal';
import type { Candidate } from './signal';

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

/** 두 번째 발급 후보가 최고점이 되는 수열. 최고점이 하나뿐이라 선택이 갈리지 않는다. */
const sequence = [0.25, 0.9, 0.5];

function select(rngSequence: readonly number[], weights?: Partial<SignalWeights>) {
  return selectCandidate({
    candidates,
    signals: { random: randomSignal },
    weights,
    context: { random: fixedRng(rngSequence) },
  });
}

describe('selectCandidate', () => {
  it('TC-02-01 고정 수열 RNG 스텁이면 두 번 호출이 같은 발급 후보를 고르고 점수가 수열의 계산값과 같다', () => {
    const weights = { random: DEFAULT_ISSUANCE_PARAMS.weights.random };

    const first = select(sequence, weights);
    const second = select(sequence, weights);

    expect(first.candidate).toBe(candidates[1]);
    expect(second.candidate).toBe(first.candidate);
    expect(first.decision).toEqual({
      candidateCount: candidates.length,
      scores: { random: 0.9 },
      total: 0.9 * DEFAULT_ISSUANCE_PARAMS.weights.random,
    });
    expect(second.decision).toEqual(first.decision);
  });

  it('발급 가중치를 신호 점수에 곱해 총점을 내고, 신호별 점수는 곱하기 전 값 그대로 남긴다', () => {
    const weight = 4;

    const { decision } = select(sequence, { random: weight });

    expect(decision.scores.random).toBe(0.9);
    expect(decision.total).toBe(0.9 * weight);
  });

  it('요청이 지정하지 않은 신호의 발급 가중치는 발급 파라미터 기본값으로 채운다', () => {
    const byDefaults = select(sequence, { random: DEFAULT_ISSUANCE_PARAMS.weights.random });

    expect(select(sequence, {}).decision).toEqual(byDefaults.decision);
    expect(select(sequence).decision).toEqual(byDefaults.decision);
  });

  it('최고점이 여럿이면 발급 후보 목록에서 먼저 온 쪽을 고른다', () => {
    const { candidate } = select([0.9, 0.9, 0.1]);

    expect(candidate).toBe(candidates[0]);
  });

  it('알려진 신호 키를 값 없이(`undefined`) 들면 지정하지 않은 것으로 보고 기본값으로 채운다', () => {
    const byDefaults = select(sequence, { random: DEFAULT_ISSUANCE_PARAMS.weights.random });

    expect(select(sequence, { random: undefined }).decision).toEqual(byDefaults.decision);
  });
});

/**
 * 거부를 오류 코드로 환산한다. 거부하지 않으면 `null` 이라 단언이 "거부하지 않았다"를
 * 그 자리에서 짚고, `IssuanceError` 가 아닌 오류는 감추지 않고 그대로 올린다.
 */
function rejectionCode(weights: Partial<SignalWeights>): string | null {
  try {
    select(sequence, weights);
    return null;
  } catch (error) {
    if (error instanceof IssuanceError) return error.code;
    throw error;
  }
}

describe('selectCandidate 의 거부', () => {
  it('TC-02-02 음수·전부 0·모르는 신호 키의 발급 가중치를 각각 거부한다', () => {
    expect(rejectionCode({ random: -1 })).toBe('INVALID_WEIGHTS');
    expect(rejectionCode({ random: 0 })).toBe('INVALID_WEIGHTS');
    expect(rejectionCode({ 미지의신호: 1 } as Partial<SignalWeights>)).toBe('INVALID_WEIGHTS');
  });

  it('점수를 매길 발급 후보가 없으면 거부한다', () => {
    const call = () =>
      selectCandidate({
        candidates: [],
        signals: { random: randomSignal },
        context: { random: fixedRng([]) },
      });

    expect(call).toThrowError(IssuanceError);
    expect(call).toThrowError(expect.objectContaining({ code: 'NO_CANDIDATES' }));
  });

  it('모르는 신호 키는 값이 `undefined` 라도 거부한다', () => {
    expect(rejectionCode({ 미지의신호: undefined } as Partial<SignalWeights>)).toBe('INVALID_WEIGHTS');
  });

  it('알려진 키의 `null` 은 걷어내지 않고 숫자가 아님으로 거부한다', () => {
    expect(rejectionCode({ random: null } as unknown as Partial<SignalWeights>)).toBe('INVALID_WEIGHTS');
  });

  it('병합된 발급 가중치의 값이 숫자가 아니면 거부한다', () => {
    expect(rejectionCode({ random: '1' } as unknown as Partial<SignalWeights>)).toBe('INVALID_WEIGHTS');
    expect(rejectionCode({ random: Number.NaN })).toBe('INVALID_WEIGHTS');
    expect(rejectionCode({ random: Number.POSITIVE_INFINITY })).toBe('INVALID_WEIGHTS');
  });
});
