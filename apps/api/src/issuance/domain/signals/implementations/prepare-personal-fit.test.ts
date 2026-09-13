import { describe, expect, it } from 'vitest';

import { preparePersonalFit } from './prepare-personal-fit';
import type {
  PersonalFitDisabledReason, PersonalFitMerchantVector, PersonalFitUsageEvent,
  PreparePersonalFitInput, PreparedPersonalFit,
} from './personal-fit-input';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 13, 3);
function event(overrides: Partial<PersonalFitUsageEvent> = {}): PersonalFitUsageEvent {
  return { transactionId: 'tx', revision: 0, actualUserId: 'u', merchantId: 'h',
    usedAt: NOW - DAY, recordedAt: NOW - DAY, status: 'confirmed', netAmount: 1,
    contentVersion: 'v1', ...overrides };
}
function vector(merchantId: string, values: readonly number[],
  overrides: Partial<PersonalFitMerchantVector> = {}): PersonalFitMerchantVector {
  return { merchantId, values, contentVersion: 'v1', specId: 'spec',
    knownAt: NOW - 100 * DAY, verifiedAt: NOW - 100 * DAY, ...overrides };
}
function input(overrides: Partial<PreparePersonalFitInput> = {}): PreparePersonalFitInput {
  return { citizenId: 'u', asOf: NOW, candidates: [
    { merchantId: 'x', contentVersion: 'v1' }, { merchantId: 'y', contentVersion: 'v1' },
  ], events: [event()], vectors: [vector('h', [1, 0]), vector('x', [1, 0]), vector('y', [0, 1])],
  ...overrides };
}
function disabled(result: PreparedPersonalFit, reason: PersonalFitDisabledReason) {
  expect(result.enabled).toBe(false);
  expect(result.reason).toBe(reason);
  expect(Object.keys(result.scoresByMerchantId).sort())
    .toEqual(result.candidates.map(c => c.merchantId).sort());
  for (const score of Object.values(result.scoresByMerchantId)) {
    expect(score).toBe(0);
    expect(Number.isFinite(score)).toBe(true);
  }
}
function scores(request: PreparePersonalFitInput) {
  const result = preparePersonalFit(request);
  expect(result.enabled).toBe(true);
  expect(result.reason).toBeNull();
  return result.scoresByMerchantId;
}

