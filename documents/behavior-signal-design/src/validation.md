# 문서 검증 기록

- 검증일 — 2026-09-13.
- 대상 — [현재 설계](../design.md), 문서 인덱스, 프로토타입 범위의 연결 설명.
- 코드 대조 — 기존 Signal·SignalContext, randomSignal, 발급 엔진, 서비스 등록 맵, SignalWeights와 web SIGNAL_LABELS의 타입 결합을 확인했다.
- 범위 — apps/api 도메인의 signal·입력·순수 준비 함수·단위 테스트만 구현 대상으로 남겼다. web·공유 계약·DB·e2e는 변경 없는 워크스페이스다.
- 정합성 — 14장 순서, 설계 D01·구현 B01 계획, 상대 링크, 가상 벡터의 점수 및 순위를 확인했다.
- 이전 산출물 — 추천 API·저장소·화면을 전제한 SVG·PNG·JSON과 생성/검증 스크립트는 현재 설계와 맞지 않아 제거했다. 이전 검증 결과를 현재 설계의 통과 근거로 사용하지 않는다.
- 미실행 — 앱 코드 구현, pnpm 테스트·타입 검사·빌드·E2E, 모델 추론, 실제 데이터 연동·성능 평가.

## Archify 다이어그램 검증

아래는 이전 설계 작업에서 수행한 검증 기록을 보존한 것이다. 티켓·브랜치 연결 작업에서 도표를 재생성하거나 시각 검증을 재실행하지 않았다.

- 최종 표현 — 본문에 SVG 5개를 직접 삽입하고 PNG·확대용 HTML을 연결했다. Mermaid 코드 블록은 제거했다.
- 도표 — 구성 흐름, 이력 정제, 프로필·점수 계산, score 조회, 호출 시퀀스. 앞 4개는 workflow, 마지막은 sequence다.
- 정합성 — 최신 revision → 사용자 필터 순서, 날짜별 중복 제거, 벡터 검증, 최근성·상한·프로필 계산, 내적 유한성 검사 후 clip, 해당 시민 전체 0 처리와 score 조회 분기를 본문 계약과 대조했다.
- 결정적 검증 — 5개 모두 Archify showcase 9/9, 구성 오류 0·경고 0. 원본 JSON과 HTML의 SHA-256·바이트 수는 각 `*.delivery.json`에 보관한다.
- 브라우저 검증 — 5개 모두 `visual-check` 통과. 1440×900, 1600×1000, 1920×1080, 2048×1320에서 가로·세로 넘침이 없었다. 원본에 결합된 측정·밝은/어두운 화면 캡처는 각 `*.visual-check.json`과 이미지에 보관한다.
- 시각 검토 — Codex가 내보낸 PNG 5개와 2048×1320의 HTML 밝은/어두운 테마 이미지 10개를 직접 열어 글자·분기·연결선·범위 표시를 확인했다. 자동 측정의 `visualReview: pending`과 별개로 사람/이미지 검토 결과는 아래 요약 JSON에 기록한다.
- 내보내기 — 검증된 HTML의 Archify Export 기능으로 SVG·PNG를 생성했다. 모두 canonical=true이며 뷰어의 임시 상태·조작 메뉴를 제외한다. HTML 및 내보낸 파일의 해시는 각 `*.export.json`에 기록한다.
- 언어 — 도표 내용은 한국어다. Archify 고정 뷰어 UI·`html lang`은 영어 기본값이며 일부 범례도 영어다.
- 이전 시도 — 이전 턴의 단일 HTML 흐름은 분기선 겹침으로 채택하지 않았다. 이번에는 의미별 도표로 다시 구성해 검증과 내보내기를 완료했다.
- 전체 결과 — [다이어그램 검증 요약](./diagrams/verification.json).
- 재생성 — 해당 JSON을 Archify `validate` → `deliver` → `visual-check`로 검증하고, 검증된 HTML의 Export → SVG / PNG로 내보낸다. JSON이 편집 원본이며 SVG를 별도로 수작업 수정하지 않는다.

| 도표 | 원본 JSON | 검증된 HTML | 배포·해시 기록 |
| --- | --- | --- | --- |
| signal-overview | [JSON](./diagrams/signal-overview.json) | [HTML](./diagrams/signal-overview.html) | [배포 기록](./diagrams/signal-overview.delivery.json) |
| history-flow | [JSON](./diagrams/history-flow.json) | [HTML](./diagrams/history-flow.html) | [배포 기록](./diagrams/history-flow.delivery.json) |
| profile-flow | [JSON](./diagrams/profile-flow.json) | [HTML](./diagrams/profile-flow.html) | [배포 기록](./diagrams/profile-flow.delivery.json) |
| score-flow | [JSON](./diagrams/score-flow.json) | [HTML](./diagrams/score-flow.html) | [배포 기록](./diagrams/score-flow.delivery.json) |
| call-sequence | [JSON](./diagrams/call-sequence.json) | [HTML](./diagrams/call-sequence.html) | [배포 기록](./diagrams/call-sequence.delivery.json) |

## 티켓·브랜치 연결 검증

- 2026-09-13 — Jira MCP 재조회로 에픽 KAN-22, Task KAN-23·KAN-24의 유형·부모 및 실제 체크박스 저장을 확인했다.
- 상대 링크 검사에서는 인덱스의 HTML 주석 안 등록 예시를 제외하고 실제 링크를 확인했다. 14장 순서와 티켓·브랜치 매핑도 확인했다.
- Markdown 변경의 공백 검사는 통과했다. 전체 변경 검사에서는 이전 Archify SVG 내보내기 CSS의 줄 끝 공백이 보고됐다. 내보내기 해시와 원본 바이트를 보존하기 위해 생성 SVG는 수정하지 않았다.
- gh-stack으로 PR #19 → #20 및 네이티브 stack #21 생성을 확인했다. 구현 PR은 작업 계획 Draft이며 앱 테스트·타입 검사·빌드는 미실행이다.

## 컴포넌트별 구현계획 상세화 검증

- 2026-09-13 — 설계 10장에 CP-01~03의 작업 ID, 의존 순서, 입력·결과 타입, 정제 단계, 오류 경계, 완료 기준을 추가했다. 12장에는 TC-10~15와 구현 시 실행할 명령을 추가했다.
- 코드 대조 — `signal.ts`, `random-signal.ts`와 기존 테스트, `engine.ts`, 루트·API `package.json`, API·공통 TypeScript 설정을 읽어 타입 확장 범위와 검증 명령을 확인했다. API 타입 검사는 테스트 파일을 제외한다는 제한도 명시했다.
- 문서 검사 — 최상위 14장 순서, TC-01~15의 중복 없는 정의, 설계의 로컬 상대 링크, Markdown 표 행 및 `git diff --check`를 확인했다.
- 도표 — 정제 → 벡터 검증 → 프로필·점수 → 동기 조회의 기존 흐름을 유지한다. 세부 입력 오류와 context 무결성 검사는 본문의 계약으로 구체화했다. 도표 생성·시각 검증은 재실행하지 않았다.
- 미실행 — 앱 구현, 단위 테스트, 타입 검사, 빌드. 본문에 추가한 명령과 테스트는 후속 B01의 실행 계획이다.
