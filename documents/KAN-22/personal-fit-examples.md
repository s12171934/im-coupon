# KAN-24 개인화 신호 실행 결과 예시

현재 구현된 `preparePersonalFit`과 `personalFitSignal.score`의 입력·계산·반환값을 설명한다. 벡터는 계산을 따라가기 위한 가상의 2차원 값이며, 특정 업종이나 실제 추천 품질을 의미하지 않는다. 점수가 높을수록 입력 이력으로 만든 프로필과 후보 벡터의 방향이 가깝다.

현재 쿠폰 발급 서비스는 `random` 신호만 등록한다. 아래 순위는 개인화 점수 순위이며 실제 쿠폰 발급 결과는 아니다.

- 기준 — 2026-09-13, 구현 커밋 `07a8193` 이후의 현재 코드.
- 관련 문서 — [로직과 노드 흐름](personal-fit-flow.md), [검증 기록](personal-fit-validation.md), [문서 인덱스](../_index.md).

## 1. 최근 사용 이력에 더 높은 비중을 주는 경우

시민 `U1`이 가게 `h`를 1일 전, 가게 `old`를 31일 전에 사용했다. 두 거래 모두 확정 상태이고 순사용액은 양수다. 기준 시각은 **2026-09-13 12:00 KST**이며, 모든 벡터는 사용 전에 알려지고 검증되었다.

| 구분 | 가게 | 벡터 | 경과 일수 | 최근성 가중치 |
| --- | --- | --- | --- | --- |
| 사용 이력 | `h` | `[1, 0]` | 1일 | 약 `0.9771599684` |
| 사용 이력 | `old` | `[0, 1]` | 31일 | 약 `0.4885799842` |
| 후보 | `a` | `[0.8, 0.6]` | 해당 없음 | 해당 없음 |
| 후보 | `x` | `[1, 0]` | 해당 없음 | 해당 없음 |
| 후보 | `y` | `[0, 1]` | 해당 없음 | 해당 없음 |

기본 반감기는 30일이므로 가중치 비율은 `2:1`이다. 가게별 기본 상한 `2`에는 도달하지 않는다.

```text
가중 평균 = [2/3, 1/3]
단위 프로필 = [2/√5, 1/√5]
후보 점수 = max(0, min(1, 프로필 · 후보 단위 벡터))
```

다음은 실제 반환 객체를 JSON으로 표현한 것이다. 점수는 소수점 아래 10자리로 반올림했다. 실제 함수는 반올림하지 않으며 결과 객체와 후보 목록·점수 객체를 동결한다.

```json
{
  "citizenId": "U1",
  "asOf": 1789268400000,
  "signalVersion": "personalFit.behavior.v1",
  "candidates": [
    { "merchantId": "a", "contentVersion": "v1" },
    { "merchantId": "x", "contentVersion": "v1" },
    { "merchantId": "y", "contentVersion": "v1" }
  ],
  "scoresByMerchantId": {
    "a": 0.9838699101,
    "x": 0.8944271910,
    "y": 0.4472135955
  },
  "enabled": true,
  "reason": null
}
```

점수 순서는 **`a > x > y`**다. 최근 사용 방향에 더 가까우면서 과거 사용 방향도 일부 포함하는 `a`가 가장 높다. `0.9839`는 이용 확률 98.39%를 뜻하지 않는다.

## 2. 같은 가게의 반복 사용에 상한을 적용하는 경우

상한 효과가 보이도록 반감기를 **1일**로 바꾼다. `h=[1,0]`의 1일 전·2일 전 사용과 `old=[0,1]`의 1일 전 사용을 넣는다. `h`의 두 사용은 서로 다른 KST 날짜다.

| 설정 | `h`의 총 기여 | `old`의 총 기여 | 후보 `x` 점수 | 후보 `y` 점수 |
| --- | --- | --- | --- | --- |
| 상한 `1` | `0.5 + 0.25 = 0.75` | `0.5` | `0.8320502943` | `0.5547001962` |
| 상한 `0.5` | `0.5`로 축소 | `0.5` | `0.7071067812` | `0.7071067812` |

상한을 `0.5`로 낮추면 두 가게의 기여가 같아져 `x`, `y`가 동점이다. 같은 가게·같은 KST 날짜에 여러 번 사용했다면 가중치 합산 전에 가장 늦은 사용 하나만 남는다. 순사용액이 양수인 한 금액의 크기는 점수에 영향을 주지 않는다.

## 3. 계산된 0점과 계산할 수 없는 0점

각 행은 서로 독립된 입력이다. 별도 설명이 없으면 후보는 `x=[1,0]`, `y=[0,1]`이고 필요한 벡터의 명세·시점은 유효하다.

