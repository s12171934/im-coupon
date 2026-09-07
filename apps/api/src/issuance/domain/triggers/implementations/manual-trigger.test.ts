import type { IssueCouponRequest, SignalWeights } from '@im-coupon/contracts';
import { describe, expect, it } from 'vitest';

import { manualTrigger } from './manual-trigger';
import type { IssueCommand } from '../issue-trigger';

describe('manualTrigger', () => {
  it('TC-02-03 발급 가중치 덮어쓰기가 든 요청 본문을 `manual` 과 그 가중치를 실은 발급 명령으로 옮긴다', () => {
    const request: IssueCouponRequest = { weights: { random: 7 } };

    expect(manualTrigger.toCommand(request)).toEqual({
      trigger: 'manual',
      weights: { random: 7 },
    });
  });

  it('요청 본문이 없거나 본문에 `weights` 가 없으면 발급 가중치 없는 명령을 만들어 기본값 채우기를 엔진에 맡긴다', () => {
    const withoutWeights: IssueCommand = { trigger: 'manual', weights: undefined };

    expect(manualTrigger.toCommand(undefined)).toEqual(withoutWeights);
    expect(manualTrigger.toCommand({})).toEqual(withoutWeights);
  });

  it('요청 본문의 발급 가중치를 손대지 않고 그대로 싣는다 — 값이 `undefined`·`null` 인 키도 걷어내지 않는다', () => {
    const weights = { random: undefined } as Partial<SignalWeights>;
    const nulled = { random: null } as unknown as Partial<SignalWeights>;

    expect(manualTrigger.toCommand({ weights }).weights).toStrictEqual(weights);
    expect(manualTrigger.toCommand({ weights: nulled }).weights).toEqual(nulled);
  });

  it('쿠폰 레코드에 남길 트리거 유형을 자기 `type` 으로 선언하고, 만드는 명령에도 같은 값을 싣는다', () => {
    expect(manualTrigger.type).toBe('manual');
    expect(manualTrigger.toCommand(undefined).trigger).toBe(manualTrigger.type);
  });
});
