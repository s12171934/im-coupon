# KAN-24 personalFitSignal 구현 착수 계획

- 에픽 — [KAN-22](https://ssong9520.atlassian.net/browse/KAN-22).
- 구현 Task — [KAN-24](https://ssong9520.atlassian.net/browse/KAN-24).
- 선행 설계 — [설계문서](design.md), KAN-23.
- 브랜치 — `s12171934/kan-24-personal-fit-signal`.
- PR base — `s12171934/behavior-signal-design`.
- 현재 상태 — 작업 계획만 작성한 Draft. 앱 코드와 테스트는 아직 작성·실행하지 않았다.

## 결정

- 2026-09-13 — 설계 브랜치 위에 구현 브랜치를 만들고 이 문서로 Draft PR을 시작한다. 세부 계약의 원본은 설계문서 7·8·12장이다.
- 2026-09-13 — 변경 대상은 `apps/api/src/issuance/domain/signals/`의 최소 타입 확장, 입력, 순수 준비 계산과 signal 조회 및 단위 테스트다. web·공유 SignalWeights·HTTP API·DB·모델 실행·실사용 로그·서비스 활성화는 제외한다.

## 구현 순서와 완료 조건

- [ ] CP-01: 기본 타입을 보존하는 Signal 제네릭과 PersonalFit 입력·context를 작성한다.
- [ ] TC-01: 같은 가게에 대한 서로 다른 시민의 점수가 분리되는 실패 테스트부터 시작한다.
- [ ] CP-02: 최신 revision 선택, 실제 사용자 필터, 날짜 중복 제거, 벡터 검증, 최근성·가게 상한·프로필·점수 계산을 순수 함수로 구현한다.
- [ ] CP-03: personalFitSignal의 동기 조회, 비활성 0 반환, 활성 집합 밖 후보 오류를 구현한다.
- [ ] TC-01~09 및 기존 random·엔진 회귀 테스트를 실행한다.
- [ ] pnpm typecheck·test·build 결과를 기록하고 구현 완료 여부를 문서에 반영한다.

## 미결

- [ ] 실제 코드 구현에 착수할 때 저장소의 구현 방식 선택 및 test-first 절차를 따른다.
- [ ] 위 구현·검증 완료 조건이 충족된 뒤 Draft 해제를 판단한다.
