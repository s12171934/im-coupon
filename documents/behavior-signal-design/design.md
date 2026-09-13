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

구현 시 해당 signal·준비 함수 테스트와 기존 random·엔진 테스트를 실행한다. `pnpm typecheck`, `pnpm test`, `pnpm build`로 기본 타입 매개변수 변경이 기존 사용처를 깨뜨리지 않는지 확인한다. 신규 브라우저 E2E·모델 추론·추천 API 테스트는 이번 완료 조건에 넣지 않는다.

이번 문서 수정에서는 앱 테스트를 실행하지 않았다. 가상 벡터 산술은 signal 계산 검증용이며 실제 개인화 성능의 증거가 아니다.

## 13. 지라 티켓맵

| 단계 | 티켓 | 브랜치 | PR | 커밋·완료 범위 |
| --- | --- | --- | --- | --- |
| 에픽 | [KAN-22](https://ssong9520.atlassian.net/browse/KAN-22) | — | — | 설계와 구현의 상위 묶음 |
| D01 설계 | [KAN-23](https://ssong9520.atlassian.net/browse/KAN-23) | `s12171934/behavior-signal-design` | 생성 후 기록 | 범위 축소·도표·티켓맵·브랜치 연결 |
| B01 구현 | [KAN-24](https://ssong9520.atlassian.net/browse/KAN-24) | `s12171934/kan-24-personal-fit-signal` | Draft 생성 후 기록 | 현재 작업 계획만 작성. 후속: 타입·입력 / 준비 계산·테스트 / signal·테스트 |

두 실행 티켓은 서브태스크가 아닌 Task이며 부모는 KAN-22다. KAN-4와 Relates 링크를 만들지 않는다. 이전 초안의 추천 API·저장소·web·평가 E2E 티켓 계획은 이번 범위에서 제거한다.

## 14. 설계 문서 변경 로그

- 2026-09-13 — 행동 이력 기반 개인화 초안 작성.
- 2026-09-13 — 사용자 범위 정정에 따라 `randomSignal`과 같은 signal 인스턴스 하나를 추가하는 설계로 축소. web·추천 API·DB·모델 실행 도구·브라우저 E2E 및 6단계 스택 계획을 제거했다.
- 2026-09-13 — 공유 가중치를 확장하면 web 변경이 필요한 현재 타입 결합을 확인했다. 도메인 signal 타입만 최소 확장하고 서비스 활성화는 후속으로 분리했다.
- 2026-09-13 — 이전 범위의 생성 도표·API/저장 레코드 예시·생성 및 검증 스크립트를 제거했다. 현재 범위의 검증 기록은 [문서 검증 기록](./src/validation.md)에 둔다.
- 2026-09-13 — 구조도, 시그널 내부 준비·조회 플로우, 호출 시퀀스를 추가했다. 내부 로직 플로우는 필수 설계 항목으로 명시했다.
- 2026-09-13 — Mermaid 블록을 Archify SVG 5개로 교체했다. 이력 정제와 프로필 계산을 나눠 정상·실패 분기를 보존하고, PNG·HTML·원본 JSON 및 검증 기록을 함께 보관한다.

- 2026-09-13 — Jira MCP로 에픽 KAN-22와 설계 Task KAN-23·구현 Task KAN-24를 생성했다. 기존 설계 브랜치와 별도 구현 브랜치의 2단계 스택을 정의하고 구현은 작업 계획 Draft로 시작한다.
