# KAN-13 프로토타입 쿠폰 발급 구현 — 설계문서

> 웹 발급 실행 화면의 버튼 한 번으로 쿠폰 1건을 발급해 JSON 파일 DB 에 저장하고, 내 쿠폰 화면에서 거래조건(배분 비율·이중 기한)과 함께 보여주는 것까지를 구현한다.
> 발급 대상은 가중치 결합 구조로 정하되, 이번 에픽에서 결합에 참여하는 신호는 랜덤 신호 하나다.
> 에픽 [KAN-13](https://ssong9520.atlassian.net/browse/KAN-13) 의 구현 착수 전 설계이며, 발급 이후의 라이프사이클은 기획 노선 미결이라 범위에서 제외한다.

## 1. 구현의 목표, 전제, 범위

### 목표

구현 완료 후 아래 문장이 전부 참이면 이 에픽은 끝난 것이다.

- 발급 실행 화면에서 발급 1건 실행 버튼을 누르면 쿠폰 1건이 생성되어 `data/runtime/coupons.json` 에 저장된다.
- 발급 대상(가맹점×시민)은 가중치 결합으로 정해지고, 결합에 참여하는 신호는 랜덤 신호 하나다.
- 발급 가중치를 요청 본문으로 바꿔 보낼 수 있다 — 가중치 외부 조절 노출이 구조로 서 있다.
- 내 쿠폰 화면에서 소유자로 선택한 시민의 쿠폰이 보이고, 카드에 액면·배분 비율·소유자 점유 기한·유효 소비 기한이 본문 크기로 표시된다.
- `pnpm build && pnpm e2e` 가 위 흐름을 브라우저에서 검증하고 통과한다.

### 전제

착수 전에 확인할 항목과 확인 방법·결과다. 전부 2026-09-06 에 확인되었다.

- 다섯 워크스페이스 모노레포가 서 있다 — `pnpm-workspace.yaml` 과 [저장소 구조와 기술 스택](../저장소-구조와-기술-스택.md) 대조 — 확인됨.
- 기존 단위 테스트가 통과한다 — `pnpm test` — 확인됨 (13건 통과).
- 기존 e2e 가 통과한다 — `pnpm build && pnpm e2e` — 확인됨 (3건 통과).
- `JsonFileDb` 가 원자적 쓰기와 시드 부트스트랩을 제공한다 — `packages/db/src/json-file-db.ts` — 확인됨.
- 에픽 티켓이 존재한다 — [KAN-13](https://ssong9520.atlassian.net/browse/KAN-13) — 확인됨. 본문 없이 제목뿐이므로 설계 근거는 이 문서와 `documents/` 가 진다.
- 발급 이후 라이프사이클(공개 풀·단독 점유·페이백)은 노선 미결이다 — [쿠폰 도메인 규칙](../쿠폰-도메인-규칙.md) 의 미결 절 — 확인됨. 그래서 이번 범위는 발급까지다.

### 범위 — 포함

- 정적 시드 — 가상 가맹점 5건·가상 시민 5건을 `data/seed/` 에 JSON 으로 커밋한다.
- 발급 엔진 — 신호 인터페이스 + 발급 가중치 결합. 구현하는 신호는 랜덤 신호 하나다.
- 발급 트리거 인터페이스 — 발급을 일으키는 계기의 추상화. 구현하는 발급 트리거는 시연 트리거 하나다.
- API 3개 — 발급 1개(`POST /api/coupons/issue`), 조회 2개(내 쿠폰·시민 목록). 오류 응답 포함 계약은 8장이다.
- 웹 화면 2개 — 발급 실행 화면(시연·관리 시점), 내 쿠폰 화면(시민 시점, 거래조건 고지 포함).
- 발급 e2e 1케이스 — 발급 실행부터 내 쿠폰 확인까지.

### 범위 — 제외

아래는 이번 에픽에서 만들지 않는다. [프로토타입 범위](../프로토타입-범위.md) 의 전체 범위에는 남아 있는 항목도 있고, 그 경우 이후 에픽의 몫이다.

- 랜덤 외 네 신호(사용자 소비 패턴·쿠폰 사용 패턴·가맹점 매출·가맹점 마케팅 수요) — 가중치 결합 구조에 자리만 남긴다.
- 소비 도달·참여 리워드·가맹점 요청 트리거 — 발급 트리거 인터페이스에 자리만 남기고, 이번 에픽의 발급은 시연 트리거로만 일으킨다.
- 발급 이후의 라이프사이클 전이(공개 풀·단독 점유·사용·페이백 지급·만료) — 기획 노선 미결. 발급은 쿠폰 레코드를 소유자 점유 상태와 두 기한으로 만들어 저장하는 데까지다.
- 모의 데이터 생성기 — 정적 시드로 대체한다.
- 어뷰징 방지 룰, 이력의 해시 체인 로그, 시뮬레이션 대시보드.
- JSON 파일의 파일 락 — 근거는 4장 결정 6.
- 지라 티켓 생성 — 13장은 계획만 적는다.

## 2. 용어 사전

- 본문·그림·코드 식별자 전체에서 아래 표기를 글자 단위로 동일하게 쓴다.
- 에픽 KAN-13 제목의 "티켓"은 이 저장소 SSOT 용어인 **쿠폰**을 가리킨다. 이 문서에서 "티켓"은 지라 이슈를 가리킬 때만 쓴다.

| 용어 | 정의 | 코드 식별자 |
| --- | --- | --- |
| 쿠폰 | 결제 이후의 페이백 권리를 나타내는 발급 단위 | `Coupon` (`packages/contracts/src/coupon.ts`) |
| 가맹점 | 쿠폰이 걸리는 가상 상점 | `Merchant` (`packages/contracts/src/merchant.ts`) |
| 시민 | 쿠폰을 발급받을 수 있는 가상 사용자 | `Citizen` (`packages/contracts/src/citizen.ts`) |
| 소유자 | 쿠폰을 발급받은 시민 | `Coupon.ownerId` · `Coupon.ownerName` |
| 발급 | 발급 후보 하나를 골라 쿠폰 레코드를 만들어 저장하는 것 | `POST /api/coupons/issue` · `CouponsService.issue` |
| 발급 트리거 | 발급을 일으키는 계기의 추상화. 발급 명령을 만들어 발급 유스케이스에 넘긴다 | `IssueTrigger` · `IssueCommand` (`apps/api/src/issuance/trigger.ts`) |
| 시연 트리거 | 발급 실행 화면의 버튼이 일으키는, 이번 에픽에서 구현하는 유일한 발급 트리거 | `manualTrigger` (`apps/api/src/issuance/manual-trigger.ts`) · `TriggerType` 의 `'manual'` |
| 발급 명령 | 발급 트리거가 만들어 넘기는 발급 1건의 입력 — 트리거 유형과 발급 가중치 덮어쓰기 | `IssueCommand` (`apps/api/src/issuance/trigger.ts`) |
| 발급 후보 | 발급 대상이 될 수 있는 가맹점×시민 쌍 | `Candidate` (`apps/api/src/issuance/signal.ts`) |
| 신호 | 발급 후보 하나에 0 이상 점수를 주는 단위 함수 | `Signal` (`apps/api/src/issuance/signal.ts`) |
| 랜덤 신호 | 이력 없이 작동하는 탐색용 신호. 이번 에픽에서 구현하는 유일한 신호 | `randomSignal` (`apps/api/src/issuance/random-signal.ts`) |
| 발급 가중치 | 신호별 결합 비중 | `SignalWeights` (`packages/contracts/src/issuance.ts`) |
| 가중치 결합 | 신호 점수 × 발급 가중치의 합으로 총점 최대 발급 후보를 고르는 것 | `selectCandidate` (`apps/api/src/issuance/engine.ts`) |
| 소유자 점유 상태 | 발급 직후의 쿠폰 상태. 이번 에픽의 유일한 상태 값 | `CouponStatus` 의 `'held'` |
| 소유자 점유 기한 | 소유자만 쿠폰을 온전히 쓸 수 있는 기간의 끝 시각 | `Coupon.heldUntil` · 파라미터 `ownerHoldDays` |
| 유효 소비 기한 | 쿠폰이 만료되는 시각 | `Coupon.expiresAt` · 파라미터 `openValidDays` |
| 액면 | 쿠폰 한 장의 혜택 금액 | `Coupon.faceValue` |
| 배분 비율 | 소유자와 소비자가 나눠 갖는 혜택 비율 | `Coupon.benefitSplit` (`ownerRatio`·`consumerRatio`) |
| 거래조건 고지 | 배분 비율과 이중 기한을 화면 본문 크기로 노출하는 것 | `MyCouponsPage` 의 렌더 규칙 |
| 발급 엔진 | 신호·가중치 결합을 묶은, NestJS 비의존 순수 함수 모듈 | `apps/api/src/issuance/` |
| 발급 실행 화면 | 발급을 일으키는 시연·관리 시점 화면 | `IssuePage` (`apps/web/src/pages/issue-page.tsx`) |
| 발급 결과 카드 | 발급 실행 화면에서 `201` 응답의 쿠폰·선택 근거를 보여주는 영역 | `IssuePage` 의 결과 표시 영역 |
| 내 쿠폰 화면 | 시민이 소유한 쿠폰 목록 화면 | `MyCouponsPage` (`apps/web/src/pages/my-coupons-page.tsx`) |
| 탭 셸 | 두 화면을 전환하는 상단 탭 구조 | `App.tsx` (`apps/web/src/App.tsx`) |
| UI 전용 컴포넌트 | props 만 받아 그리며 fetch·상태 로직이 없는 컴포넌트 | `apps/web/src/components/` |
| 로직 훅 | 화면의 fetch·상태 로직을 지는 훅 | `apps/web/src/hooks/` |
| 테스트 코드 번호 | 테스트 케이스에 부여하는 식별자. 케이스 이름이 이 번호로 시작한다 | `TC-<브랜치 번호>-<일련번호>` (12장) |
| 컴포넌트 코드 번호 | `apps/web` 구현 컴포넌트에 부여하는 식별자. 컴포넌트당 커밋 1건의 단위다 | `CP-<브랜치 번호>-<일련번호>` (10장) |
| 시드 | 커밋되는 초기 데이터 | `data/seed/` |

- "이중 기한"은 소유자 점유 기한과 유효 소비 기한 둘을 묶어 부르는 말로만 쓴다. 개별 기한을 가리킬 때는 각 용어를 쓴다.

## 3. 핵심 구현 내용 요약

이번 에픽으로 추가·변경되는 것의 전체 목록이다. 항목마다 9장의 구현 브랜치가 붙는다.

- 가상 가맹점·시민 시드 데이터 — `KAN-13/01-seed-and-contracts`
- 쿠폰·발급 계약 타입과 경로·오류 상수 — `KAN-13/01-seed-and-contracts`
- 랜덤 신호와 가중치 결합 발급 엔진, 발급 트리거 인터페이스와 시연 트리거 — `KAN-13/02-issuance-engine`
- 발급 API 와 coupons 컬렉션 저장 — `KAN-13/03-issue-endpoint`
- 내 쿠폰 조회 API 와 시민 목록 API — `KAN-13/04-list-endpoints`
- 발급 실행 화면과 탭 셸 — `KAN-13/05-issue-screen`
- 내 쿠폰 화면과 거래조건 고지 — `KAN-13/06-my-coupons-screen`
- 발급 → 내 쿠폰 확인 e2e — `KAN-13/07-issuance-e2e`

## 4. 아키텍처 결정표

| # | 결정 사항 | 검토한 선택지 | 채택안 | 근거 | 영향 범위 |
| --- | --- | --- | --- | --- | --- |
| 1 | 발급 엔진의 위치 | 새 워크스페이스 `packages/issuance` / `apps/api` 내부 모듈 | `apps/api/src/issuance/` | 워크스페이스 다섯을 유지. 이식성은 순수 함수 경계로 확보 | `apps/api` |
| 2 | 신호 확장 구조 | 단일 함수에 하드코딩 / `Signal` 인터페이스 + 발급 가중치 맵 | 인터페이스 + 맵 | 제외된 네 신호를 나중에 같은 틀로 추가 | `apps/api` · `packages/contracts` |
| 3 | 난수·현재 시각 공급 | 전역(`Math.random`·`Date.now`) 직접 호출 / 주입 | RNG 와 시계를 인자로 주입 | 테스트가 고정 값으로 결정적으로 판정 | `apps/api` |
| 4 | 파라미터 기본값 위치 | 환경변수 / 시드 파일 / 코드 상수 | `apps/api/src/issuance/params.ts` 상수 한 곳 | 7장 값 표와 1:1 대응. 발급 가중치만 요청 본문으로 덮어쓸 수 있다 | `apps/api` |
| 5 | 쿠폰 레코드의 자기완결 | 조회 시 조인 / 발급 시 스냅샷 | 가맹점명·소유자명·액면·배분 비율·두 기한을 레코드에 스냅샷 | 아래 문장 참조 | `packages/contracts` · `apps/api` |
| 6 | coupons 동시 쓰기 보호 | 파일 락 / 프로세스 내 직렬화 / 보호 없음 | 프로세스 내 직렬화 + 기존 원자적 쓰기 | 아래 문장 참조 | `apps/api` |
| 7 | 두 기한의 저장 형태 | 파라미터(일수)만 저장 / 발급 시 절대 시각을 계산해 저장 | ISO 8601 절대 시각 `heldUntil`·`expiresAt` 저장 | 화면·테스트가 계산 없이 판정. 파라미터 변경의 소급 영향 차단 | `packages/contracts` · `apps/api` |
| 8 | 화면 전환 방식 | react-router 도입 / 탭 상태 전환 | `App.tsx` 의 탭 상태 전환 | 화면이 둘뿐. 의존 추가 없이 Playwright 클릭으로 검증 가능 | `apps/web` |
| 9 | 발급 트리거 확장 구조 | 컨트롤러가 발급 유스케이스를 직접 호출 / `IssueTrigger` 인터페이스 + 트리거 구현 | 인터페이스 + 시연 트리거 구현 | 아래 문장 참조 | `apps/api` · `packages/contracts` |
| 10 | 화면 컴포넌트 구조 | 화면당 단일 컴포넌트 / UI 전용 컴포넌트·로직 훅 분리 + 화면 컴포넌트 조립 | 분리 + 조립 | 아래 문장 참조 | `apps/web` |

표 셀에 압축되지 않은 근거를 문장으로 푼다.

- 결정 5 — 배분 비율과 두 기한은 거래조건 고지 대상이다. 발급 뒤에 파라미터 기본값을 바꿔도 이미 발급된 쿠폰의 고지 내용이 바뀌면 안 되므로, 고지에 필요한 값 전부를 발급 시점에 레코드로 굳힌다. 부수 효과로 내 쿠폰 조회가 `coupons` 컬렉션 하나로 닫혀 조인이 없어진다.
- 결정 6 — `JsonFileDb` 의 쓰기는 이미 원자적(임시 파일 후 rename)이라 파일이 깨지지는 않지만, 읽고-더하고-쓰는 발급이 겹치면 나중 쓰기가 앞 쓰기를 덮어 레코드가 유실될 수 있다. API 는 단일 프로세스이므로 발급 쓰기를 프로세스 안에서 한 줄로 직렬화하면 충분하다. 프로세스 밖까지 막는 파일 락은 단독 점유(찜하기) 기획이 확정될 때의 몫이며, [저장소 구조와 기술 스택](../저장소-구조와-기술-스택.md) 의 미결로 이미 걸려 있다.
- 결정 9 — 소비 도달·참여 리워드·가맹점 요청 트리거는 각자 다른 계기에서 발급을 일으키지만, 트리거가 하는 일은 발급 명령(`IssueCommand` — 발급 가중치 덮어쓰기 등)을 만들어 `CouponsService.issue` 에 넘기는 것으로 같다. 신호 확장 구조(결정 2)와 대칭으로 인터페이스에 자리만 남기면 이후 에픽이 같은 틀로 트리거를 추가한다. 쿠폰 레코드에는 발급을 일으킨 발급 트리거 유형을 `trigger` 필드로 남긴다. 구성도는 6장에 있다.
- 결정 10 — 화면 안의 컴포넌트는 최소단위로 나눈다. UI 전용 컴포넌트(`apps/web/src/components/`)는 props 만 받아 그리고 fetch·상태 로직을 갖지 않는다. 로직은 훅(`apps/web/src/hooks/`)이 진다. 화면 컴포넌트(`apps/web/src/pages/`)는 훅과 UI 전용 컴포넌트를 조립만 한다. 이렇게 나누면 단위 테스트가 fetch 스텁 없이 UI 를, 렌더 없이 로직을 각각 검증할 수 있고, 커밋도 단위별로 쪼개진다 (13장).
- 이 장의 결정 중 구현 완료 시 `documents/` 주제 문서에 반영할 것 — 결정 6 은 [저장소 구조와 기술 스택](../저장소-구조와-기술-스택.md) 에, 결정 5·7·9 는 [쿠폰 도메인 규칙](../쿠폰-도메인-규칙.md) 에, 결정 10 은 [저장소 구조와 기술 스택](../저장소-구조와-기술-스택.md) 에 `- YYYY-MM-DD — <결정>` 으로 적는다.

## 5. 프로젝트 구조도

![프로젝트 구조 변화 — 변경 전과 변경 후](./src/프로젝트-구조-변화.svg)

- 왼쪽이 2026-09-06 의 `main`, 오른쪽이 KAN-13 스택이 전부 머지된 뒤다. 파란 항목이 새로 생기는 것이다.
- 기존 파일 중 수정되는 것은 `apps/web/src/App.tsx`, `apps/api/src/app.module.ts`, `packages/contracts/src/index.ts`, `data/seed/_meta.json` 넷뿐이다.
- 워크스페이스 경계와 의존 방향은 바꾸지 않는다 — [저장소 구조와 기술 스택](../저장소-구조와-기술-스택.md) 의 의존 규칙이 그대로 유지된다.

## 6. app 및 패키지 내부 구조도

![워크스페이스 내부 변화 — 다섯 워크스페이스와 시드 데이터](./src/워크스페이스-내부-변화.svg)

- `apps/web` — 세 층이 생긴다. 화면 조립(`pages/`), UI 전용 컴포넌트(`components/`), 로직 훅(`hooks/`) — 4장 결정 10 의 구조다. `App.tsx` 는 탭 셸이 되고, 기존 저장소 상태 표시는 UI 전용 컴포넌트로 추출해 발급 실행 화면(관리 성격)으로 옮긴다.
- `apps/api` — 모듈 3개가 생긴다. `issuance/`(발급 엔진과 발급 트리거 인터페이스, NestJS 비의존 순수 함수), `coupons/`(발급·내 쿠폰 API), `citizens/`(시민 목록 API).
- `packages/contracts` — 계약 파일 4개(`coupon.ts`·`merchant.ts`·`citizen.ts`·`issuance.ts`)가 생긴다.
- `packages/db` — 구현 변경 없음. `JsonFileDb` 가 그대로 7장의 세 테이블(`merchants`·`citizens`·`coupons`)을 서빙하고, 시드 검증 테스트 1파일만 추가된다.
- `e2e` — 스펙 1파일(`issuance.spec.ts`)이 추가된다. 기존 스펙은 변경 없음.
- `data/` 는 워크스페이스가 아니지만 시드 2파일 추가와 `_meta.json` 수정이 있어 그림에 함께 그렸다.

발급의 인터페이스 구성이다 — 확장 축이 트리거와 신호 둘이라는 것이 이 그림의 주장이다.

![발급 트리거·신호 인터페이스 구성](./src/발급-트리거-인터페이스.svg)

- 발급 트리거는 발급을 일으키는 계기이고, 신호는 발급 후보의 점수다. 이번 에픽은 각 축에서 시연 트리거와 랜덤 신호 하나씩만 구현한다 (4장 결정 2·9).
- 어느 발급 트리거로 발급되든 `IssueTrigger` 아래의 경로는 하나다. 트리거는 발급 명령을 만들 뿐, 발급 후보 선택과 쿠폰 생성 규칙에는 관여하지 않는다.
- 점선 상자는 이후 에픽이 같은 인터페이스를 구현해 채우는 자리다. 이번 에픽에서 미리 만들지 않는다.

## 7. 구현에 포함되는 도메인, 테이블

이 저장소의 "테이블"은 JSON 파일이며 컬렉션 하나 = 파일 하나다. 도메인은 쿠폰 발급 하나이고 테이블은 셋이다.

### `merchants` — 가상 가맹점

- 경로 — `data/seed/merchants.json` 에 5건 커밋. API 기동 시 `data/runtime/` 으로 복사된다.
- 동시 쓰기 보호 — 불필요. 이번 에픽에서 읽기 전용이다.

| 필드 | 타입 | 제약 |
| --- | --- | --- |
| `id` | `string` | 컬렉션 안 유일. `mer-` 접두 |
| `name` | `string` | 비어 있지 않음 |
| `category` | `string` | 비어 있지 않음. 업종 표시용 자유 문자열 |

```json
{ "id": "mer-001", "name": "달성책방", "category": "서점" }
```

### `citizens` — 가상 시민

- 경로 — `data/seed/citizens.json` 에 5건 커밋. API 기동 시 `data/runtime/` 으로 복사된다.
- 동시 쓰기 보호 — 불필요. 이번 에픽에서 읽기 전용이다.

| 필드 | 타입 | 제약 |
| --- | --- | --- |
| `id` | `string` | 컬렉션 안 유일. `cit-` 접두 |
| `name` | `string` | 비어 있지 않음 |

```json
{ "id": "cit-001", "name": "김시민" }
```

### `coupons` — 발급된 쿠폰

- 경로 — `data/runtime/coupons.json`. 시드에 두지 않고 발급의 최초 쓰기가 만든다. `JsonFileDb` 는 없는 컬렉션을 빈 배열로 읽으므로 파일 부재가 오류가 아니다.
- 동시 쓰기 보호 — 필요. 프로세스 내 직렬화 큐 + 원자적 쓰기로 보호한다 (4장 결정 6).

| 필드 | 타입 | 제약 |
| --- | --- | --- |
| `id` | `string` | 컬렉션 안 유일. `cpn-` 접두 + `crypto.randomUUID()` |
| `status` | `'held'` | 이번 에픽의 유일한 상태 값 |
| `trigger` | `'manual'` | 발급을 일으킨 발급 트리거 유형. 이번 에픽의 유일한 값 |
| `ownerId` | `string` | `citizens.id` 참조 |
| `ownerName` | `string` | 발급 시점 스냅샷 |
| `merchantId` | `string` | `merchants.id` 참조 |
| `merchantName` | `string` | 발급 시점 스냅샷 |
| `faceValue` | `number` | 양의 정수(원) |
| `benefitSplit` | `{ ownerRatio, consumerRatio }` | 각 `0..1`, 합 `1` |
| `issuedAt` | `string` | ISO 8601 |
| `heldUntil` | `string` | ISO 8601. `issuedAt` 이후 |
| `expiresAt` | `string` | ISO 8601. `heldUntil` 이후 |

```json
{
  "id": "cpn-9b1c6a2e-3f47-4a6b-8f0e-2d5c7e1a4b93",
  "status": "held",
  "trigger": "manual",
  "ownerId": "cit-001",
  "ownerName": "김시민",
  "merchantId": "mer-001",
  "merchantName": "달성책방",
  "faceValue": 5000,
  "benefitSplit": { "ownerRatio": 0.2, "consumerRatio": 0.8 },
  "issuedAt": "2026-09-10T14:00:00.000+09:00",
  "heldUntil": "2026-09-13T14:00:00.000+09:00",
  "expiresAt": "2026-09-15T14:00:00.000+09:00"
}
```

기한 필드는 조건·인과가 있으므로 문장으로 푼다.

- `heldUntil` 은 발급 시각에 소유자 점유 기한 파라미터를 더해 계산한다 — `issuedAt + ownerHoldDays` 일.
- `expiresAt` 은 소유자 점유 기한 끝에 유효 소비 기한 파라미터를 더해 계산한다 — `heldUntil + openValidDays` 일.
- 이번 에픽에는 기한이 만료를 일으키는 전이가 없다. 두 값은 저장·고지까지만 쓰이고, 전이는 라이프사이클 에픽의 몫이다.
- `status` 에 `'held'` 외 값을 미리 만들지 않는다. 발급 이후 상태의 이름과 수는 기획 노선 미결이므로, 지금 추측해 넣은 값은 결정을 조용히 닫는 셈이 된다.
- `trigger` 도 같은 이유로 `'manual'` 외 값을 미리 만들지 않는다. 소비 도달·참여 리워드·가맹점 요청의 유형 값은 각 트리거를 구현하는 에픽에서 `TriggerType` 에 추가한다.
- 예시 레코드의 수치는 아래 값 표의 시연 기본값을 대입한 것이다.

### `_meta` — 예약 컬렉션

- `data/seed/_meta.json` 의 `schemaVersion` 을 `1` 에서 `2` 로 올린다. 시드에 `merchants`·`citizens` 컬렉션이 추가되기 때문이다.

### 파라미터 값 표

- 수치는 본문·코드에 박지 않고 파라미터로 둔다. 시연용 기본값은 이 표가 유일한 원본이고, 코드에서는 `apps/api/src/issuance/params.ts` 한 곳이 이 표를 든다 (4장 결정 4).
- 파라미터 이름과 후보값은 [프로토타입 범위](../프로토타입-범위.md) 의 파라미터 표와 대응한다. 표가 어긋나면 그쪽을 먼저 갱신한다.

| 파라미터 | 코드 식별자 | 시연 기본값 |
| --- | --- | --- |
| 액면(발급 금액) | `faceValue` | `5000` (원) |
| 배분 비율 — 소유자 몫 | `benefitSplit.ownerRatio` | `0.2` |
| 배분 비율 — 소비자 몫 | `benefitSplit.consumerRatio` | `0.8` |
| 소유자 점유 기한 | `ownerHoldDays` | `3` (일) |
| 유효 소비 기한 | `openValidDays` | `2` (일) |
| 발급 가중치 — 랜덤 신호 | `weights.random` | `1` |

## 8. API 계약 정의

- 설계 시점의 기준은 이 장이다. 구현 후에는 `packages/contracts` 코드가 SSOT 이고, 구현 중 계약이 바뀌면 이 장을 고치고 14장에 남긴다.
- 경로 상수·요청·응답·오류 타입은 전부 `packages/contracts/src/issuance.ts` 에 둔다.
- 오류 응답 본문은 세 엔드포인트 공통으로 다음 형태다.

```ts
interface ApiErrorResponse {
  error: { code: ApiErrorCode; message: string };
}
type ApiErrorCode =
  | 'INVALID_WEIGHTS'   // 발급 가중치가 숫자가 아니거나 음수이거나 합이 0, 또는 모르는 신호 키
  | 'NO_CANDIDATES'     // merchants 또는 citizens 가 비어 발급 후보가 없음
  | 'MISSING_OWNER_ID'  // ownerId 쿼리가 없거나 빈 문자열
  | 'UNKNOWN_OWNER'     // citizens 에 없는 ownerId
  | 'STORAGE_FAILURE';  // JSON 파일 읽기·쓰기 실패
```

### `POST /api/coupons/issue` — 발급

- 경로 상수 — `ISSUE_COUPON_PATH`. 구현 브랜치 — `KAN-13/03-issue-endpoint` (10장).
- 이 엔드포인트가 시연 트리거의 진입점이다. 컨트롤러는 요청 본문을 시연 트리거의 발급 명령으로 옮겨 `CouponsService.issue` 에 넘긴다 (4장 결정 9).
- 요청 본문 — 생략 가능하며, 생략하면 7장 값 표의 기본값으로 발급한다.

```ts
interface IssueCouponRequest {
  weights?: SignalWeights; // 발급 가중치 덮어쓰기
}
interface SignalWeights {
  random: number; // 제외된 네 신호의 키는 해당 신호를 구현하는 에픽에서 추가한다
}
```

- `201` — 발급 성공.

```ts
interface IssueCouponResponse {
  coupon: Coupon;          // 7장 coupons 테이블과 같은 모양
  decision: IssueDecision; // 시연에서 "왜 이 후보인가"를 보여주는 부속 정보
}
interface IssueDecision {
  candidateCount: number;             // 점수를 매긴 발급 후보 수
  scores: { random: number };         // 선택된 발급 후보의 신호별 점수
  total: number;                      // 발급 가중치를 곱해 합산한 총점
}
```

- `400 INVALID_WEIGHTS` — `weights` 가 있으나 값이 숫자가 아니거나 음수, 합이 0, 또는 모르는 신호 키가 있음.
- `422 NO_CANDIDATES` — `merchants` 또는 `citizens` 컬렉션이 비어 있어 발급 후보를 만들 수 없음.
- `500 STORAGE_FAILURE` — `coupons` 컬렉션 쓰기 실패.

### `GET /api/coupons?ownerId=<시민 id>` — 내 쿠폰 조회

- 경로 상수 — `COUPONS_PATH`. 구현 브랜치 — `KAN-13/04-list-endpoints` (10장).
- `200` — `{ coupons: Coupon[] }`. `issuedAt` 내림차순이고, 소유한 쿠폰이 없으면 빈 배열이다.
- `400 MISSING_OWNER_ID` — `ownerId` 쿼리가 없거나 빈 문자열.
- `404 UNKNOWN_OWNER` — `citizens` 에 없는 `ownerId`.
- `500 STORAGE_FAILURE` — 컬렉션 읽기 실패.

### `GET /api/citizens` — 시민 목록

- 경로 상수 — `CITIZENS_PATH`. 구현 브랜치 — `KAN-13/04-list-endpoints` (10장).
- 내 쿠폰 화면의 소유자 선택을 채우는 용도다. 프로토타입에는 로그인이 없으므로 시민 선택이 로그인을 대신한다.
- `200` — `{ citizens: Citizen[] }`. 시드에 든 순서 그대로다.
- `500 STORAGE_FAILURE` — 컬렉션 읽기 실패.

## 9. 브랜치 위상정렬 그래프 및 개요

![브랜치 그래프 — main 에서 07 까지의 선형 스택](./src/브랜치-그래프.svg)

- 스택은 이 문서당 1개이고 **gh-stack 으로 생성·관리한다.** 브랜치 이름은 `KAN-13/{number}-{detail}` 형식이다.
- `KAN-13/00-design-doc` 은 이 설계문서 브랜치다. 구현 브랜치가 아니므로 10·12·13장의 브랜치 집합에서 제외한다.
- 구현 브랜치는 01 부터 07 까지 일곱이고 선형이다. 각 브랜치가 앞 브랜치의 산출물(계약 타입 → 엔진 → API → 화면)을 바로 쓰므로 병렬 분기가 생기지 않는다.
- 각 브랜치는 단독으로 리뷰·머지할 수 있고, 머지 후에도 `pnpm test`·`pnpm typecheck` 전체가 통과해야 한다.

그래프 읽는 법이다.

- 레인(바탕색)이 그 브랜치가 수정하는 워크스페이스다 — `packages/*`·`data/seed` / `apps/api` / `apps/web` / `e2e` 네 레인.
- 화살표 A → B 는 "B 가 A 를 기반으로 한다"는 스택 의존이고, 간선 라벨은 B 가 A 에서 가져다 쓰는 것이다.

브랜치별 개요 한 줄과 수정하는 워크스페이스다.

- `KAN-13/01-seed-and-contracts` — 시드 데이터(가맹점·시민)와 쿠폰·발급 계약 타입, 시드 검증 테스트를 넣는 브랜치. 수정 — `packages/contracts` · `packages/db`(테스트만) · `data/seed`.
- `KAN-13/02-issuance-engine` — 랜덤 신호와 가중치 결합 엔진, 발급 트리거 인터페이스와 시연 트리거(전부 순수 함수)를 넣는 브랜치. 수정 — `apps/api`.
- `KAN-13/03-issue-endpoint` — 발급 API 와 coupons 컬렉션 저장(직렬화 큐)을 넣는 브랜치. 수정 — `apps/api`.
- `KAN-13/04-list-endpoints` — 내 쿠폰 조회 API 와 시민 목록 API 를 넣는 브랜치. 수정 — `apps/api`.
- `KAN-13/05-issue-screen` — 발급 실행 화면과 탭 셸을 넣는 브랜치. 수정 — `apps/web`.
- `KAN-13/06-my-coupons-screen` — 내 쿠폰 화면과 거래조건 고지를 넣는 브랜치. 수정 — `apps/web`.
- `KAN-13/07-issuance-e2e` — 발급부터 내 쿠폰 확인까지의 e2e 를 넣는 브랜치. 수정 — `e2e`.

## 10. 브랜치 별 구현 상세 내용

브랜치마다 첫 커밋 전에 여기 정의된 실패하는 테스트(RED)부터 작성한다. 구현 규율은 저장소의 테스트 우선 원칙을 따른다.

- 화면 브랜치의 RED 는 화면(조립) 수준에 둔다 — RED 를 먼저 쓰고, 그것을 통과시키는 과정에서 훅과 UI 전용 컴포넌트를 각자의 테스트와 함께 만든다 (4장 결정 10).
- 커밋은 13장의 커밋 계획대로 단위별로 쪼갠다 — 화면 브랜치는 컴포넌트당 1커밋이다. 각 커밋은 자기 테스트와 함께 초록인 상태로 닫는다. 실패하는 테스트만 든 커밋을 남기지 않는다.

### 구현 컴포넌트 목록

- `apps/web` 의 구현 컴포넌트에 컴포넌트 코드 번호 `CP-<브랜치 번호>-<일련번호>` 를 부여한다. 아래 브랜치 상세와 13장 커밋 계획은 이 번호로 컴포넌트를 가리킨다.
- 층 구분은 4장 결정 10 을 따른다 — UI 전용 컴포넌트 · 로직 훅 · 화면 조립(그리고 탭 셸).

| 번호 | 컴포넌트 | 층 | 파일 (`apps/web/src/` 기준) | 브랜치 |
| --- | --- | --- | --- | --- |
| `CP-05-01` | `App` — 탭 셸 | 탭 셸 | `App.tsx` (수정) | `KAN-13/05-issue-screen` |
| `CP-05-02` | `StorageStatus` — 저장소 상태 | UI 전용 컴포넌트 | `components/storage-status.tsx` | `KAN-13/05-issue-screen` |
| `CP-05-03` | `WeightsEditor` — 발급 가중치 입력 | UI 전용 컴포넌트 | `components/weights-editor.tsx` | `KAN-13/05-issue-screen` |
| `CP-05-04` | `IssuedCouponCard` — 발급 결과 카드 | UI 전용 컴포넌트 | `components/issued-coupon-card.tsx` | `KAN-13/05-issue-screen` |
| `CP-05-05` | `ErrorNotice` — 오류 영역 | UI 전용 컴포넌트 | `components/error-notice.tsx` | `KAN-13/05-issue-screen` |
| `CP-05-06` | `useIssueCoupon` — 발급 호출 | 로직 훅 | `hooks/use-issue-coupon.ts` | `KAN-13/05-issue-screen` |
| `CP-05-07` | `IssuePage` — 발급 실행 화면 | 화면 조립 | `pages/issue-page.tsx` | `KAN-13/05-issue-screen` |
| `CP-06-01` | `OwnerSelect` — 소유자 선택 | UI 전용 컴포넌트 | `components/owner-select.tsx` | `KAN-13/06-my-coupons-screen` |
| `CP-06-02` | `CouponCard` — 쿠폰 카드와 거래조건 고지 | UI 전용 컴포넌트 | `components/coupon-card.tsx` | `KAN-13/06-my-coupons-screen` |
| `CP-06-03` | `useCitizens` — 시민 목록 조회 | 로직 훅 | `hooks/use-citizens.ts` | `KAN-13/06-my-coupons-screen` |
| `CP-06-04` | `useMyCoupons` — 내 쿠폰 조회 | 로직 훅 | `hooks/use-my-coupons.ts` | `KAN-13/06-my-coupons-screen` |
| `CP-06-05` | `MyCouponsPage` — 내 쿠폰 화면 | 화면 조립 | `pages/my-coupons-page.tsx` | `KAN-13/06-my-coupons-screen` |

- 모든 컴포넌트는 같은 자리에 `.test.tsx`(훅은 `.test.ts`) 테스트 파일을 함께 가진다.

### `KAN-13/01-seed-and-contracts`

- 파일맵 — 생성: `data/seed/merchants.json`(가상 가맹점 5건), `data/seed/citizens.json`(가상 시민 5건), `packages/contracts/src/coupon.ts`, `packages/contracts/src/merchant.ts`, `packages/contracts/src/citizen.ts`, `packages/contracts/src/issuance.ts`, `packages/db/src/seed-data.test.ts`. 수정: `data/seed/_meta.json`(`schemaVersion` 1→2), `packages/contracts/src/index.ts`.
- 넣는 것 — 7장 테이블에 대응하는 계약 타입, 8장의 요청·응답·오류 계약과 경로 상수, 시드 데이터.
- RED `TC-01-01` — `packages/db/src/seed-data.test.ts`: "`data/seed` 를 `JsonFileDb` 로 열면 `merchants`·`citizens` 가 각 5건이고, 모든 레코드의 `id`·`name`(가맹점은 `category` 포함)이 비어 있지 않으며 `id` 가 컬렉션 안에서 유일하다". 시드 파일이 아직 없으므로 처음에는 실패한다.
- 완료 조건 — `TC-01-01` 이 GREEN 이 되고 `pnpm test`·`pnpm typecheck` 전체 통과. 시드의 상호·인명은 실존하지 않는 가상 표본이다.

### `KAN-13/02-issuance-engine`

- 파일맵 — 생성: `apps/api/src/issuance/signal.ts`(`Signal`·`Candidate`), `apps/api/src/issuance/random-signal.ts`, `apps/api/src/issuance/engine.ts`(`selectCandidate`), `apps/api/src/issuance/trigger.ts`(`IssueTrigger`·`IssueCommand`), `apps/api/src/issuance/manual-trigger.ts`(+`manual-trigger.test.ts`), `apps/api/src/issuance/params.ts`(7장 값 표의 기본값), `apps/api/src/issuance/engine.test.ts`.
- 넣는 것 — 신호 인터페이스와 랜덤 신호, 발급 가중치 결합, 발급 트리거 인터페이스와 시연 트리거. NestJS 에 의존하지 않는 순수 함수로 두고 RNG 는 인자로 주입한다 (4장 결정 1·2·3·9).
- RED `TC-02-01` — `engine.test.ts`: "발급 가중치 `{ random: 1 }` 과 고정 수열을 반환하는 RNG 스텁으로 `selectCandidate` 를 두 번 호출하면 두 번 모두 같은 발급 후보가 선택되고, 반환된 `scores.random`·`total` 이 스텁 수열에서 계산한 기대값과 일치한다".
- 완료 조건 — `TC-02-01` 이 GREEN 이고 `TC-02-02`(가중치 거부)·`TC-02-03`(시연 트리거, 12장)을 포함. 기본값 수치가 `params.ts` 밖에 등장하지 않는다.

### `KAN-13/03-issue-endpoint`

- 파일맵 — 생성: `apps/api/src/coupons/coupons.module.ts`, `apps/api/src/coupons/coupons.controller.ts`, `apps/api/src/coupons/coupons.service.ts`, `apps/api/src/coupons/coupon.repository.ts`(`JsonFileDb` 래핑 + 직렬화 큐), `apps/api/src/coupons/candidate-source.ts`(`merchants`·`citizens` 를 읽어 발급 후보 생성), `apps/api/src/coupons/coupons.controller.test.ts`. 수정: `apps/api/src/app.module.ts`.
- 넣는 것 — 8장의 `POST /api/coupons/issue`. 컨트롤러는 요청 본문을 시연 트리거로 옮겨 발급 명령을 만들고 발급 유스케이스에 넘긴다 (4장 결정 9). 쿠폰 생성 시 두 기한 계산과 `trigger`·스냅샷 기록 (4장 결정 5·7), coupons 쓰기의 프로세스 내 직렬화 (4장 결정 6).
- RED `TC-03-01` — `coupons.controller.test.ts`(supertest): "임시 데이터 디렉터리에 시드를 부트스트랩한 뒤 `POST /api/coupons/issue` 를 보내면 `201` 과 `IssueCouponResponse` 계약을 만족하는 본문이 오고, `coupons` 컬렉션 레코드가 0건에서 1건이 된다".
- 완료 조건 — `TC-03-01` 이 GREEN 이고 오류 3종 `TC-03-02`~`TC-03-04` 와 동시 발급 유실 없음 `TC-03-05`(12장)를 포함.

### `KAN-13/04-list-endpoints`

- 파일맵 — 생성: `apps/api/src/citizens/citizens.module.ts`, `apps/api/src/citizens/citizens.controller.ts`, `apps/api/src/citizens/citizens.controller.test.ts`, `apps/api/src/coupons/list-coupons.test.ts`. 수정: `apps/api/src/coupons/coupons.controller.ts`·`coupons.service.ts`(내 쿠폰 조회 추가), `apps/api/src/app.module.ts`.
- 넣는 것 — 8장의 `GET /api/coupons?ownerId=` 와 `GET /api/citizens`.
- RED `TC-04-01` — `list-coupons.test.ts`: "`coupons` 컬렉션에 소유자 `cit-001` 의 쿠폰 1건을 미리 써 두면, `GET /api/coupons?ownerId=cit-001` 은 그 1건을 반환하고 `?ownerId=cit-002` 는 빈 배열을 반환한다".
- 완료 조건 — `TC-04-01` 이 GREEN 이고 오류 2종 `TC-04-02`·`TC-04-03` 과 시민 목록 `TC-04-04`(12장)를 포함.

### `KAN-13/05-issue-screen`

- 파일맵 — 생성: 컴포넌트 `CP-05-02`~`CP-05-07` 의 파일과 각 테스트 파일 (10장 구현 컴포넌트 목록). 수정: `CP-05-01`(`apps/web/src/App.tsx` — 탭 셸로 개편, 발급 실행·내 쿠폰 두 탭)과 `apps/web/src/App.test.tsx`.
- 넣는 것 — 발급 실행 화면. 기준은 [발급 실행 화면 와이어프레임](./src/발급-실행-화면.svg) (11장에 임베드) 이다. UI 전용 컴포넌트 넷(`CP-05-02`~`CP-05-05`)과 로직 훅 `CP-05-06`, 이를 조립만 하는 `CP-05-07`. 내 쿠폰 탭 자리는 만들되 내용은 `KAN-13/06-my-coupons-screen` 의 몫이다.
- RED `TC-05-01` — `issue-page.test.tsx`: "`fetch` 를 스텁한 상태에서 발급 1건 실행 버튼을 클릭하면 `POST /api/coupons/issue` 가 1회 호출되고, 스텁 응답의 `merchantName`·`ownerName` 이 발급 결과 카드에 나타난다".
- 완료 조건 — `TC-05-01` 이 GREEN 이고 `TC-05-02`(오류 표시, 12장)를 포함. UI 전용 컴포넌트가 `fetch`·전역 상태에 접근하지 않고, 훅과 UI 전용 컴포넌트가 각자의 테스트를 가진다.

### `KAN-13/06-my-coupons-screen`

- 파일맵 — 생성: 컴포넌트 `CP-06-01`~`CP-06-05` 의 파일과 각 테스트 파일 (10장 구현 컴포넌트 목록). 수정: `CP-05-01`(`apps/web/src/App.tsx` — 내 쿠폰 탭 연결).
- 넣는 것 — 내 쿠폰 화면. 기준은 [내 쿠폰 화면 와이어프레임](./src/내-쿠폰-화면.svg) (11장에 임베드) 이다. UI 전용 컴포넌트 둘(`CP-06-01`·`CP-06-02`)과 로직 훅 둘(`CP-06-03`·`CP-06-04`), 이를 조립만 하는 `CP-06-05`. 거래조건 고지는 `CP-06-02` 쿠폰 카드가 지며, 배분 비율과 이중 기한을 본문과 같은 글자 크기로 표시하고 축소 표기·각주 처리를 하지 않는다.
- RED `TC-06-01` — `my-coupons-page.test.tsx`: "시민 목록과 쿠폰 1건 응답을 스텁하면 카드에 액면·배분 비율(소유자 20% / 소비자 80%)·소유자 점유 기한·유효 소비 기한 텍스트가 존재하고, 거래조건 텍스트가 `small` 요소나 축소 클래스 없이 본문 단락으로 렌더된다".
- 완료 조건 — `TC-06-01` 이 GREEN 이고 `TC-06-02`(빈 상태, 12장)를 포함. UI 전용 컴포넌트가 `fetch`·전역 상태에 접근하지 않고, 훅과 UI 전용 컴포넌트가 각자의 테스트를 가진다.

### `KAN-13/07-issuance-e2e`

- 파일맵 — 생성: `e2e/tests/issuance.spec.ts`.
- 넣는 것 — 발급부터 내 쿠폰 확인까지의 브라우저 검증. 시작 상태 준비만 `packages/db` 로 직접 하고(저장소의 시드 예외 규칙), 그 뒤는 전부 화면과 HTTP 를 통한다.
- RED `TC-07-01` — `issuance.spec.ts`: "`coupons` 컬렉션을 빈 배열로 초기화한 뒤 — 발급 실행 화면에서 발급 1건 실행을 클릭하고, 발급 결과 카드에서 소유자명을 읽고, 내 쿠폰 화면에서 그 소유자를 선택하면 — 쿠폰 카드 1건과 거래조건(배분 비율·소유자 점유 기한·유효 소비 기한) 텍스트가 보인다".
- 완료 조건 — `TC-07-01` 이 GREEN 이고 `pnpm build && pnpm e2e` 전체 통과.

## 11. 플로우 다이어그램 / 유스케이스 다이어그램

두 화면의 와이어프레임이다. 그림의 라벨은 2장 용어 사전의 표기를 그대로 쓴다.

![발급 실행 화면 와이어프레임](./src/발급-실행-화면.svg)

![내 쿠폰 화면 와이어프레임](./src/내-쿠폰-화면.svg)

- 발급 실행 화면 — 발급 가중치를 보여주고 덮어쓸 수 있게 하며, 발급 1건 실행 버튼이 `POST /api/coupons/issue` 를 부른다. 결과 카드와 오류 영역이 같은 화면에 있다.
- 내 쿠폰 화면 — 소유자 선택이 로그인을 대신하고, 쿠폰 카드가 거래조건 고지(배분 비율·이중 기한, 본문 크기)를 진다.

발급의 정상 흐름과 실패 흐름이다.

![발급 흐름 — 정상 경로와 세 가지 실패 경로](./src/발급-흐름.svg)

- 정상 흐름 — 버튼(시연 트리거) → 발급 가중치 검증 → 발급 후보 적재 → 가중치 결합 → 쿠폰 생성 → coupons 컬렉션 저장 → `201` → 발급 결과 카드. 이후 내 쿠폰 화면의 확인은 별도 `GET` 요청이다.
- 실패 흐름 — 발급 가중치 검증 실패(`400 INVALID_WEIGHTS`), 발급 후보 없음(`422 NO_CANDIDATES`), 쓰기 실패(`500 STORAGE_FAILURE`) 셋이고, 전부 발급 실행 화면의 오류 영역에 코드·메시지로 표시된다.
- 이번 에픽에는 기한 만료로 일어나는 전이가 없으므로, 기한 초과 흐름은 그리지 않는다 — 두 기한은 저장·고지까지만 쓰인다 (7장).

## 12. 테스트 실행계획

### 테스트 코드 번호

- 케이스마다 테스트 코드 번호 `TC-<브랜치 번호>-<일련번호>` 를 부여한다. 테스트 코드의 케이스 이름은 이 번호로 시작한다 — 예: `test('TC-03-01 발급이 201 과 쿠폰 1건을 만든다')`.
- 각 브랜치의 첫 케이스(`TC-XX-01`)가 10장에 정의된 그 브랜치의 RED 테스트다. 나머지 번호는 10장 완료 조건이 요구하는 케이스다.
- 번호는 화면·API·엔진 수준 케이스에 붙인다. 훅·UI 전용 컴포넌트의 단위 테스트는 번호 케이스를 통과시키는 과정에서 커밋 단위로 함께 만들며 번호를 받지 않는다 (10장·13장).

### 브랜치별 테스트

브랜치별 실행 단위다.

| 브랜치 | 테스트 파일 | 실행 명령 |
| --- | --- | --- |
| `KAN-13/01-seed-and-contracts` | `packages/db/src/seed-data.test.ts` | `pnpm --filter @im-coupon/db test` |
| `KAN-13/02-issuance-engine` | `apps/api/src/issuance/engine.test.ts` · `manual-trigger.test.ts` | `pnpm --filter @im-coupon/api test` |
| `KAN-13/03-issue-endpoint` | `apps/api/src/coupons/coupons.controller.test.ts` | `pnpm --filter @im-coupon/api test` |
| `KAN-13/04-list-endpoints` | `apps/api/src/coupons/list-coupons.test.ts` · `apps/api/src/citizens/citizens.controller.test.ts` | `pnpm --filter @im-coupon/api test` |
| `KAN-13/05-issue-screen` | `apps/web/src/pages/issue-page.test.tsx` | `pnpm --filter @im-coupon/web test` |
| `KAN-13/06-my-coupons-screen` | `apps/web/src/pages/my-coupons-page.test.tsx` | `pnpm --filter @im-coupon/web test` |
| `KAN-13/07-issuance-e2e` | `e2e/tests/issuance.spec.ts` | `pnpm build && pnpm e2e` |

케이스 전체다. 구현 컴포넌트 목록(10장)과 같은 방식으로 적용 브랜치를 열로 적는다.

| 번호 | 브랜치 | RED | 입력 | 기대 결과 |
| --- | --- | --- | --- | --- |
| `TC-01-01` | `KAN-13/01-seed-and-contracts` | RED | `data/seed` 를 `JsonFileDb` 로 연다 | `merchants`·`citizens` 각 5건, `id`·`name`(가맹점은 `category` 포함) 비어 있지 않음, `id` 유일 |
| `TC-02-01` | `KAN-13/02-issuance-engine` | RED | 발급 후보 목록 + 발급 가중치 `{ random: 1 }` + 고정 수열 RNG 스텁 | 두 번 호출 모두 같은 발급 후보, `scores.random`·`total` 이 스텁 계산값과 일치 |
| `TC-02-02` | `KAN-13/02-issuance-engine` | — | 음수·전부 0·모르는 신호 키의 발급 가중치 각각 | 엔진이 각각을 거부 |
| `TC-02-03` | `KAN-13/02-issuance-engine` | — | 발급 가중치 덮어쓰기가 든 요청 본문 | 시연 트리거가 `'manual'` 과 그 가중치를 실은 발급 명령 생성 |
| `TC-03-01` | `KAN-13/03-issue-endpoint` | RED | 시드 부트스트랩 후 `POST /api/coupons/issue`(본문 없음) | `201`, `IssueCouponResponse` 계약 만족, `coupons` 0건 → 1건 |
| `TC-03-02` | `KAN-13/03-issue-endpoint` | — | `weights.random` 에 `-1` | `400` 과 `INVALID_WEIGHTS` |
| `TC-03-03` | `KAN-13/03-issue-endpoint` | — | `merchants` 가 빈 데이터 디렉터리 | `422` 와 `NO_CANDIDATES` |
| `TC-03-04` | `KAN-13/03-issue-endpoint` | — | 쓰기가 실패하도록 만든 데이터 디렉터리 | `500` 과 `STORAGE_FAILURE` |
| `TC-03-05` | `KAN-13/03-issue-endpoint` | — | 동시 `POST` 2건 | `coupons` 에 2건 모두 저장(유실 없음) |
| `TC-04-01` | `KAN-13/04-list-endpoints` | RED | `cit-001` 쿠폰 1건 기록 후 `?ownerId=cit-001`·`?ownerId=cit-002` 조회 | 앞은 그 1건, 뒤는 빈 배열 |
| `TC-04-02` | `KAN-13/04-list-endpoints` | — | `ownerId` 쿼리 없는 `GET /api/coupons` | `400` 과 `MISSING_OWNER_ID` |
| `TC-04-03` | `KAN-13/04-list-endpoints` | — | `?ownerId=cit-999`(시드에 없음) | `404` 와 `UNKNOWN_OWNER` |
| `TC-04-04` | `KAN-13/04-list-endpoints` | — | `GET /api/citizens` | 시드 순서 그대로 시민 5건 |
| `TC-05-01` | `KAN-13/05-issue-screen` | RED | `fetch` 스텁 상태에서 발급 1건 실행 버튼 클릭 | `POST /api/coupons/issue` 1회 호출, 응답의 `merchantName`·`ownerName` 이 발급 결과 카드에 표시 |
| `TC-05-02` | `KAN-13/05-issue-screen` | — | 오류 응답(`422 NO_CANDIDATES`) 스텁 | 오류 영역에 `error.code`·`error.message` 표시 |
| `TC-06-01` | `KAN-13/06-my-coupons-screen` | RED | 시민 목록과 쿠폰 1건 응답 스텁 | 액면·배분 비율(소유자 20% / 소비자 80%)·소유자 점유 기한·유효 소비 기한이 축소 표기 없이 본문 단락으로 표시 |
| `TC-06-02` | `KAN-13/06-my-coupons-screen` | — | 빈 쿠폰 목록 응답 스텁 | "발급된 쿠폰이 없습니다" 표시 |
| `TC-07-01` | `KAN-13/07-issuance-e2e` | RED | 아래 "구현 완료 후 E2E" 절의 절차 | 절차 3·5단계의 기대 충족 |

- 브랜치를 머지하기 전에는 워크스페이스 필터 없이 `pnpm test` 와 `pnpm typecheck` 전체를 돌린다.
- 단위 테스트는 `IM_COUPON_SEED_DIR`·`IM_COUPON_DATA_DIR` 를 임시 디렉터리로 갈아끼워 실제 `data/` 를 건드리지 않는다.

### 구현 완료 후 E2E

- 실행 명령 — `pnpm build && pnpm e2e`. Playwright 의 `webServer` 가 빌드 산출물(`node dist/main.js`, `vite preview`)을 띄운다.
- 케이스 `TC-07-01` — `e2e/tests/issuance.spec.ts` 하나를 추가한다.
  1. 준비 — `packages/db` 의 `JsonFileDb` 로 `coupons` 컬렉션을 빈 배열로 초기화한다.
  2. 발급 실행 화면에서 발급 1건 실행을 클릭한다.
  3. 기대 — 발급 결과 카드에 가맹점명·소유자명·액면이 나타난다. 소유자명을 변수로 읽어 둔다.
  4. 내 쿠폰 화면으로 전환해 그 소유자를 선택한다.
  5. 기대 — 쿠폰 카드 1건이 보이고, 카드에 배분 비율(소유자 20% / 소비자 80%)·소유자 점유 기한·유효 소비 기한 텍스트가 있다.
- 기존 e2e(`health.spec.ts`·`orphan-guard.spec.ts`)가 함께 통과해야 한다.

## 13. 지라 티켓맵

- 티켓은 2026-09-06 에 생성했다. 유형은 작업(Task), 브랜치당 티켓 1건, 부모는 에픽 [KAN-13](https://ssong9520.atlassian.net/browse/KAN-13), 본문은 요약 한 문단 + 커밋당 체크박스 1건이다.
- 부모를 KAN-1 이 아니라 KAN-13 으로 두는 규칙 변경은 [지라 티켓 연결](../지라-티켓-연결.md) 의 결정에 반영되어 있다.
- `KAN-13/00-design-doc` 은 구현 브랜치가 아니므로 티켓이 없다.
- 판단·수치·결정은 티켓에 두지 않는다. 티켓 본문은 이 문서를 가리키고 실행 상태만 든다.

| 브랜치 | 티켓 번호 | 티켓 제목 |
| --- | --- | --- |
| `KAN-13/01-seed-and-contracts` | [KAN-14](https://ssong9520.atlassian.net/browse/KAN-14) | 시드 데이터와 쿠폰 계약 타입 |
| `KAN-13/02-issuance-engine` | [KAN-15](https://ssong9520.atlassian.net/browse/KAN-15) | 발급 엔진 — 랜덤 신호·가중치 결합·발급 트리거 |
| `KAN-13/03-issue-endpoint` | [KAN-16](https://ssong9520.atlassian.net/browse/KAN-16) | 발급 API 와 쿠폰 저장 |
| `KAN-13/04-list-endpoints` | [KAN-17](https://ssong9520.atlassian.net/browse/KAN-17) | 내 쿠폰·시민 목록 조회 API |
| `KAN-13/05-issue-screen` | [KAN-18](https://ssong9520.atlassian.net/browse/KAN-18) | 발급 실행 화면 |
| `KAN-13/06-my-coupons-screen` | [KAN-19](https://ssong9520.atlassian.net/browse/KAN-19) | 내 쿠폰 화면과 거래조건 고지 |
| `KAN-13/07-issuance-e2e` | [KAN-20](https://ssong9520.atlassian.net/browse/KAN-20) | 발급 e2e |

### 커밋 계획

- 티켓 체크박스는 아래 커밋당 1건씩 만든다. 각 커밋은 자기 테스트와 함께 초록인 상태로 닫는다 (10장).
- `KAN-13/01-seed-and-contracts`
  1. 쿠폰·발급 계약 타입과 경로·오류 상수 (`packages/contracts`)
  2. 시드 데이터(가맹점·시민)와 시드 검증 테스트, `_meta` 판 올림
- `KAN-13/02-issuance-engine`
  1. 신호 인터페이스와 랜덤 신호
  2. 가중치 결합 엔진과 파라미터 기본값
  3. 발급 트리거 인터페이스와 시연 트리거
- `KAN-13/03-issue-endpoint`
  1. 쿠폰 저장 리포지터리와 직렬화 큐
  2. 발급 후보 적재(`candidate-source`)
  3. 발급 유스케이스와 `POST /api/coupons/issue`
  4. 오류 응답 3종 처리
- `KAN-13/04-list-endpoints`
  1. 내 쿠폰 조회 API (`GET /api/coupons?ownerId=`)
  2. 시민 목록 API (`GET /api/citizens`)
- `KAN-13/05-issue-screen` — 컴포넌트당 1커밋 (10장 구현 컴포넌트 목록)
  1. `CP-05-01` — 탭 셸
  2. `CP-05-02` — 저장소 상태 컴포넌트 추출
  3. `CP-05-03` — 발급 가중치 입력
  4. `CP-05-04` — 발급 결과 카드
  5. `CP-05-05` — 오류 영역
  6. `CP-05-06` — `useIssueCoupon` 훅
  7. `CP-05-07` — 발급 실행 화면 조립
- `KAN-13/06-my-coupons-screen` — 컴포넌트당 1커밋 (10장 구현 컴포넌트 목록)
  1. `CP-06-01` — 소유자 선택
  2. `CP-06-02` — 쿠폰 카드와 거래조건 고지
  3. `CP-06-03` — `useCitizens` 훅
  4. `CP-06-04` — `useMyCoupons` 훅
  5. `CP-06-05` — 내 쿠폰 화면 조립
- `KAN-13/07-issuance-e2e`
  1. 발급 e2e 스펙

## 14. 설계 문서 변경 로그

- 2026-09-06 — 최초 작성. 범위 축소 6건(랜덤 신호만 구현, 시연 버튼 트리거, 정적 시드, 티켓맵은 계획만, 화면 2개, 거래조건 본문 크기 고지)을 반영해 14장 전체를 작성했다.
- 2026-09-06 — 발급 트리거를 `IssueTrigger` 인터페이스로 추상화하고 시연 트리거를 유일 구현으로 정의했다 (4장 결정 9). 쿠폰 레코드에 `trigger` 필드를 더하고 인터페이스 구성도를 6장에 추가했다.
- 2026-09-06 — 화면 컴포넌트를 UI 전용 컴포넌트·로직 훅·화면 조립으로 나누는 결정을 더했다 (4장 결정 10). 이에 맞춰 10장 화면 브랜치의 파일맵을 다시 썼다.
- 2026-09-06 — 13장 커밋 계획을 브랜치당 1커밋에서 단위 커밋으로 세분화하고, 9장 그래프에 브랜치별 수정 워크스페이스를 표기하고, 12장에 테스트 코드 번호 `TC-<브랜치 번호>-<일련번호>` 를 도입했다.
- 2026-09-06 — 9장 그래프를 워크스페이스 레인(색 구분)과 의존 화살표·간선 라벨로 다시 그렸다. 12장 테스트 케이스를 표로 정리했다. 10장에 컴포넌트 코드 번호 `CP-<브랜치 번호>-<일련번호>` 를 단 구현 컴포넌트 목록 표를 더하고, 13장 화면 브랜치의 커밋을 컴포넌트당 1커밋으로 바꿨다.
- 2026-09-06 — 12장 케이스 표에 적용 브랜치 열을 더해 구현 컴포넌트 목록(10장)과 표기 방식을 맞췄다.
- 2026-09-06 — 13장 티켓맵대로 지라에 티켓 7건(KAN-14~KAN-20, 부모 에픽 KAN-13)을 생성하고 번호 칸을 채웠다. 에픽 KAN-13 본문에 이 문서의 요약을 반영했다.
