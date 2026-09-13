# KAN-24 personalFit 최종 검증 기록

- 2026-09-13 — CB1~3 구현을 대상으로 루트 타입검사·테스트·빌드를 통과하고 TC-01~15를 실제 단언에 연결했다. CB4는 검증 문서와 인덱스만 변경한다.
- 검증 base: `07a819373bc025bb0b0c56248915d41b9fa9f84f` (CB3), tree: `7b9a4f2ef3b97d9762f9076409167f90e53ab9a4`.
- 브랜치: `s12171934/kan-24-personal-fit-signal`. CB1·CB2·CB3 커밋 보존. 이 문서는 독립 리뷰 한 라운드와 발견사항 정정을 마친 CB4 커밋에 포함되는 검증 기록이다.

## 기준과 검증 대상 지문

설계 SSOT는 별도 설계 워크트리의 `/Users/junhyeong/orca/workspaces/im-coupon/behavior-signal-design/documents/behavior-signal-design/design.md`를 읽기 전용으로 확인했다. 이 checkout의 설계 복사본·착수 계획은 이전 시점 기록이며 최신 계약의 근거로 사용하지 않았다. SSOT SHA-256: `1f1ababb2a9375321364489c2ee535bb8c5ffa84faf9c51eb3e15b46888b7ccc`.

검증한 base와 CB4 커밋에 포함되는 코드·테스트·설정·lockfile·추적 입력은 같다. 문서 자체를 포함한 tree 해시를 문서 안에 넣는 자기참조를 피하기 위해 다음 지문을 사용한다.

| 대상 | base = CB4 코드 지문 |
| --- | --- |
| `apps` Git tree | `7e064bd808f34e8e9290afb6f650eb18d8f50fd9` |
| `packages` Git tree | `41eb40f0fa3cd06de2457dabedb977df3dbf5720` |
| `documents/` 제외 전체 index manifest SHA-256 | `51b4122f78a8eee51900be02ea60cb4c52c3351256122e7020dafd60f75a986f` |

manifest는 `git ls-files -s -z` 결과에서 탭 뒤 경로가 `documents/`로 시작하는 항목만 제외하고, 원래 순서와 각 항목 뒤 NUL을 유지한 바이트열의 SHA-256이다. 파일 모드·Git blob·경로를 포함하므로 소스 외 루트 설정·의존성 잠금·입력 변경도 드러난다. 최종 커밋·tree·diff 지문은 자기참조가 없는 완료 보고서 `/tmp/kan24-codex-cb4-final.md`에 기록한다.

## 실행 환경과 결과

cwd: `/Users/junhyeong/orca/workspaces/im-coupon/kan-24-personal-fit-signal`. filter 명령은 `apps/api`에서 실행된다. 2026-09-13 14:12~14:14 KST, Darwin arm64, Node `v26.3.0`, pnpm `11.5.1`, TypeScript `5.9.3`, Vitest `5.0.0`. 기존 의존성·Node/SWC·Vitest 설정을 유지했으며 설치나 설정 변경은 없다.

| CB4 신규 실행 명령 | exit | 결과 | 로그 |
| --- | --- | --- | --- |
| `pnpm typecheck` | 0 | Turbo 7/7 성공, 6 cached; API 새 실행 | `/tmp/kan24-cb4-root-typecheck.log` |
| `pnpm test` | 0 | Turbo 6/6 성공, 5 cached; API 16파일 197개 새 실행 | `/tmp/kan24-cb4-root-test.log` |
| `pnpm build` | 0 | Turbo 4/4 성공, 3 cached; API 새 실행 | `/tmp/kan24-cb4-root-build.log` |

API 197개에는 prepare 72개, personalFit signal 29개, 입력 기본값 3개, 기존 random 3개, engine 10개와 나머지 API 회귀 80개가 포함된다. web 14파일 147개와 db 2파일 13개는 캐시 재생 결과다(합계 357개 중 API 197개만 새 실행). contracts의 test 태스크는 테스트 러너 실행 개수에 더하지 않는다. 루트 typecheck의 기존 e2e 타입검사 캐시 재사용은 브라우저 E2E 실행을 뜻하지 않는다.

