import { describe, expect, it } from 'vitest';

import type { Candidate } from '../signal';
import {
  PERSONAL_FIT_SIGNAL_VERSION,
  type PersonalFitContext, type PersonalFitDisabledReason, type PersonalFitMerchantVector,
  type PreparePersonalFitInput, type PreparedPersonalFit,
} from './personal-fit-input';
import { personalFitSignal } from './personal-fit-signal';
import { preparePersonalFit } from './prepare-personal-fit';

function candidate(citizenId: string, merchantId = 'shared'): Candidate {
  return {
    citizen: { id: citizenId, name: citizenId },
    merchant: { id: merchantId, name: merchantId, category: '서점' },
  };
}

function prepared(citizenId: string, scoresByMerchantId: Readonly<Record<string, number>>): PreparedPersonalFit {
  return {
    citizenId, scoresByMerchantId, enabled: true, reason: null,
    candidates: Object.keys(scoresByMerchantId).map(merchantId => ({ merchantId, contentVersion: 'v1' })),
    asOf: Date.UTC(2026, 8, 13), signalVersion: PERSONAL_FIT_SIGNAL_VERSION,
  };
}

function context(entries: readonly (readonly [string, PreparedPersonalFit])[]): PersonalFitContext {
  return {
    personalFitByCitizenId: new Map(entries),
    random: () => { throw new Error('personalFit must not consume random'); },
  };
}

function expectContractError(action: () => number, kind: string, citizenId = 'U1', merchantId = 'shared') {
  expect(action).toThrow(Error);
  expect(action).toThrow(`personalFit: ${kind} citizen=${citizenId} merchant=${merchantId}`);
}

const NOW = Date.UTC(2026, 8, 13);
const DAY = 86_400_000;
function vector(merchantId: string, values: readonly number[], contentVersion = 'v1'): PersonalFitMerchantVector {
  return { merchantId, values, contentVersion, specId: 'spec', knownAt: NOW - 2 * DAY, verifiedAt: NOW - 2 * DAY };
}

function preparation(citizenId: string): PreparePersonalFitInput {
  return {
    citizenId, asOf: NOW,
    candidates: ['shared', 'y'].map(merchantId => ({ merchantId, contentVersion: 'v1' })),
    events: ['U1', 'U2'].map(id => ({
      transactionId: `tx-${id}`, revision: 0, actualUserId: id, merchantId: `history-${id}`,
      usedAt: NOW - DAY, recordedAt: NOW - DAY, status: 'confirmed', netAmount: 1, contentVersion: 'v1',
    })),
    vectors: [vector('history-U1', [3, 4]), vector('history-U2', [4, 3]),
      vector('shared', [1, 0]), vector('y', [0, 1]), vector('new', [-1, 0]),
      vector('shared', [0, 1], 'v2')],
  };
}