| 입력 상황 | `enabled` | `reason` | 점수 `{x, y}` | 해석 |
| --- | --- | --- | --- | --- |
| 이력 벡터가 `[-1,0]` 하나 | `true` | `null` | `{0, 0}` | `x`와 반대 방향, `y`와 직교하여 계산된 0점 |
| 이력이 빈 배열 | `false` | `NO_HISTORY` | `{0, 0}` | 프로필을 만들 이력이 없음 |
| 유일한 거래의 revision 0은 확정, revision 1은 취소 | `false` | `NO_HISTORY` | `{0, 0}` | 최신 정정이 취소이므로 과거 확정 기록도 사용하지 않음 |
| 유효한 이력은 있지만 후보 `y`의 벡터가 없음 | `false` | `MISSING_VECTOR` | `{0, 0}` | `x`만 따로 점수를 내지 않고 전체 비활성화 |
| 필요한 `y` 벡터가 `[0,0]` | `false` | `INVALID_VECTOR` | `{0, 0}` | 영벡터는 정규화할 수 없음 |
| 서로 다른 두 가게를 같은 시각 사용, 벡터가 `[1,0]`, `[-1,0]` | `false` | `INVALID_PROFILE` | `{0, 0}` | 같은 가중치가 상쇄되어 프로필 방향이 없음 |
| 같은 거래 ID·revision의 두 기록이 서로 다른 금액을 가짐 | `false` | `INVALID_HISTORY` | `{0, 0}` | 정정 기록의 충돌 |

취소 정정은 `recordedAt <= asOf`인 경우에 반영한다. 기준 시각 이후에 기록된 취소는 해당 기준 시점 계산에서 제외한다. 과거 이력의 벡터는 `knownAt`, `verifiedAt`이 모두 사용 시각 이하여야 하므로, 나중에 검증된 벡터만 있으면 `MISSING_VECTOR`다.

요청 계약 오류는 위 비활성 결과와 다르다. 예를 들어 `candidates: []`는 결과 객체 없이 `TypeError: personalFit: candidates must be nonempty`를 던진다.

## 4. 같은 가게라도 시민마다 조회 점수가 다른 경우

`U1`의 이력 벡터가 `[3,4]`, `U2`의 이력 벡터가 `[4,3]` 하나씩이면 정규화된 프로필은 각각 `[0.6,0.8]`, `[0.8,0.6]`이다. 각 시민에 대해 준비한 결과를 `personalFitByCitizenId` Map에 넣는다.

| 호출 | 반환값 |
| --- | --- |
| `U1` → 가게 `x=[1,0]` | `0.6` |
| `U2` → 가게 `x=[1,0]` | `0.8` |
| `U1` → 가게 `y=[0,1]` | `0.8` |
| `U2` → 가게 `y=[0,1]` | `0.6` |
| Map에 준비 결과가 없는 `U3` → `x` | `0` |
| `NO_HISTORY`로 비활성인 시민 → `x` | `0` |

표는 반올림한 값이다. 실행 환경의 부동소수점 연산에 따라 위 `0.6`은 `0.5999999999999999`로 출력되며, 조회 함수는 이 저장값을 그대로 반환한다.

조회 함수는 준비된 점수를 그대로 반환한다. 활성 결과에 없는 가게 `z`를 `U1`로 조회하면 `Error: personalFit: CANDIDATE_NOT_PREPARED citizen=U1 merchant=z`가 발생한다. Map의 `U1` 키에 `U2`의 결과를 잘못 넣으면 `CITIZEN_MISMATCH` 오류가 발생한다.

후보 가게나 내용 버전을 바꾸려면 다시 준비하고 Map 항목을 교체해야 한다. 조회 함수는 내용 버전을 자동 비교하거나 점수를 재계산하지 않는다.

## 5. 직접 실행하기

의존성이 설치된 저장소의 `apps/api` 디렉터리에서 아래 블록 전체를 실행한다. 예시 1의 입력 전체를 생성하고, 예시 2의 상한 비교, 예시 3의 분기, 예시 4의 시민별 조회를 출력한다. 기존 TypeScript 로더로 현재 구현을 직접 호출한다.