SSOT의 신규 prepare/signal 및 기존 random/engine 대상별 명령은 동일 Vitest 설정·픽스처로 위 API 전체 실행에 모두 포함되어 별도로 반복하지 않았다. CB2 루트 성공은 CB3 소스를 포함하지 않았으므로 그대로 최종 결과로 삼지 않고 이번 루트 명령을 실행했다. CB3 API 성공도 과거 근거로 보존하며, 최종 루트 API 결과는 이번 실행을 사용한다. 무변경 패키지는 Turbo가 같은 태스크 입력 해시로 판정한 캐시를 재사용했다. 문서 리뷰 정정 이후에도 실행에 영향을 주는 파일·환경·입력이 그대로이므로 기존 성공 결과를 재사용하고 명령을 반복하지 않았다.

기존 Vite `configLoader: native`의 CommonJS/ESM 향후 호환성 경고는 유지되었다. 명령 실패나 이번 작업의 코드 결함은 발견되지 않았다.

## TC 추적성

파일 약어는 아래 실제 소스 링크를 뜻한다. 표의 TC 접두어는 테스트 이름에서 검색할 수 있으며, 한 테스트가 여러 TC를 검증하거나 `it.each`로 여러 사례를 실행한다. 15개 TC와 런타임 테스트 197개는 서로 다른 집계다.

- P: [prepare-personal-fit.test.ts](../apps/api/src/issuance/domain/signals/implementations/prepare-personal-fit.test.ts)
- S: [personal-fit-signal.test.ts](../apps/api/src/issuance/domain/signals/implementations/personal-fit-signal.test.ts)
- R: [random-signal.test.ts](../apps/api/src/issuance/domain/signals/implementations/random-signal.test.ts)
- E: [engine.test.ts](../apps/api/src/issuance/domain/services/engine.test.ts)
- I: [personal-fit-input.test.ts](../apps/api/src/issuance/domain/signals/implementations/personal-fit-input.test.ts)

모든 행의 실행 근거는 CB4 루트 test의 API 197개 GREEN이다.

| TC | 파일·케이스 | 실제 단언과 해석 |
| --- | --- | --- |
| TC-01 | S `동일 가게 U1=.2, U2=.8을 번갈아 조회` | 결과 배열 `[.2,.8,.2,.8]`, key=`personalFit`; 시민별 결과 분리 |
| TC-02 | P `TC-02/03: 최근성 2:1 프로필과 손계산한 세 후보 점수` | 1일/31일 이력, 반감기 30일; 축 후보 점수 .8944271909999159/.4472135954999579로 프로필 방향을 공개 결과에서 검증 |
| TC-03 | P 위 TC-02/03 | A=.9838699100999074, C=.8944271909999159, B=.4472135954999579 및 A>C>B; 소수점 8자리 비교 |
| TC-04 | P `가게 합 .75에 cap=%s`, `같은 KST 날짜는 최신 사건`, `여러 내용 버전에 같은 상한` | cap 1/.75/.5로 미만·동일·초과 구분; 날짜별 최신/동률 ID 및 가게의 여러 버전 기여를 합한 상한 검증 |
| TC-05 | P `최신 정정 %j 뒤 이전 revision을 되살리지 않는다`, `최신 사용자만 반영하고 양수 금액 크기는 가중하지 않는다` | 타인·null 사용자, 취소, 0/음수 금액 제외; 정정된 사용자 반영; .01/100000 양수 금액도 같은 1건 가중 |
| TC-06 | P `관측 시작 포함, 끝 제외`, `TC-06/12: %s의 사건·후보 시점 일치와 미래 경계`, `과거 내용 버전을 현재 버전으로 대체하지 않는다` | lookback 시작 포함/끝 제외; recordedAt 기준 일치/+1ms; knownAt·verifiedAt의 사건/후보 기준 일치/+1ms; 과거 버전 없으면 MISSING_VECTOR |
| TC-07 | P `이력 없음은 벡터 문제보다 우선`, `필요한 %s 벡터 하나라도 없으면 모두 0`, `필요한 벡터 결함`, `상쇄 프로필, 최근성 언더플로`, `음의 내적은 활성 점수 0` | 공통 disabled 단언이 모든 후보 키·정확한 0·유한성·이유 검사; 차원/명세/NaN/Infinity/0/epsilon 경계 포함; 정상 음수 내적의 활성 0과 전체 비활성 구분 |
| TC-08 | S `소유 키가 없는 %s`, `프로토타입에서 물려받은 유효 숫자` | 일반 집합 밖 후보 및 __proto__/constructor/toString·상속 숫자는 CANDIDATE_NOT_PREPARED |
| TC-09 | P `입력 순서와 반복 호출`; S `TC-09/15`; R 3개, E 10개 | 같은 입력 결정성, 실제 준비 점수 3회 반복; R 고정 RNG 수열/동일 결과/key; E 가중합·기본값·동률·잘못된 가중치 회귀 |
| TC-10 | P `잘못된 기준 시각`, `명시적 무효 %s`, `빈 시민·후보·버전`, `잘못된 params 컨테이너`; I 기본값·버전·동결 3개 | NaN/Infinity/범위 밖 시각, 0/음수/undefined/null/문자열 파라미터, 중복 후보/잘못된 시간대는 throw; 생략 값만 기본값 |
| TC-11 | P `revision 우선이며 동일 필드 중복`, `다른 사용자의 동일 revision 충돌`, `KST 자정 양쪽`, `사건 구조 오류`, `비어 있는 배열 슬롯` 및 TC-04/11 | 기록 시각보다 revision 우선, 키 순서 무관 중복 제거, 사용자 필터 전 충돌 거부; KST 자정 1ms 전·정각(asOf는 자정 +1ms)·거래 ID 동률; 구조 오류는 INVALID_HISTORY |
| TC-12 | P `큰 유한 벡터와 비정규 벡터`, `동일 벡터는 접고 ... 상충 레코드`, `무관한 가게 및 제외 사건`; TC-06/12·07/12 | [3e200,4e200] 방향 .6/.8; 필요한 벡터만 검증, 시점상 제외된 상충 벡터 무시; 유한 성분이어도 노름이 비유한이면 비활성 |
| TC-13 | P `입력 순서와 반복 호출`, `동결 입력을 변경하지 않고`, `생성 뒤 원본 변경이 결과에 전파되지 않고` | 입력 역순의 ID별 점수/이유, 동결 입력 JSON 보존, 결과·후보·점수 동결, 원본 배열/성분 변경 후 독립성·특수 ID 소유 키 |
| TC-14 | S `다른 시민 결과만 있거나 빈 context`, `비활성 %s`, `시민 불일치`, `활성 소유 점수 %s`, `무효 활성 점수 %s` | 결측/비활성 0; disabled에서도 ID 검사 우선; 0/.2/1 정상; NaN/±Infinity/범위 밖/undefined/null/문자열은 INVALID_SCORE; random은 호출 시 throw하는 스텁 |
| TC-15 | S `실제 준비 결과를 반복 조회하고 U1 재준비 뒤 U2와 이전 결과를 보존`, `실제 준비한 특수 시민·가게 ID %s` | U1 shared v1+y→shared v2+new 재준비, shared .6→.8·new 0·제거 y 오류; U2 identity/.8/.6 및 이전 결과 보존; 특수 ID 실제 준비·조회 |