describe('preparePersonalFit', () => {
  it.each([1e-323, Number.MIN_VALUE])('B1: 극소 상한 %s에서도 단일 사건 방향을 보존한다', merchantWeightCap => {
    const s = scores(input({ params: { merchantWeightCap },
      vectors: [vector('h', [3, 4]), vector('x', [1, 0]), vector('y', [0, 1])] }));
    expect(s.x).toBeCloseTo(.6, 8);
    expect(s.y).toBeCloseTo(.8, 8);
    expect(s.y).toBeGreaterThan(s.x!);
  });

  it.each([1e-323, Number.MIN_VALUE])('B1: 극소 상한 %s에서도 가게별 상한과 사건별 상대 최근성을 보존한다', merchantWeightCap => {
    const s = scores(input({ params: { halfLifeDays: 1, merchantWeightCap },
      events: [event(), event({ transactionId: 'h2', usedAt: NOW - 2 * DAY, contentVersion: 'v2' }),
        event({ transactionId: 'other', merchantId: 'other' })],
      vectors: [...input().vectors, vector('h', [0, 1], { contentVersion: 'v2' }), vector('other', [0, 1])] }));
    // 두 가게의 총 기여는 같고 h 내부는 2:1이므로, 전체 x:y는 1:2다.
    expect(s.x).toBeCloseTo(.4472135954999579, 8);
    expect(s.y).toBeCloseTo(.8944271909999159, 8);
  });

  it('TC-02/03: 최근성 2:1 프로필과 손계산한 세 후보 점수', () => {
    const s = scores(input({ events: [event(), event({ transactionId: 'old', merchantId: 'old', usedAt: NOW - 31 * DAY })],
      candidates: ['a', 'x', 'y'].map(merchantId => ({ merchantId, contentVersion: 'v1' })),
      vectors: [...input().vectors, vector('old', [0, 1]), vector('a', [.8, .6])] }));
    expect(s.x).toBeCloseTo(.8944271909999159, 8);
    expect(s.y).toBeCloseTo(.4472135954999579, 8);
    expect(s.a).toBeCloseTo(.9838699100999074, 8);
    expect(s.a).toBeGreaterThan(s.x!);
    expect(s.x).toBeGreaterThan(s.y!);
  });

  it.each([1, .75, .5])('TC-04: 가게 합 .75에 cap=%s (미만·동일·초과)', cap => {
    // 1일/2일 전 이력의 최근성은 .5/.25, h 합 .75.
    const s = scores(input({ params: { halfLifeDays: 1, merchantWeightCap: cap },
      events: [event(), event({ transactionId: 'h2', usedAt: NOW - 2 * DAY }),
        event({ transactionId: 'other', merchantId: 'other' })],
      vectors: [...input().vectors, vector('other', [0, 1])] }));
    const expected = cap === .5 ? [.7071067811865475, .7071067811865475]
      : [.8320502943378437, .5547001962252291];
    expect(s.x).toBeCloseTo(expected[0]!, 8);
    expect(s.y).toBeCloseTo(expected[1]!, 8);
  });

  it('TC-04/11: 같은 KST 날짜는 최신 사건, 동률이면 거래 ID 오름차순', () => {
    const s = scores(input({ events: [event({ transactionId: 'z', contentVersion: 'old' }),
      event({ transactionId: 'a' }), event({ transactionId: 'earlier', usedAt: NOW - DAY - 1000, contentVersion: 'old' })],
      vectors: [...input().vectors, vector('h', [0, 1], { contentVersion: 'old' })] }));
    expect(s.x).toBe(1); expect(s.y).toBe(0);
  });

  it('TC-04: 가게의 여러 내용 버전에 같은 상한을 적용한다', () => {
    const s = scores(input({ params: { halfLifeDays: 1, merchantWeightCap: .5 },
      events: [event(), event({ transactionId: 'h2', usedAt: NOW - 2 * DAY, contentVersion: 'v2' }),
        event({ transactionId: 'other', merchantId: 'other' })],
      vectors: [...input().vectors, vector('h', [0, 1], { contentVersion: 'v2' }), vector('other', [0, 1])] }));
    // h의 (.5,.25)는 (1/3,1/6), 다른 가게는 y에 1/2: 방향 1:2.
    expect(s.x).toBeCloseTo(.4472135954999579, 8);
    expect(s.y).toBeCloseTo(.8944271909999159, 8);
  });

  it.each([
    { actualUserId: 'other' }, { actualUserId: null }, { status: 'cancelled' as const },
    { netAmount: 0 }, { netAmount: -1 }, { usedAt: NOW }, { usedAt: NOW - 91 * DAY },
  ])('TC-05/06: 최신 정정 %j 뒤 이전 revision을 되살리지 않는다', correction => {
    disabled(preparePersonalFit(input({ events: [event(), event({ revision: 1, ...correction })] })), 'NO_HISTORY');
  });

  it('TC-05: 최신 사용자만 반영하고 양수 금액 크기는 가중하지 않는다', () => {
    const events = [event({ actualUserId: 'other' }), event({ revision: 1, netAmount: .01 }),
      event({ transactionId: 'other', merchantId: 'other', netAmount: 100000 })];
    const s = scores(input({ events, vectors: [...input().vectors, vector('other', [0, 1])] }));
    expect(s.x).toBeCloseTo(.7071067811865475, 8);
    expect(s.y).toBeCloseTo(.7071067811865475, 8);
  });

  it('TC-06: 관측 시작 포함, 끝 제외, 미래 기록은 최신 revision 선택에서 제외', () => {
    expect(scores(input({ events: [event({ usedAt: NOW - 90 * DAY }),
      event({ revision: 1, status: 'cancelled', recordedAt: NOW + 1 }),
      event({ transactionId: 'end', merchantId: 'missing', usedAt: NOW })] })).x).toBe(1);
    disabled(preparePersonalFit(input({ events: [event({ usedAt: NOW - 90 * DAY - 1 })] })), 'NO_HISTORY');
    disabled(preparePersonalFit(input({ events: [event({ recordedAt: NOW + 1 })] })), 'NO_HISTORY');
    disabled(preparePersonalFit(input({ events: [event(), event({ revision: 1, status: 'cancelled', recordedAt: NOW })] })), 'NO_HISTORY');
  });

  it('TC-11: revision 우선이며 동일 필드 중복은 객체 키 순서와 무관하게 접는다', () => {
    const latest = event({ revision: 2, recordedAt: NOW - 2 * DAY });
    const duplicate = Object.fromEntries(Object.entries(latest).reverse()) as unknown as PersonalFitUsageEvent;
    expect(scores(input({ events: [event({ revision: 1, status: 'cancelled', recordedAt: NOW }), latest, duplicate] })).x).toBe(1);
  });

  it('TC-11: 다른 사용자의 동일 revision 충돌도 사용자 필터보다 먼저 거부', () => {
    const other = event({ transactionId: 'other', actualUserId: 'other' });
    disabled(preparePersonalFit(input({ events: [event(), other, { ...other, netAmount: 2 }] })), 'INVALID_HISTORY');
  });

  it('TC-11: KST 자정 양쪽은 별도 날짜이며 로컬 시간대와 무관하다', () => {
    const midnight = Date.UTC(2026, 8, 11, 15);
    const s = scores(input({ asOf: midnight + 1, params: { halfLifeDays: 1 },
      events: [event({ usedAt: midnight - 1, recordedAt: midnight - 1 }),
        event({ transactionId: 'next', usedAt: midnight, recordedAt: midnight, contentVersion: 'v2' })],
      vectors: [...input().vectors, vector('h', [0, 1], { contentVersion: 'v2' })] }));
    expect(s.x).toBeCloseTo(.7071067783500967, 8);
    expect(s.y).toBeCloseTo(.707106784023, 8);
  });

  it.each([NaN, Infinity, -Infinity, 8.64e15 + 1])('TC-10: 잘못된 기준 시각 %s', asOf => {
    expect(() => preparePersonalFit(input({ asOf }))).toThrow(/asOf/);
  });
  it.each(['lookbackDays', 'halfLifeDays', 'merchantWeightCap', 'normEpsilon'] as const)(
    'TC-10: 명시적 무효 %s는 기본값으로 덮지 않는다', key => {
      for (const value of [0, -1, NaN, Infinity, undefined, null, '1']) {
        expect(() => preparePersonalFit(input({ params: { [key]: value } } as unknown as Partial<PreparePersonalFitInput>))).toThrow(key);
      }
    });
  it('TC-10: 빈 시민·후보·버전, 중복 후보 ID, 시간대 오류는 호출 오류', () => {
    for (const patch of [
      { citizenId: '' }, { citizenId: '  ' }, { candidates: [] },
      { candidates: [{ merchantId: '', contentVersion: 'v1' }] },
      { candidates: [{ merchantId: 'x', contentVersion: '' }] },
      { candidates: [{ merchantId: 'x', contentVersion: 'v1' }, { merchantId: 'x', contentVersion: 'v2' }] },
      { params: { dayZone: 'UTC' } }, { params: { dayZone: undefined } },
    ]) expect(() => preparePersonalFit(input(patch as Partial<PreparePersonalFitInput>))).toThrow();
    expect(scores(input({ params: {} })).x).toBe(1);
  });

  it.each([
    { transactionId: '' }, { revision: -1 }, { revision: .5 }, { revision: Number.MAX_SAFE_INTEGER + 1 },
    { actualUserId: '' }, { merchantId: '' }, { contentVersion: '' }, { usedAt: NaN },
    { recordedAt: Infinity }, { netAmount: NaN }, { status: 'pending' },
  ])('TC-11: 사건 구조 오류 %j는 전체 비활성', patch => {
    disabled(preparePersonalFit(input({ events: [event(patch as Partial<PersonalFitUsageEvent>)] })), 'INVALID_HISTORY');
  });

  it('TC-07: 이력 없음은 벡터 문제보다 우선', () => {
    disabled(preparePersonalFit(input({ events: [], vectors: [] })), 'NO_HISTORY');
  });
  it('TC-11: 비어 있는 배열 슬롯도 무효 사건으로 비활성화한다', () => {
    disabled(preparePersonalFit(input({ events: new Array<PersonalFitUsageEvent>(1) })), 'INVALID_HISTORY');
  });
  it.each([null, [], 1, 'invalid'])('TC-10: 잘못된 params 컨테이너 %j를 기본값으로 덮지 않는다', params => {
    expect(() => preparePersonalFit(input({ params } as unknown as Partial<PreparePersonalFitInput>))).toThrow(/params/);
  });
  it('TC-07: 일부 가게의 최근성만 0이면 남은 가게로 프로필을 만든다', () => {
    const s = scores(input({ params: { halfLifeDays: .01 },
      events: [event(), event({ transactionId: 'old', merchantId: 'old', usedAt: NOW - 90 * DAY })],
      vectors: [...input().vectors, vector('old', [0, 1])] }));
    expect(s.x).toBe(1);
    expect(s.y).toBe(0);
  });
  it.each(['h', 'x', 'y'])('TC-07: 필요한 %s 벡터 하나라도 없으면 모두 0', id => {
    disabled(preparePersonalFit(input({ vectors: input().vectors.filter(v => v.merchantId !== id) })), 'MISSING_VECTOR');
  });
  it.each([
    { values: [0, 0] }, { values: [NaN, 1] }, { values: [Infinity, 0] }, { values: [] },
    { values: [1, 0, 0] }, { values: [1e-12, 0] }, { specId: 'different' },
    { specId: '' }, { values: [Number.MAX_VALUE, Number.MAX_VALUE] },
  ])('TC-07/12: 필요한 벡터 결함 %j는 전체 비활성', patch => {
    disabled(preparePersonalFit(input({ vectors: [...input().vectors.filter(v => v.merchantId !== 'y'), vector('y', [0, 1], patch)] })), 'INVALID_VECTOR');
  });
  it('TC-07: 상쇄 프로필, 최근성 언더플로는 INVALID_PROFILE', () => {
    disabled(preparePersonalFit(input({ events: [event(), event({ transactionId: 'other', merchantId: 'other' })],
      vectors: [...input().vectors, vector('other', [-1, 0])] })), 'INVALID_PROFILE');
    disabled(preparePersonalFit(input({ params: { halfLifeDays: Number.MIN_VALUE } })), 'INVALID_PROFILE');
  });
  it('TC-07: 음의 내적은 활성 점수 0이다', () => {
    const s = scores(input({ vectors: [vector('h', [1, 0]), vector('x', [-1, 0]), vector('y', [0, 1])] }));
    expect(s.x).toBe(0); expect(s.y).toBe(0);
  });

  it.each(['knownAt', 'verifiedAt'] as const)('TC-06/12: %s의 사건·후보 시점 일치와 미래 경계', key => {
    for (const id of ['h', 'x']) {
      const cutoff = id === 'h' ? NOW - DAY : NOW;
      const at = input().vectors.map(v => v.merchantId === id ? { ...v, [key]: cutoff } : v);
      expect(scores(input({ vectors: at })).x).toBe(1);
      disabled(preparePersonalFit(input({ vectors: at.map(v => v.merchantId === id ? { ...v, [key]: cutoff + 1 } : v) })), 'MISSING_VECTOR');
    }
  });
  it('TC-06: 과거 내용 버전을 현재 버전으로 대체하지 않는다', () => {
    disabled(preparePersonalFit(input({ events: [event({ contentVersion: 'past' })] })), 'MISSING_VECTOR');
  });
  it('TC-12: 큰 유한 벡터와 비정규 벡터를 안정적으로 정규화', () => {
    const s = scores(input({ vectors: [vector('h', [3e200, 4e200]), vector('x', [1e300, 0]), vector('y', [0, 7])] }));
    expect(s.x).toBeCloseTo(.6, 8); expect(s.y).toBeCloseTo(.8, 8);
  });
  it('TC-12: 동일 벡터는 접고 사용 가능한 상충 레코드는 거부', () => {
    expect(scores(input({ vectors: [...input().vectors, { ...input().vectors[0]! }] })).x).toBe(1);
    disabled(preparePersonalFit(input({ vectors: [...input().vectors, vector('h', [0, 1])] })), 'INVALID_VECTOR');
    expect(scores(input({ vectors: [...input().vectors, vector('h', [0, 1], { verifiedAt: NOW })] })).x).toBe(1);
  });
  it('TC-12: 무관한 가게 및 제외 사건의 벡터 오류를 무시한다', () => {
    expect(scores(input({ events: [event(), event({ transactionId: 'other', merchantId: 'bad', actualUserId: 'other' })],
      vectors: [...input().vectors, vector('bad', [NaN]), vector('x', [NaN], { contentVersion: 'unused' })] })).x).toBe(1);
  });

  it('TC-13: 입력 순서와 반복 호출에 점수·이유가 동일하다', () => {
    const request = input({ events: [event(), event({ transactionId: 'other', merchantId: 'other', usedAt: NOW - 31 * DAY })],
      vectors: [...input().vectors, vector('other', [0, 1])] });
    const result = preparePersonalFit(request);
    expect(preparePersonalFit(request)).toEqual(result);
    const reversed = { ...request, events: [...request.events].reverse(), vectors: [...request.vectors].reverse(), candidates: [...request.candidates].reverse() };
    expect(preparePersonalFit(reversed).scoresByMerchantId).toEqual(result.scoresByMerchantId);
    const broken = { ...request, vectors: [vector('h', [0, 0])] };
    const a = preparePersonalFit(broken);
    const b = preparePersonalFit({ ...broken, candidates: [...broken.candidates].reverse(), events: [...broken.events].reverse() });
    expect(a.reason).toBe(b.reason); expect(a.scoresByMerchantId).toEqual(b.scoresByMerchantId);
  });
  it('TC-13: 동결 입력을 변경하지 않고 반환 후보·점수·결과도 동결한다', () => {
    const request = input();
    for (const v of request.vectors) { Object.freeze(v.values); Object.freeze(v); }
    request.events.forEach(Object.freeze); request.candidates.forEach(Object.freeze);
    Object.freeze(request.events); Object.freeze(request.candidates); Object.freeze(request.vectors); Object.freeze(request);
    const before = JSON.stringify(request);
    const result = preparePersonalFit(request);
    expect(JSON.stringify(request)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.candidates)).toBe(true);
    expect(result.candidates.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(result.scoresByMerchantId)).toBe(true);
    expect(result.candidates).not.toBe(request.candidates);
  });
  it('TC-13: 생성 뒤 원본 변경이 결과에 전파되지 않고 특수 ID도 소유 점수로 남는다', () => {
    const candidates = ['__proto__', 'constructor', 'toString'].map(merchantId => ({ merchantId, contentVersion: 'v1' }));
    const values = [1, 0];
    const events = [event()];
    const vectors = [vector('h', values), ...candidates.map(c => vector(c.merchantId, [1, 0]))];
    const result = preparePersonalFit(input({ candidates, vectors, events }));
    candidates[0]!.merchantId = 'changed'; candidates.pop(); values[0] = 0; events.pop(); vectors.pop();
    expect(result.candidates.map(c => c.merchantId)).toEqual(['__proto__', 'constructor', 'toString']);
    expect(Object.getPrototypeOf(result.scoresByMerchantId)).toBeNull();
    for (const id of ['__proto__', 'constructor', 'toString']) {
      expect(Object.hasOwn(result.scoresByMerchantId, id)).toBe(true); expect(result.scoresByMerchantId[id]).toBe(1);
    }
    const off = preparePersonalFit(input({ candidates: [{ merchantId: '__proto__', contentVersion: 'v1' }], events: [] }));
    disabled(off, 'NO_HISTORY'); expect(Object.isFrozen(off.scoresByMerchantId)).toBe(true);
  });
});