describe('personalFitSignal', () => {
  it('TC-01: 동일 가게 U1=.2, U2=.8을 번갈아 조회해 시민별 점수를 반환한다', () => {
    const ctx = context([
      ['U1', prepared('U1', { shared: .2 })],
      ['U2', prepared('U2', { shared: .8 })],
    ]);

    expect(personalFitSignal.key).toBe('personalFit');
    expect(['U1', 'U2', 'U1', 'U2'].map(id => personalFitSignal.score(candidate(id), ctx)))
      .toEqual([.2, .8, .2, .8]);
  });

  it('TC-14: 다른 시민 결과만 있거나 빈 context이면 동기 숫자 0이다', () => {
    for (const ctx of [context([]), context([['U2', prepared('U2', { shared: .8 })]])]) {
      expect(personalFitSignal.score(candidate('U1'), ctx)).toBe(0);
    }
  });

  it.each<PersonalFitDisabledReason>([
    'INVALID_HISTORY', 'NO_HISTORY', 'MISSING_VECTOR', 'INVALID_VECTOR', 'INVALID_PROFILE',
  ])('TC-14: 비활성 %s는 후보 유무와 무관하게 0이다', reason => {
    const off: PreparedPersonalFit = { ...prepared('U1', { shared: 0 }), enabled: false, reason };
    const ctx = context([['U1', off]]);
    expect(personalFitSignal.score(candidate('U1'), ctx)).toBe(0);
    expect(personalFitSignal.score(candidate('U1', 'outside'), ctx)).toBe(0);
  });

  it.each([true, false])('TC-14: 시민 불일치는 enabled=%s에서도 후보 조회보다 먼저 오류다', enabled => {
    const other = prepared('U2', {});
    const result: PreparedPersonalFit = enabled ? other : { ...other, enabled: false, reason: 'NO_HISTORY' };
    expectContractError(() => personalFitSignal.score(candidate('U1'), context([['U1', result]])), 'CITIZEN_MISMATCH');
  });

  it.each([0, .2, 1])('TC-14: 활성 소유 점수 %s는 보정 없이 동기 숫자로 반환한다', score => {
    expect(personalFitSignal.score(candidate('U1'), context([['U1', prepared('U1', { shared: score })]])))
      .toBe(score);
  });

  it.each([NaN, Infinity, -Infinity, -.01, 1.01, undefined, null, '0.5'])('TC-14: 무효 활성 점수 %s는 계약 오류다', score => {
    // 타입 경계를 우회해 잘못 조립된 외부 context의 런타임 검증을 확인한다.
    const scores = { shared: score } as unknown as Readonly<Record<string, number>>;
    expectContractError(() => personalFitSignal.score(candidate('U1'), context([['U1', prepared('U1', scores)]])), 'INVALID_SCORE');
  });

  it.each(['outside', '__proto__', 'constructor', 'toString'])('TC-08: 소유 키가 없는 %s는 준비 집합 밖 오류다', merchantId => {
    const ctx = context([['U1', prepared('U1', { shared: .2 })]]);
    expectContractError(() => personalFitSignal.score(candidate('U1', merchantId), ctx), 'CANDIDATE_NOT_PREPARED', 'U1', merchantId);
  });

  it('TC-08: 프로토타입에서 물려받은 유효 숫자도 준비된 점수로 보지 않는다', () => {
    const scores: Readonly<Record<string, number>> = Object.create({ shared: .7 });
    expectContractError(() => personalFitSignal.score(candidate('U1'), context([['U1', prepared('U1', scores)]])), 'CANDIDATE_NOT_PREPARED');
  });

  it('TC-09/15: 실제 준비 결과를 반복 조회하고 U1 재준비 뒤 U2와 이전 결과를 보존한다', () => {
    const request = preparation('U1');
    const u1 = preparePersonalFit(request);
    const u2 = preparePersonalFit(preparation('U2'));
    expect(u1.enabled).toBe(true);
    expect(u2.enabled).toBe(true);
    const beforeU1 = JSON.stringify(u1);
    const beforeU2 = JSON.stringify(u2);
    const byCitizen = new Map([['U1', u1], ['U2', u2]]);
    const ctx: PersonalFitContext = { ...context([]), personalFitByCitizenId: byCitizen };
    const read = (id: string, merchantId: string) => personalFitSignal.score(candidate(id, merchantId), ctx);

    // 단일 이력의 방향 (3,4)/5, (4,3)/5와 축 벡터의 내적을 손계산한다.
    for (let repeat = 0; repeat < 3; repeat += 1) {
      expect(read('U1', 'shared')).toBeCloseTo(.6, 12);
      expect(read('U2', 'shared')).toBeCloseTo(.8, 12);
      expect(read('U1', 'y')).toBeCloseTo(.8, 12);
      expect(read('U2', 'y')).toBeCloseTo(.6, 12);
    }
    expectContractError(() => read('U1', 'new'), 'CANDIDATE_NOT_PREPARED', 'U1', 'new');

    // 후보 ID와 내용 버전이 바뀌면 호출자가 새 결과로 U1 항목만 교체한다.
    const replacement = preparePersonalFit({ ...request, candidates: [
      { merchantId: 'shared', contentVersion: 'v2' }, { merchantId: 'new', contentVersion: 'v1' },
    ] });
    expect(replacement.enabled).toBe(true);
    byCitizen.set('U1', replacement);
    expect(read('U1', 'shared')).toBeCloseTo(.8, 12);
    expect(read('U1', 'new')).toBe(0);
    expectContractError(() => read('U1', 'y'), 'CANDIDATE_NOT_PREPARED', 'U1', 'y');
    expect(read('U2', 'shared')).toBeCloseTo(.8, 12);
    expect(read('U2', 'y')).toBeCloseTo(.6, 12);
    expect(byCitizen.get('U2')).toBe(u2);
    expect(JSON.stringify(u1)).toBe(beforeU1);
    expect(JSON.stringify(u2)).toBe(beforeU2);
    expect(personalFitSignal.score(candidate('U1'), context([['U1', u1]]))).toBeCloseTo(.6, 12);
  });

  it.each(['__proto__', 'constructor', 'toString'])('TC-15: 실제 준비한 특수 시민·가게 ID %s를 소유 점수로 조회한다', id => {
    const request = preparation(id);
    const result = preparePersonalFit({ ...request,
      events: [{ ...request.events[0]!, actualUserId: id }],
      candidates: [{ merchantId: id, contentVersion: 'v1' }],
      vectors: [...request.vectors, vector(id, [1, 0])],
    });
    expect(result.enabled).toBe(true);
    expect(Object.hasOwn(result.scoresByMerchantId, id)).toBe(true);
    expect(personalFitSignal.score(candidate(id, id), context([[id, result]]))).toBeCloseTo(.6, 12);
  });
});