P의 고정 기준은 `Date.UTC(2026,8,13,3)`, S는 `Date.UTC(2026,8,13)`이다. 실제 사용자 ID를 명시한 가상 사건·2차원 벡터를 사용하며 현재 시각이나 모델을 조회하지 않는다. P의 독립 수치 기대값은 소수점 8자리, S의 .6/.8 통합 단언은 12자리로 비교한다.

## RED 및 타입 증거의 범위

TC-01의 CB3 기존 실행 로그를 열어 확인했다. 동일 명령 `pnpm --filter @im-coupon/api test src/issuance/domain/signals/implementations/personal-fit-signal.test.ts`의 이력은 다음과 같다.

1. 구현 모듈 부재: `/tmp/kan24-cb3-red.log`, exit 1, 실행 테스트 0개. 단언 실패가 아니다.
2. 최소 `score: () => 0` 골격: `/tmp/kan24-cb3-red-assertion.log`, exit 1, TC-01 단언 1개 실패. expected `[.2,.8,.2,.8]`, received `[0,0,0,0]`.
3. 조회 구현 후: `/tmp/kan24-cb3-green-tc01.log`, exit 0, 1개 통과. 경계 사례 확장 뒤 CB3 API 197개와 이번 CB4 API 197개 통과.

이는 CB3의 조회 구현 전 RED 이력이다. TC-01이 CB2 준비 함수 구현보다 먼저 실행되었다는 뜻은 아니다. 설계의 전체 작업 순서와 실제 체크박스 진행 순서는 이 지점에서 다르다. CB2의 극소 cap 결함은 별도 B1 회귀 4개 RED(4 failed/68 passed) 후 공통 가중치 스케일 수정으로 72개 GREEN이 된 기존 기록이다(`/tmp/kan24-cb2-b1-red.log`, `/tmp/kan24-cb2-b1-green.log`). P의 B1 사례는 이번 72개 실행에도 포함되었다.

