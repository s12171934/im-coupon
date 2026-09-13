> 이번 구현은 `randomSignal`과 같은 형태의 행동 이력 기반 `personalFitSignal` 인스턴스 하나를 추가한다. web·추천 API·저장소 구축은 포함하지 않는다. 이 문서는 구현 계획이며 앱 코드나 모델 실행 완료를 뜻하지 않는다.

# S6 행동 이력 기반 signal 추가 설계

- 작성·수정일 — 2026-09-13.
- 신호 버전 — `personalFit.behavior.v1`.
- 코드 확인 — 기존 `signal.ts`, `random-signal.ts`, 발급 엔진, 서비스의 신호 등록부, 공유 가중치 및 web 라벨 계약을 읽었다.
- 에픽 — [KAN-22](https://ssong9520.atlassian.net/browse/KAN-22). 설계 Task KAN-23과 구현 Task KAN-24를 별도 브랜치로 관리한다.

## 1. 구현의 목표, 전제, 범위

목표는 주어진 시민·가게 후보에 행동 이력 기반 적합도 숫자를 반환하는 signal 인스턴스를 추가하는 것이다. `randomSignal`처럼 외부에서 주입한 입력을 사용하고, `score(candidate, context)`는 동기적으로 숫자를 반환한다.

- 포함 — `personalFitSignal`, 필요한 도메인 입력 타입, 순수 프로필·점수 준비 함수, 단위 테스트.
- 제외 — `apps/web` 전체, 추천 페이지·훅·UI·라우팅, 신규 추천 API, DB 컬렉션·캐시·스냅숏·추천 기록, 브라우저 E2E.
- 제외 — 모델 다운로드·추론 도구, 실사용 로그 수집, 공공자료 적재, 운영 평가 파이프라인.
- 연결 경계 — 이번에는 독립 signal을 완성한다. 기존 발급 서비스의 등록 맵·가중치·HTTP 응답에 활성화하는 작업은 별도 범위다.
- 데이터 전제 — 실제 사용자 ID로 귀속된 사용 사건과 같은 모델·전처리 버전의 가게 벡터를 외부에서 제공받는다. 테스트에는 명시적 가상 벡터를 쓴다.
- 식별 — 기존 소비의 `consumerName`이나 최초 소유자에서 실제 사용자를 추정하지 않는다.

## 2. 용어 사전

| 용어 | 의미 |
| --- | --- |
| `personalFitSignal` | 이번에 추가하는 행동 이력 기반 signal 인스턴스 |
| `Candidate` | 기존 시민·가게 쌍. `citizen.id`, `merchant.id`로 입력을 찾는다 |
| 사용 사건 | 실제 사용자·가게·사용 시각·최신 상태가 확인되는 입력 |
| 가게 벡터 | 업종·대표메뉴 특징을 표현한 외부 준비 벡터 |
| 행동 프로필 | 최근성·반복 상한을 적용한 과거 가게 벡터의 정규화 평균 |
| 준비 결과 | 시민과 후보 집합을 고정해 계산한 불변 점수 맵 |
| 비활성 | 이력이나 벡터가 유효하지 않아 해당 준비 결과 전체가 0인 상태 |

## 3. 핵심 구현 내용 요약

| 항목 | 내용 |
| --- | --- |
| K01 | 기존 기본 타입을 유지하며 새 signal의 키·context를 표현할 최소 타입 확장 |
| K02 | 주입된 사용 사건·벡터를 정제하여 시민별 후보 점수를 준비 |
| K03 | `personalFitSignal.score`가 준비된 점수를 동기 조회 |
| K04 | 산술·결측·시민 간 분리·기존 random 호환 검증 |

## 4. 아키텍처 결정표

| 결정 | 채택안 | 이유 |
| --- | --- | --- |
| 구현 형태 | `export const personalFitSignal` 객체 | 기존 `randomSignal`과 같은 확장 방식 |
| 외부 의존 | context로 준비 결과 주입 | score에서 I/O·현재 시각·난수를 직접 읽지 않음 |
| 계산 경계 | 순수 준비 함수와 점수 조회 분리 | 후보마다 이력 정제를 반복하지 않음 |
| 결측 | 같은 시민의 준비된 후보 집합 전체에 0 | 일부 후보만 결측으로 불리해지지 않도록 함 |
| 저장 | 없음 | 주어진 입력으로 signal 동작을 완성하는 범위 |
| 서비스 연결 | 후속 작업 | 공유 발급 계약과 화면까지 변경이 퍼지는 것을 범위에서 제외 |

현재 `Signal.key`는 `keyof SignalWeights`이며 공유 가중치에는 `random`만 있다. `SignalWeights`에 바로 `personalFit`을 추가하면 web의 `SIGNAL_LABELS: Record<keyof SignalWeights, string>` 등도 수정해야 한다. 따라서 이번에는 공유 가중치를 확장하지 않는다.

도메인 `Signal`만 `Signal<K extends string = keyof SignalWeights, C extends SignalContext = SignalContext>`로 표현하도록 최소 확장한다. `key: K`, `score(candidate: Candidate, context: C): number`를 가지며 기존 `Signal` 사용처는 기본 타입으로 유지된다. 새 인스턴스는 `Signal<'personalFit', PersonalFitContext>`를 사용한다. 엔진의 제네릭화나 새로운 추천 엔진은 만들지 않는다.

이 인스턴스는 직접 호출·검증할 수 있지만 현재 발급 엔진의 등록 타입에는 아직 포함되지 않는다. 후속 활성화 시 공유 키·기본 가중치·서비스 등록·context 준비·화면 호환을 함께 결정한다.

## 5. 프로젝트 구조도

| 워크스페이스 | 이번 구현 변경 |
| --- | --- |
| `apps/api` | 기존 issuance 도메인 안에 signal·입력·준비 함수·테스트 추가 |
| `apps/web` | 없음 |
| `packages/contracts` | 없음 |
| `packages/db` | 없음 |
| `e2e` | 없음 |

![시그널 구성과 메모리 데이터 흐름](./src/diagrams/signal-overview.svg)

[PNG](./src/diagrams/signal-overview.png) · [확대 보기](./src/diagrams/signal-overview.html)

화살표는 메모리 입력과 함수 호출이다. web·HTTP·DB 연결을 뜻하지 않는다. 도표는 Archify에서 생성한 SVG이며 같은 원본의 PNG·확대용 HTML도 함께 제공한다.

## 6. app 및 패키지 내부 구조도

```text
apps/api/src/issuance/domain/signals/
  signal.ts                              # 기본 타입을 보존하는 타입 매개변수 추가
  implementations/
    random-signal.ts                     # 기존 인스턴스 유지
    personal-fit-signal.ts               # 새 인스턴스 하나
    personal-fit-signal.test.ts
    personal-fit-input.ts                # 사용 사건·벡터·context 타입
    prepare-personal-fit.ts              # 순수 정제·프로필·점수 준비
    prepare-personal-fit.test.ts
```

별도 recommendations 도메인, Nest 모듈, 컨트롤러, 저장소 어댑터를 만들지 않는다. 준비 함수는 새 signal의 계산 보조 함수이며 별도 signal 인스턴스가 아니다.

## 7. 구현에 포함되는 도메인, 테이블

새 테이블·JSON 컬렉션은 없다. 다음은 함수에 전달하는 메모리 입력 계약이다.

| 입력 | 필요한 정보 |
| --- | --- |
| 사용 사건 | 거래 ID, revision, 실제 사용자 ID 또는 null, 가게 ID, 사용·기록 시각, 확정·취소 상태, 순사용액, 당시 내용 버전 |
| 가게 벡터 | 가게 ID, 내용 버전, 모델·전처리 명세 ID, 알려진·검증된 시각, 유한한 벡터 |
| 준비 요청 | 고정 시민 ID, 중복 없는 후보 가게 ID와 내용 버전 목록, 기준 시각, 사용 사건, 벡터, 파라미터 |
| 준비 결과 | 시민 ID, 후보 집합, `enabled`, 비활성 이유, 가게 ID별 점수 |
| `PersonalFitContext` | 기존 `SignalContext`와 시민 ID별 준비 결과 맵 |

### 정제 규칙

1. 기준 시각까지 알려진 거래별 최신 revision을 먼저 고른다. 동일 거래·revision의 상이 payload는 무효 입력이다.
2. 그 뒤 실제 사용자 ID를 필터링한다. 사용자 정정이 이전 사용자 이력에 남지 않게 한다.
3. 관측 구간 `[t-lookback_days, t)`의 확정·순사용액 양수 사건만 사용한다. 전액 취소·미확정·사용자 불명은 제외한다.
4. 시민×가게×KST 날짜별 가장 최근 사건 하나를 남긴다. 같은 시각이면 거래 ID 오름차순 첫 사건을 쓴다.
5. 사건 당시 알려지고 검증된 내용 버전의 벡터를 사용한다. 현재 가게 내용으로 과거 내용을 대체하지 않는다.
6. 후보 벡터도 기준 시각까지 알려지고 검증된 버전이어야 한다.

### 산식과 기본값

| 파라미터 | 기본값 | 제약 |
| --- | --- | --- |
| `lookback_days` | 90 | 양의 유한 일수 |
| `half_life_days` | 30 | 양의 유한 일수 |
| `merchant_weight_cap` | 2 | 양의 유한 가중치 |
| `day_zone` | Asia/Seoul | 날짜별 중복 제거 기준 |
| `norm_epsilon` | 1e-12 | 이 이하 노름 무효 |

```text
age_e = (t - used_at_e) / 86400초
r_e = 2 ^ (-age_e / half_life_days)
W_h = sum(r_e for merchant(e)=h)
a_e = r_e * min(1, merchant_weight_cap / W_h)
z = sum(a_e * v_e) / sum(a_e)
p = z / norm(z)
personalFit(u,m) = min(1, max(0, dot(p, v_m)))
```

벡터는 같은 명세·차원의 유한한 비영 벡터인지 검증하고 정규화한다. 실제 모델 선택·특징 생성은 입력 제공자의 책임이며 이 구현의 완료 조건이 아니다. 점수는 사용 확률이나 만족도가 아니다.

이력 없음, 필요한 벡터 하나라도 누락, 차원·명세 불일치, 비유한 값, 0 벡터, 프로필 노름 상쇄는 해당 시민의 후보 집합 전체를 비활성화한다. 모든 후보 점수를 유한한 0으로 준비한다. 다른 시민의 준비 결과에는 영향을 주지 않는다. 비활성 이유는 준비 결과에 보관하며 HTTP 응답이나 설명 UI를 추가하지 않는다.

## 8. API 계약 정의

신규 HTTP API는 없다. 내부 호출 계약만 정의한다.

- `preparePersonalFit(input)` — 동일 입력에 동일한 준비 결과를 반환하는 순수 함수.
- `personalFitSignal.key` — `'personalFit'`.
- `personalFitSignal.score(candidate, context)` — 시민·가게 ID로 준비 결과를 조회하여 0~1의 유한한 숫자를 반환한다.
- 준비 결과가 없거나 비활성이면 0을 반환한다. 활성 결과에 없는 후보 조회는 호출 계약 오류로 처리한다. 후보 집합이 바뀌면 먼저 다시 준비해야 한다.
- context는 요청·테스트 단위로 주입한다. 모듈 전역에 사용자별 상태를 저장하지 않는다.
- 가중합·선택·랜덤 대체 가중치는 signal의 책임이 아니다. 이 인스턴스는 다른 신호를 호출하거나 가중치를 변경하지 않는다.

## 9. 브랜치 위상정렬 그래프 및 개요

설계와 구현을 두 브랜치로 나누고 `gh stack`으로 아래 순서의 PR을 연결한다. 구현 브랜치는 설계 브랜치를 기반으로 생성한다.

```text
main
└── s12171934/behavior-signal-design       (D01 · KAN-23 · 설계)
    └── s12171934/kan-24-personal-fit-signal (B01 · KAN-24 · 구현)
```

D01 PR의 base는 `main`, B01 PR의 base는 `s12171934/behavior-signal-design`이다. B01은 작업 계획을 담은 Draft로 시작한다. 앱 코드 구현과 테스트는 아직 수행하지 않았으며, Draft 생성은 구현 완료를 뜻하지 않는다.

## 10. 브랜치별 구현 계획

| 단계 | 브랜치 | 변경 범위 | 현재 산출물 |
| --- | --- | --- | --- |
| D01 · KAN-23 | `s12171934/behavior-signal-design` | 설계·도표·범위·티켓맵·인덱스 | 설계 문서와 PR |
| B01 · KAN-24 | `s12171934/kan-24-personal-fit-signal` | 아래 CP-01~03의 도메인 코드·단위 테스트 | 구현 착수 계획만 담은 Draft PR |

D01에는 앱 코드가 없으며, B01의 구현 완료 조건은 다음과 같다.

| 컴포넌트 | 파일·변경 | 완료 조건 |
| --- | --- | --- |
| CP-01 | `signal.ts`, `personal-fit-input.ts` | 기존 random 타입 유지, 새 키와 context 표현 |
| CP-02 | `prepare-personal-fit.ts`와 테스트 | 정제·산식·결측 규칙 검증 |
| CP-03 | `personal-fit-signal.ts`와 테스트 | 인스턴스 조회·시민 분리·동기 숫자 반환 검증 |

B01의 첫 검증은 같은 후보에 서로 다른 시민의 준비 점수를 주었을 때 각 시민의 점수를 반환하는 테스트다. 구현은 준비 계산과 signal 조회를 완성하는 데서 끝난다.

### 10.1 컴포넌트 의존성과 작업 순서

CP-01이 입력·출력 타입을 확정하면 CP-02와 CP-03은 그 계약을 기준으로 구현한다. CP-03은 수동으로 만든 준비 결과로 조회를 먼저 검증할 수 있고, 실제 준비 함수와의 연결은 CP-02 완료 뒤 검증한다. 아래 작업 ID는 B01 안의 구현 단위이며 별도 브랜치·티켓을 추가한다는 뜻이 아니다.

| 순서 | 작업 ID | 구체적인 산출물 | 다음 작업으로 넘어가는 기준 |
| --- | --- | --- | --- |
| 1 | CP-01-A~C | 기본 타입 확장, 입력·결과·context 계약 | 기존 `Signal` 호출이 유지되고 새 인스턴스의 타입을 표현할 수 있음 |
| 2 | CP-03-A | 동일 가게·다른 시민 조회의 첫 실패 테스트(TC-01) | 시민별 결과를 바꿔 반환하면 실패하는 단언이 있음 |
| 3 | CP-02-A~E | 정제·벡터 검증·프로필·전체 점수 준비와 테스트 | 정상 산술과 시민 단위 전체 비활성 처리가 검증됨 |
| 4 | CP-03-B~C | signal 조회 구현, 실제 준비 결과 연결 테스트 | 준비 → 반복 조회 → 후보 변경 후 재준비가 검증됨 |
| 5 | B01 검증 | 신규 테스트, 기존 random·엔진 회귀, 타입 검사·전체 테스트·빌드 | 12장의 실행 명령과 결과를 구현 PR에 기록함 |

### 10.2 CP-01 — signal 타입과 메모리 입력 계약

**책임과 파일.** `signal.ts`는 기존 signal의 기본 타입을 유지하는 확장만 담당한다. `personal-fit-input.ts`는 이 기능에서만 쓰는 타입과 파라미터 기본값을 정의한다. 사용 사건을 기존 소비 레코드에서 만들어 내는 어댑터는 포함하지 않는다.

| 작업 ID | 구현 내용 | 확인할 결과 |
| --- | --- | --- |
| CP-01-A | `Signal<K extends string = keyof SignalWeights, C extends SignalContext = SignalContext>`로 변경하고 `key: K`, `context: C`를 적용한다. 주석도 기본 키 제약과 명시적 확장을 구분하도록 고친다 | `randomSignal: Signal`, 엔진의 `Record<keyof SignalWeights, Signal>`, 기존 서비스 등록은 그대로 컴파일됨 |
| CP-01-B | 아래 입력 타입, 파라미터 및 기본값을 정의하고 중첩 배열·필드에 `readonly`를 적용한다 | 외부 입력을 함수 안에서 정렬·정규화하며 직접 변경할 수 없음 |
| CP-01-C | 활성/비활성 결과를 `enabled`로 구분하는 유니온과 `PersonalFitContext`를 정의한다 | 활성은 `reason: null`, 비활성은 이유 코드가 필수이며 시민별 결과를 별도로 주입할 수 있음 |

내부 TypeScript 필드명은 camelCase로 통일한다. 7장의 `lookback_days`, `half_life_days`, `merchant_weight_cap`, `day_zone`, `norm_epsilon`은 각각 `lookbackDays`, `halfLifeDays`, `merchantWeightCap`, `dayZone`, `normEpsilon`에 대응한다.

| 타입(예정) | 필드·표현 | 구현 시 고정할 규칙 |
| --- | --- | --- |
| `PersonalFitUsageEvent` | `transactionId`, `revision`, `actualUserId: string 또는 null`, `merchantId`, `usedAt`, `recordedAt`, `status`, `netAmount`, `contentVersion` | revision은 0 이상의 안전한 정수, 상태는 `confirmed`/`cancelled`. 시각은 UTC epoch 밀리초이며 문자열 파싱은 입력 제공자의 책임 |
| `PersonalFitMerchantVector` | `merchantId`, `contentVersion`, `specId`, `knownAt`, `verifiedAt`, `values: readonly number[]` | `specId`는 모델·전처리 버전 조합을 식별. 알려진 시각과 검증 시각을 별도로 보존 |
| `PersonalFitCandidateRef` | `merchantId`, `contentVersion` | 한 준비 요청에서 가게 ID는 유일. 동일 가게의 서로 다른 내용 버전을 후보로 함께 넣지 않음 |
| `PersonalFitParams` | 위 다섯 파라미터 | 기본값은 7장과 동일. `dayZone`은 이번 버전에서 `Asia/Seoul`만 허용하며 `normEpsilon`도 양의 유한 값이어야 함 |
| `PreparePersonalFitInput` | `citizenId`, `candidates`, `asOf`, `events`, `vectors`, `params` | 생략한 파라미터만 기본값 적용. 명시적으로 잘못 준 값은 기본값으로 덮지 않음 |
| `PreparedPersonalFit` | `citizenId`, 후보 ID·버전 목록, `asOf`, `signalVersion`, `enabled`, `reason`, `scoresByMerchantId` | 모든 후보 ID의 점수가 존재. 신호 버전은 `personalFit.behavior.v1`. 비활성 결과도 후보 목록을 보존하고 점수는 모두 0 |
| `PersonalFitContext` | `SignalContext` 확장, `personalFitByCitizenId` | 시민 ID → 준비 결과의 읽기 전용 조회 맵. 기존 `random`은 상속하되 새 signal은 호출하지 않음 |

점수 맵은 외부에 변경 메서드를 노출하지 않는 읽기 전용 형태로 제공한다. 결과 객체·후보 목록·점수 저장 객체는 입력과 참조를 공유하지 않도록 복사하고 동결한다. `Object.freeze(new Map())`만으로 `set()`이 막힌다고 가정하지 않는다. 문자열 ID 조회에는 소유 키 검사 또는 동등한 안전한 조회 방식을 사용한다.

**오류 경계.** 호출 계약 자체를 만들 수 없는 입력과, 계산에 사용할 수 없는 데이터를 구분한다. 잘못된 기준 시각·파라미터·빈 시민 ID·빈 후보 집합·중복 후보 ID는 준비 함수가 동기 예외로 거부한다. 이력 없음이나 필요한 벡터의 결함은 7장대로 비활성 결과를 반환한다. 시각·ID·revision 등 사건의 구조가 잘못되어 안전한 정제가 불가능한 경우도 `INVALID_HISTORY`로 비활성화하며 임의로 이전 revision을 살리지 않는다. 예외는 도메인의 `Error` 계열로 표현하고 HTTP 오류 코드나 기존 `IssuanceError`에 결합하지 않는다.

**완료 기준.** 새 타입이 `packages/contracts`나 web 수정 없이 표현되고, `randomSignal`과 기존 엔진·서비스의 타입 검사가 통과한다. API의 `tsconfig.json`은 `*.test.ts`를 제외하므로 테스트 파일 실행만으로 타입 호환성을 확인했다고 기록하지 않는다.

### 10.3 CP-02 — 순수 정제·프로필·점수 준비

**책임과 공개 경계.** `prepare-personal-fit.ts`가 `preparePersonalFit(input): PreparedPersonalFit`을 내보낸다. 내부 단계는 같은 파일의 비공개 함수로 분리하고 테스트는 공개 준비 함수의 결과를 기준으로 작성한다. 시각·벡터·사용 사건은 모두 입력으로 받으며 모듈 전역 캐시나 외부 호출을 두지 않는다.

| 작업 ID | 처리 순서와 내부 함수 역할(예정) | 출력·실패 처리 | 연결 테스트 |
| --- | --- | --- | --- |
| CP-02-A | `validateRequest`에서 기준 시각·후보 유일성·파라미터를 검증하고 기본값을 확정한다 | 유효한 요청과 모든 후보가 0인 결과를 만들 공통 재료. 호출 계약 위반은 예외 | TC-10 |
| CP-02-B | `selectHistory`에서 기준 시각까지 알려진 거래의 최신 revision → 실제 사용자 → 상태·금액·관측 구간 → KST 날짜별 중복 제거를 수행한다 | 결정적 순서의 사건 목록. 충돌·무효 이력 또는 빈 이력은 비활성 | TC-04~06, TC-11 |
| CP-02-C | `resolveVectors`에서 남은 사건과 후보에 필요한 벡터만 찾아 시점·내용 버전·명세·차원·값·노름을 검증하고 복사본을 정규화한다 | 사건별·후보별 단위 벡터. 하나라도 무효이면 전체 비활성 | TC-06~07, TC-12 |
| CP-02-D | `buildProfile`에서 최근성, 가게별 합산과 상한, 가중 평균, 프로필 정규화를 순서대로 계산한다 | 단위 프로필. 분모 0·비유한 중간값·노름 상쇄는 전체 비활성 | TC-02, TC-04, TC-07 |
| CP-02-E | `scoreCandidates`에서 모든 후보의 내적을 구하고 유한성을 확인한 뒤 0~1로 제한한다. 완성된 맵을 복사·동결해 반환한다 | 전 후보의 활성 점수 또는 전 후보가 0인 비활성 결과. 계산 중인 일부 점수는 반환하지 않음 | TC-03, TC-07, TC-09, TC-13 |

**CP-02-B의 정제 세부 순서.**

1. 사건의 구조를 검증한 뒤 `recordedAt <= asOf`인 레코드를 거래별로 모은다. 미래 기록은 최신 revision 선별에 참여시키지 않는다.
2. 동일 거래·revision의 payload는 객체 참조나 JSON 키 순서가 아니라 정의된 필드 값으로 비교한다. 완전히 같은 중복은 하나로 접고, 다른 값이 있으면 `INVALID_HISTORY`로 비활성화한다. 충돌 검사는 사용자 필터보다 먼저 수행한다.
3. 거래별 가장 큰 revision을 선택한다. 기록 시각이 가장 늦다는 이유로 낮은 revision을 선택하지 않는다. 최신 revision이 취소되었거나 사용자·사용 시각이 정정되었다면 이전 값을 되살리지 않는다.
4. `actualUserId === citizenId`, `status === 'confirmed'`, `netAmount > 0`, `asOf - lookbackDays * 86_400_000 <= usedAt < asOf`인 사건을 남긴다. 금액 크기로 추가 가중하지 않는다.
5. `Asia/Seoul` 날짜를 명시적으로 구해 시민×가게×날짜로 묶는다. 서버 로컬 시간대에 의존하지 않는다. 가장 최근 `usedAt`, 동률이면 거래 ID 오름차순으로 하나를 선택한다.
6. 합산에 사용할 목록은 가게 ID·사용 시각·거래 ID로 정렬한다. 입력 배열 순서가 달라도 부동소수점 합산 순서가 바뀌지 않도록 한다.

이력 검증 실패는 해당 `preparePersonalFit` 호출만 비활성화한다. 다른 시민의 context 항목을 수정하지 않는다. 여러 시민이 포함된 사건 입력은 거래 정정을 확인하기 위해 사용자 필터 전 정제가 필요하며, 다른 시민을 별도로 준비하는 호출에서도 같은 무효 입력이 발견되면 그 호출은 독립적으로 비활성화될 수 있다.

**CP-02-C의 벡터 조회 규칙.** 과거 사건의 기준은 `usedAt`, 후보의 기준은 `asOf`다. `knownAt`과 `verifiedAt`이 모두 해당 기준 이하인 벡터만 사용할 수 있다. 가게 ID·내용 버전을 정확히 맞추며 미래 벡터나 현재 내용 버전으로 대체하지 않는다. 같은 가게·내용 버전에 대한 완전히 동일한 벡터 중복은 접고, 해당 시점에 사용 가능한 레코드가 서로 상충하면 `INVALID_VECTOR`로 비활성화한다. 입력 제공자가 한 요청에 같은 명세를 제공하도록 하고, 여러 모델 중 하나를 함수가 임의 선택하지 않는다.

필요한 모든 벡터는 같은 `specId`와 양의 차원을 가져야 한다. 각 성분과 계산된 노름이 유한하고 노름이 `normEpsilon`보다 큰지 확인한다. 큰 유한 성분의 제곱으로 불필요한 오버플로가 생기지 않도록 최대 절댓값으로 스케일링하는 등 안정적인 노름 계산을 사용한다. 정제에서 제외된 사건이나 요청에 없는 가게의 벡터 결함은 필요한 벡터 검증에 포함하지 않는다.

**CP-02-D/E의 산술과 비활성 처리.** 7장의 산식을 그대로 적용한다. 동일 가게의 서로 다른 과거 내용 버전도 가게별 상한을 함께 적용하고, 가중 평균에는 각 사건 당시 벡터를 각각 사용한다. 정규화 전 가중치 합·프로필 성분·노름·내적의 유한성을 확인한다. 내적이 음수이면 정상 점수 0이며, NaN을 clip으로 숨기지 않는다.

| 비활성 이유 코드(예정) | 발생 지점 | 결과 |
| --- | --- | --- |
| `INVALID_HISTORY` | 사건 구조 오류 또는 동일 거래·revision 충돌 | 해당 준비 결과의 모든 후보 0 |
| `NO_HISTORY` | 정제 후 사용 가능한 사건 없음 | 동일 |
| `MISSING_VECTOR` | 필요한 버전의 시점 조건을 만족하는 벡터 없음 | 동일 |
| `INVALID_VECTOR` | 상충 벡터, 명세·차원 불일치, 비유한 성분, 0 또는 너무 작은 노름 | 동일 |
| `INVALID_PROFILE` | 가중치 합 무효, 프로필 노름 상쇄, 계산 중 비유한 값 | 동일 |

여러 문제가 있으면 CP-02-A→E의 단계 순서에서 처음 발견한 이유를 반환한다. 같은 단계에서도 정렬된 키 순서로 검사하여 입력 배열 순서에 따라 이유가 달라지지 않게 한다. 비활성 결과 생성은 공통 비공개 함수 한 곳으로 모아 후보 누락·부분 점수 반환을 방지한다.

**완료 기준.** TC-02~07과 추가 경계 테스트가 공개 준비 함수를 통해 통과하고, 입력 배열·벡터가 변경되지 않는다. 사건·벡터 인덱스와 프로필은 준비 호출 안에서 한 번만 만들며 후보별로 이력 전체를 다시 정제하지 않는다. 후보 간 점수 순위뿐 아니라 손계산한 실제 숫자도 검증한다.

### 10.4 CP-03 — personalFitSignal 동기 조회

**책임과 파일.** `personal-fit-signal.ts`에서 `export const personalFitSignal: Signal<'personalFit', PersonalFitContext>`를 정의한다. 계산된 점수 조회만 담당하며 준비 함수를 내부에서 호출하지 않는다.

| 작업 ID | 구현 내용 | 확인할 결과 |
| --- | --- | --- |
| CP-03-A | 같은 가게에 U1=.2, U2=.8의 준비 결과를 넣고 시민을 번갈아 조회하는 테스트를 먼저 작성한다 | 시민을 무시한 가게별 전역 점수 조회로는 통과할 수 없음 |
| CP-03-B | 아래 조회 분기를 순서대로 구현하고 `key`를 `'personalFit'`으로 고정한다 | 분기별 0 반환·실제 점수·계약 오류가 구분됨 |
| CP-03-C | CP-02의 실제 결과를 context에 넣는 통합 단위 테스트를 추가한다 | 준비 함수와 signal의 ID·점수 맵 계약이 함께 동작함 |

조회 순서는 다음과 같이 고정한다.

1. `candidate.citizen.id`로 `context.personalFitByCitizenId`를 조회한다. 없으면 0을 반환한다.
2. 조회된 결과의 `citizenId`가 맵 키와 다르면 잘못 조립된 context이므로 동기 계약 오류를 던진다.
3. `enabled === false`이면 0을 반환한다. 비활성 이유나 후보 수에 따라 다른 신호를 호출하지 않는다.
4. 활성 결과의 점수 맵에서 `candidate.merchant.id`의 소유 키를 확인한다. 키가 없으면 후보 집합 밖 조회 오류를 던진다. 저장된 0과 키 누락을 truthy 검사로 혼동하지 않는다.
5. 저장 점수가 유한한 0~1 숫자인지 확인하고 반환한다. 잘못 조립된 활성 결과의 NaN·Infinity·범위 밖 점수는 계약 오류로 처리하며 여기서 재계산·보정하지 않는다.

오류 메시지는 시민·가게 ID와 계약 위반 종류를 구분할 수 있게 작성하되 사용 사건 전체를 담지 않는다. 정상 반환은 항상 `number`이며 Promise를 반환하지 않는다. `random`에는 호출 시 실패하는 스텁을 넣어 개인화 조회가 난수를 소비하지 않는지 검증한다.

**재준비 경계.** 후보 ID·내용 버전, 기준 시각, 사용 사건, 벡터, 파라미터 중 하나라도 달라지면 호출자가 새로 준비해 해당 시민의 context 항목을 교체한다. 기존 `Candidate`에는 준비 시 사용한 내용 버전 계약이 없으므로 `score()`가 변경을 자동 감지한다고 가정하지 않는다. 이전 준비 결과는 변경하지 않고 유지되며, 다른 시민 항목도 유지한다.

**완료 기준.** TC-01·08·09 및 추가 조회 경계 테스트가 통과한다. 실제 준비 결과로 후보들을 반복 조회해도 값이 같고, 시민 U1을 다시 준비해도 U2 점수가 변하지 않는다. 서비스 등록·가중치·발급 HTTP 응답을 활성화하지 않은 상태에서 독립 인스턴스 호출로 완료를 확인한다.


## 11. 플로우 다이어그램 / 유스케이스 다이어그램

### 11.1 시그널 내부 로직 — 점수 준비

이 흐름은 새 인스턴스를 위한 `preparePersonalFit`의 내부 계산이다. 시민 한 명과 후보 집합 하나를 고정해 한 번 준비하고, `score()`는 그 결과를 재사용한다. 첫 도표의 유효 이력이 두 번째 도표의 벡터 조회·검증으로 이어진다.

![시그널 내부 로직: 최신 revision·사용자 필터·날짜 중복 제거](./src/diagrams/history-flow.svg)

[PNG](./src/diagrams/history-flow.png) · [확대 보기](./src/diagrams/history-flow.html)

![시그널 내부 로직: 벡터 검증·최근성·상한·프로필·점수와 실패 분기](./src/diagrams/profile-flow.svg)

[PNG](./src/diagrams/profile-flow.png) · [확대 보기](./src/diagrams/profile-flow.html)

최신 revision 선택은 사용자 필터보다 먼저 수행한다. 취소·사용자 정정이 이전 사용자 이력에 남지 않게 하기 위한 순서다. 벡터나 산술이 무효이면 일부 점수를 남기지 않고 해당 시민의 준비 결과 전체를 0으로 만든다. 다른 시민의 결과는 바꾸지 않는다.

### 11.2 시그널 내부 로직 — `personalFitSignal.score()`

![personalFitSignal.score의 조회·반환·오류 분기](./src/diagrams/score-flow.svg)

[PNG](./src/diagrams/score-flow.png) · [확대 보기](./src/diagrams/score-flow.html)

`score()`는 이력 정제·모델 추론·I/O·가중치 변경을 수행하지 않는다. 준비 결과를 시민 ID와 가게 ID로 조회하는 동기 경계다.

### 11.3 호출 순서와 재준비

![점수 준비와 후보별 반복 조회 순서](./src/diagrams/call-sequence.svg)

[PNG](./src/diagrams/call-sequence.png) · [확대 보기](./src/diagrams/call-sequence.html)

테스트에서 이 흐름을 직접 호출한다. 문서의 도표는 구현 예정 로직이며 화면·HTTP·DB 경로를 추가하지 않는다. 11.1·11.2는 필수 설계 도표로 유지하며 정제·산식·결측·조회 계약이 바뀌면 7·8장 및 테스트 계획과 함께 수정한다.

## 12. 테스트 실행계획

| 번호 | 입력·상황 | 기대 결과 |
| --- | --- | --- |
| TC-01 | 동일 가게·서로 다른 시민의 준비 점수 | 해당 시민 점수만 반환, 상태 공유 없음 |
| TC-02 | U1의 `(1,0)` 1일 전, `(0,1)` 31일 전 이력 | 프로필 `(0.89442719,0.44721360)` |
| TC-03 | TC-02와 A=(.8,.6), B=(0,1), C=(1,0) | 점수 약 .98386991 / .44721360 / .89442719, A>C>B |
| TC-04 | 동일 날짜 반복·여러 날짜 같은 가게 반복 | 날짜별 하나, 가게 가중치 합 상한 적용 |
| TC-05 | 타인 사용·사용자 정정·전액 및 부분 취소 | 최신 실제 사용자만 반영, 전액 제외, 부분 양수는 1건 |
| TC-06 | 관측 구간 경계·미래 기록·미래 내용 | 시작 포함·끝 제외, 미래 정보 제외 |
| TC-07 | 이력 없음·벡터 하나 누락·명세/차원 오류·NaN·0 벡터·프로필 상쇄 | 해당 시민 전체 후보 점수 0, 유한성 유지 |
| TC-08 | 활성 준비 집합 밖 후보 | 호출 계약 오류, 재준비 필요 |
| TC-09 | 동일 입력 반복·기존 random 테스트 | 결정적 결과, 기존 random 동작 유지 |
| TC-10 | 잘못된 기준 시각·파라미터, 빈 시민·후보, 중복 후보 ID | 준비 호출 계약 오류. 잘못된 값을 기본값으로 대체하지 않음 |
| TC-11 | 동일 revision 동일/상이 payload, revision과 기록 시각의 순서 역전, 날짜 경계·동률 | 동일 중복은 접고 충돌은 전체 비활성. 최신 revision 및 KST·거래 ID 규칙 준수 |
| TC-12 | 비정규 벡터, 아주 큰 유한 성분, 미래 검증 시각, 상충 벡터, 무관한 가게의 무효 벡터 | 안정적인 정규화와 시점 검사. 필요한 벡터의 결함만 반영 |
| TC-13 | 사건·벡터·후보 순서 변경, 입력 동결, 결과 생성 뒤 원본 배열 변경 | ID별 점수와 이유 동일, 입력 불변, 반환 결과가 원본 변경에 영향받지 않음 |
| TC-14 | 준비 결과 없음·비활성·저장 점수 0·context 시민 불일치·잘못된 점수 | 정상 결측은 0, 잘못 조립한 활성 결과는 계약 오류. `random` 호출 0회 |
| TC-15 | 실제 준비 → 반복 조회 → U1 후보 집합 변경 후 재준비, U2 결과 유지 | CP-02/03 연결 계약과 시민 간 독립성 유지 |

구현 시 해당 signal·준비 함수 테스트와 기존 random·엔진 테스트를 실행한다. `pnpm typecheck`, `pnpm test`, `pnpm build`로 기본 타입 매개변수 변경이 기존 사용처를 깨뜨리지 않는지 확인한다. 신규 브라우저 E2E·모델 추론·추천 API 테스트는 이번 완료 조건에 넣지 않는다.

테스트 픽스처는 UTC epoch 밀리초로 고정한 기준 시각, 실제 사용자 ID가 명시된 가상 사건, 2차원 가상 벡터를 사용한다. 날짜 경계는 KST 자정 직전·직후를 별도로 구성한다. 산술 단언은 독립적인 손계산 기대값과 소수점 8자리 수준의 허용 오차를 사용하고, 비활성 점수는 정확한 0과 유한성을 함께 단언한다. 가게 상한은 cap 미만·정확히 cap·초과를 구분하고, 관측 구간 양 끝 및 `knownAt`·`verifiedAt`의 기준 시각 일치도 확인한다.

구현 단계의 실행 순서는 아래와 같다. 명령은 저장소 루트 기준이며 이번 문서 작업에서 실행했다는 뜻이 아니다.

```sh
pnpm --filter @im-coupon/api test src/issuance/domain/signals/implementations/personal-fit-signal.test.ts src/issuance/domain/signals/implementations/prepare-personal-fit.test.ts
pnpm --filter @im-coupon/api test src/issuance/domain/signals/implementations/random-signal.test.ts src/issuance/domain/services/engine.test.ts
pnpm typecheck
pnpm test
pnpm build
```

구현 PR에는 실행 명령·통과/실패·실패 시 원인과 조치를 기록한다. 현재 API 설정은 테스트 파일을 타입 검사 대상에서 제외하므로, 잘못된 제네릭 사용의 컴파일 실패를 별도로 주장하려면 해당 소스를 포함한 타입 검사 근거도 남긴다.

이번 문서 수정에서는 앱 테스트를 실행하지 않았다. 가상 벡터 산술은 signal 계산 검증용이며 실제 개인화 성능의 증거가 아니다.

## 13. 지라 티켓맵

| 단계 | 티켓 | 브랜치 | PR | 커밋·완료 범위 |
| --- | --- | --- | --- | --- |
| 에픽 | [KAN-22](https://ssong9520.atlassian.net/browse/KAN-22) | — | — | 설계와 구현의 상위 묶음 |
| D01 설계 | [KAN-23](https://ssong9520.atlassian.net/browse/KAN-23) | `s12171934/behavior-signal-design` | [PR #19](https://github.com/s12171934/im-coupon/pull/19) | 범위 축소·도표·티켓맵·브랜치 연결 |
| B01 구현 | [KAN-24](https://ssong9520.atlassian.net/browse/KAN-24) | `s12171934/kan-24-personal-fit-signal` | [PR #20 · Draft](https://github.com/s12171934/im-coupon/pull/20) | 현재 작업 계획만 작성. 후속: 타입·입력 / 준비 계산·테스트 / signal·테스트 |

`gh stack link`로 GitHub 네이티브 stack #21에 PR #19 → #20을 연결했다.

두 실행 티켓은 서브태스크가 아닌 Task이며 부모는 KAN-22다. KAN-4와 Relates 링크를 만들지 않는다. 이전 초안의 추천 API·저장소·web·평가 E2E 티켓 계획은 이번 범위에서 제거한다.

## 14. 설계 문서 변경 로그

- 2026-09-13 — 행동 이력 기반 개인화 초안 작성.
- 2026-09-13 — 사용자 범위 정정에 따라 `randomSignal`과 같은 signal 인스턴스 하나를 추가하는 설계로 축소. web·추천 API·DB·모델 실행 도구·브라우저 E2E 및 6단계 스택 계획을 제거했다.
- 2026-09-13 — 공유 가중치를 확장하면 web 변경이 필요한 현재 타입 결합을 확인했다. 도메인 signal 타입만 최소 확장하고 서비스 활성화는 후속으로 분리했다.
- 2026-09-13 — 이전 범위의 생성 도표·API/저장 레코드 예시·생성 및 검증 스크립트를 제거했다. 현재 범위의 검증 기록은 [문서 검증 기록](./src/validation.md)에 둔다.
- 2026-09-13 — 구조도, 시그널 내부 준비·조회 플로우, 호출 시퀀스를 추가했다. 내부 로직 플로우는 필수 설계 항목으로 명시했다.
- 2026-09-13 — Mermaid 블록을 Archify SVG 5개로 교체했다. 이력 정제와 프로필 계산을 나눠 정상·실패 분기를 보존하고, PNG·HTML·원본 JSON 및 검증 기록을 함께 보관한다.

- 2026-09-13 — Jira MCP로 에픽 KAN-22와 설계 Task KAN-23·구현 Task KAN-24를 생성했다. 기존 설계 브랜치와 별도 구현 브랜치의 2단계 스택을 정의하고 구현은 작업 계획 Draft로 시작한다.
- 2026-09-13 — PR #19(설계, base main)와 PR #20(구현 계획 Draft, base 설계 브랜치)을 생성하고 gh-stack으로 stack #21에 연결했다. 실제 PR 번호를 티켓맵에 반영했다.

- 2026-09-13 — CP-01~03의 입력·출력 계약, 작업 순서·의존성, 정제·벡터·산술·조회 오류 경계, 재준비 책임과 컴포넌트별 완료 조건을 상세화했다. TC-10~15 및 실제 저장소 스크립트에 맞춘 구현 검증 명령을 추가했다.
