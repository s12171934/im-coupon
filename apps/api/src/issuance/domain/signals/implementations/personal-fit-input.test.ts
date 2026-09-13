import { describe, expect, it } from 'vitest';

import { DEFAULT_PERSONAL_FIT_PARAMS, PERSONAL_FIT_SIGNAL_VERSION } from './personal-fit-input';

/**
 * 이 파일이 지키는 것은 계산이 아니라 **값 계약**이다. 파라미터 기본값과 신호 버전은
 * 설계가 고정한 수·문자열이고, 상수의 동결은 이 모듈이 내보내는 유일한 런타임 동작이다.
 *
 * 타입이 이 셋을 지켜 주지 않는다 — 기본값을 다른 수로 고치는 것도, `Object.freeze` 를
 * 벗기는 것도 타입 검사와 다른 테스트를 전부 통과한다. 타입이 못 서는 자리라서 여기 둔다.
 */
describe('개인화 신호 입력 계약', () => {
  it('설계가 고정한 파라미터 기본값을 그대로 든다', () => {
    expect(DEFAULT_PERSONAL_FIT_PARAMS).toEqual({
      lookbackDays: 90,
      halfLifeDays: 30,
      merchantWeightCap: 2,
      dayZone: 'Asia/Seoul',
      normEpsilon: 1e-12,
    });
  });

  it('신호 버전 문자열을 고정한다', () => {
    expect(PERSONAL_FIT_SIGNAL_VERSION).toBe('personalFit.behavior.v1');
  });

  it('기본값 상수는 얼어 있어 한 호출이 고친 값이 다음 호출로 새지 않는다', () => {
    expect(Object.isFrozen(DEFAULT_PERSONAL_FIT_PARAMS)).toBe(true);

    // 준비 함수가 기본값을 제자리에서 고치려 드는 상황. 얼어 있지 않으면 이 대입이 먹는다.
    const mutable = DEFAULT_PERSONAL_FIT_PARAMS as { lookbackDays: number };
    expect(() => {
      mutable.lookbackDays = 1;
    }).toThrow(TypeError);
    expect(DEFAULT_PERSONAL_FIT_PARAMS.lookbackDays).toBe(90);
  });
});