[API tsconfig](../apps/api/tsconfig.json)는 `src/**/*.test.ts`를 제외한다. 따라서 production typecheck/build 통과와 Vitest 런타임 테스트 성공을 테스트 소스 전체의 정적 타입검사 성공이라고 합쳐 주장하지 않는다. 실제 `personalFitSignal: Signal<'personalFit', PersonalFitContext>`와 기존 random·엔진·서비스의 production 타입 호환성은 루트 typecheck로 확인했다.

CB2의 별도 test-source tsc는 다음 명령의 exit 0 기록(`/tmp/kan24-cb2-final-test-typecheck.log`, `/tmp/kan24-codex-cb2-final.md`)을 재사용한다.

```sh
pnpm --filter @im-coupon/api exec tsc --noEmit --target ES2023 --module commonjs --moduleResolution node --strict --noUncheckedIndexedAccess --esModuleInterop --skipLibCheck --experimentalDecorators --emitDecoratorMetadata src/issuance/domain/signals/implementations/prepare-personal-fit.test.ts
```

명시적 테스트 진입 소스는 **prepare-personal-fit.test.ts 하나**다. 이 파일이 import하는 prepare-personal-fit.ts → personal-fit-input.ts → signal.ts와 contracts/Vitest 등 타입 의존성이 해석되며, personal-fit-signal.test.ts·personal-fit-input.test.ts·random/engine 테스트를 포함하는 검사가 아니다. `--skipLibCheck`로 선언 파일 검사는 생략한다. CB2 이후 변경은 CB3 signal과 그 테스트 두 파일뿐으로 이 명령의 import 경로에 없고, 준비 함수/테스트의 SHA-256도 각각 `3b47ccc171fbefbf8817b3b8747f9b118826062673f5cde89b19b3a9e1447473` / `029330a5848970349c2d494f85c7eca4fc3dd9b815072c838694d14e1227a8a2`로 CB2 최종 보고와 일치한다. 환경·의존성도 같아 반복하지 않았다. 이 근거로 제네릭 오용의 별도 컴파일 실패를 검증했다고 주장하지 않는다.

## 리뷰 판정·코드 흐름·제약

독립 Codex 리뷰 한 라운드에서 A는 발견 0건, B는 P3 1건이었다. B의 TC-11 설명 정정을 승인하여 사건 시각(자정 1ms 전·정각)과 asOf(자정 +1ms)를 구분했다. 승인 1건·기각 0건·수정 완료 1건·미해결 0건이며 재리뷰는 수행하지 않았다. 문서 상대링크, TC-01~15 표, 변경 범위 두 파일, 비문서 지문 및 공백 오류를 확인했다.

종료코드 근거는 당시 실행자의 관측 기록이다. CB4 루트 명령의 exit 0은 이 구현 세션이 직접 관측했으며, 독립 리뷰는 원본 로그의 Turbo 성공 요약을 확인했을 뿐 과거 shell 종료코드를 직접 관측하지 않았다. CB2 별도 tsc 로그는 0바이트여서 단독으로 exit 0을 입증하지 못하며 당시 실행자의 최종 보고와 소스·환경 불변성을 근거로 재사용한다.

한국어 주요 블록 주석은 CB2·3에서 이미 반영되었다. 준비 함수의 요청 검증 → revision 정제 → 시민 이력 → 벡터 검증 → 가중 프로필 → 후보 점수/전체 비활성 흐름, 극소 가중치의 수치 안정성 및 전체 비활성 이유를 확인했다. signal은 시민 context 조회 → ID 일치 → disabled 처리 → own key → 점수검증 순서와 그 이유가 보인다. CB4에서는 코드·주석을 다시 수정하지 않았다.

가상 벡터 산술·메모리 계약의 검증이며 실제 개인화 성능, 모델 다운로드/추론, HTTP·DB·서비스 등록·공유 SignalWeights·web 활성화·브라우저 E2E는 검증 대상이 아니다. 후보 내용 버전 변경은 호출자가 재준비할 책임이며 score가 자동 감지하지 않는다. 알려진 코드 결함이나 실패 검증은 남아 있지 않다. CB4 독립 리뷰 한 라운드의 발견사항 정정과 문서 검증을 완료했다. `/tmp` 원본 로그는 로컬 임시 증거이므로 영구 보존을 보장하지 않으며 핵심 명령·결과·TC·지문은 이 문서에 옮겼다.