```sh
node --require @swc-node/register <<'JS'
const { preparePersonalFit } = require('./src/issuance/domain/signals/implementations/prepare-personal-fit.ts');
const { personalFitSignal } = require('./src/issuance/domain/signals/implementations/personal-fit-signal.ts');
const DAY = 86400000;
const asOf = Date.UTC(2026, 8, 13, 3);
const event = (overrides = {}) => ({
  transactionId: 'tx-h', revision: 0, actualUserId: 'U1', merchantId: 'h',
  usedAt: asOf - DAY, recordedAt: asOf - DAY,
  status: 'confirmed', netAmount: 10000, contentVersion: 'v1', ...overrides,
});
const vector = (merchantId, values) => ({
  merchantId, values, contentVersion: 'v1', specId: 'example-2d-v1',
  knownAt: asOf - 100 * DAY, verifiedAt: asOf - 100 * DAY,
});
const base = {
  citizenId: 'U1', asOf,
  candidates: ['x', 'y'].map(merchantId => ({ merchantId, contentVersion: 'v1' })),
  events: [event()],
  vectors: [vector('h', [1, 0]), vector('x', [1, 0]), vector('y', [0, 1])],
};
const show = (label, input) => {
  const r = preparePersonalFit(input);
  console.log(label, JSON.stringify({
    enabled: r.enabled, reason: r.reason, scores: r.scoresByMerchantId,
  }));
  return r;
};
const recent = preparePersonalFit({
  ...base,
  candidates: ['a', 'x', 'y'].map(merchantId => ({ merchantId, contentVersion: 'v1' })),
  events: [event(), event({ transactionId: 'tx-old', merchantId: 'old',
    usedAt: asOf - 31 * DAY, recordedAt: asOf - 31 * DAY })],
  vectors: [...base.vectors, vector('old', [0, 1]), vector('a', [0.8, 0.6])],
});
console.log('최근성', JSON.stringify(recent, null, 2));
for (const cap of [1, 0.5]) show(`상한=${cap}`, {
  ...base, params: { halfLifeDays: 1, merchantWeightCap: cap },
  events: [event(), event({ transactionId: 'tx-h2', usedAt: asOf - 2 * DAY,
    recordedAt: asOf - 2 * DAY }), event({ transactionId: 'tx-old', merchantId: 'old' })],
  vectors: [...base.vectors, vector('old', [0, 1])],
});
show('활성 0점', { ...base, vectors: [vector('h', [-1, 0]), ...base.vectors.slice(1)] });
const empty = show('이력 없음', { ...base, events: [] });
show('취소', { ...base, events: [event(), event({ revision: 1, status: 'cancelled', recordedAt: asOf })] });
show('벡터 누락', { ...base, vectors: base.vectors.filter(v => v.merchantId !== 'y') });
show('영벡터', { ...base, vectors: base.vectors.map(v => v.merchantId === 'y' ? vector('y', [0, 0]) : v) });
show('프로필 상쇄', { ...base,
  events: [event(), event({ transactionId: 'tx-old', merchantId: 'old' })],
  vectors: [...base.vectors, vector('old', [-1, 0])],
});
show('정정 충돌', { ...base, events: [event(), event({ netAmount: 20000 })] });
try { preparePersonalFit({ ...base, candidates: [] }); }
catch (e) { console.log(e.toString()); }
const byCitizen = new Map(['U1', 'U2'].map(citizenId => [citizenId, preparePersonalFit({
  ...base, citizenId, events: [event({ actualUserId: citizenId })],
  vectors: [vector('h', citizenId === 'U1' ? [3, 4] : [4, 3]), ...base.vectors.slice(1)],
})]));
const context = { personalFitByCitizenId: byCitizen, random: () => { throw new Error('unexpected random'); } };
const lookup = (citizenId, merchantId) => personalFitSignal.score({
  citizen: { id: citizenId, name: citizenId },
  merchant: { id: merchantId, name: merchantId, category: '서점' },
}, context);
for (const id of ['U1', 'U2', 'U3']) console.log(id, lookup(id, 'x'), lookup(id, 'y'));
try { lookup('U1', 'z'); } catch (e) { console.log(e.toString()); }
byCitizen.set('U1', byCitizen.get('U2'));
try { lookup('U1', 'x'); } catch (e) { console.log(e.toString()); }
byCitizen.set('U1', empty);
console.log('비활성 조회', lookup('U1', 'x'));
JS
```

## 확인 기록

- 2026-09-13 — 위 실행 블록으로 현재 구현의 반환값을 확인했다. 표의 소수는 실행값을 소수점 아래 10자리로 반올림한 것이다.
- 계산·경계 조건의 기존 테스트는 [prepare-personal-fit.test.ts](../../apps/api/src/issuance/domain/signals/implementations/prepare-personal-fit.test.ts), 조회 테스트는 [personal-fit-signal.test.ts](../../apps/api/src/issuance/domain/signals/implementations/personal-fit-signal.test.ts)에 있다.
