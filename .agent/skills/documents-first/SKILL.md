---
name: documents-first
description: >-
  Resolves what has already been decided in the `im-coupon` repository before any work starts.
  This repo keeps its decisions, progress log, and design policy as markdown under `documents/`
  at the repo root; code and git history do not record them. Load it at the start of every task
  in this repo that depends on prior context — implementing or changing a feature, choosing a
  library or a data shape, answering "왜 이렇게 되어 있나", writing a document, or reviewing a
  change — and before proposing any decision that `documents/` may already have settled.
  Triggers: "왜 이렇게 했어", "이거 어떻게 하기로 했지", "기획대로", "결정사항", "설계 방침",
  "진행 상황", 쿠폰 발급·소비 로직, 파일 DB·JSON 저장, 모노레포 구성, or any doubt about whether
  a choice is already fixed. It also fixes the repo's self-containment rule — committed files never
  name or link sources outside the repo — so load it before writing any committed text: docs, code
  comments, commit messages, PR bodies. Not for mechanical edits that introduce no decision (typo,
  rename, formatting).
---

# 프로젝트 문서 우선 (documents-first)

> 이 저장소의 결정·진행경과·설계방침의 SSOT 는 저장소 루트의 `documents/` 다.
> 이 스킬은 그곳으로 가는 진입 규칙이며, 결정 내용 자체는 여기 복제하지 않는다.

## 1. 착수 전에 읽는다

- 이 저장소에서 **맥락에 의존하는 작업**은 `documents/` 를 읽는 것으로 시작한다. 코드부터 열지 않는다.
- 대상 — 기능 구현·변경, 라이브러리나 데이터 형식 선택, 설계 질문 답변, 문서 작성, 변경 리뷰.
- 비대상 — 오타 수정·이름 변경·포매팅처럼 새 결정이 생기지 않는 기계적 편집.
- 읽기 순서는 `documents/_index.md` → 거기서 지목하는 문서 순이다. 트리 전체를 훑지 않는다.
- `_index.md` 가 어떤 문서를 지목하는지 모르겠으면 파일명·본문을 검색해 후보를 좁힌 뒤 그 문서만 연다.

```bash
ls documents/ && sed -n '1,80p' documents/_index.md
```

## 2. 문서에 없을 때

- **결정이 없는 것과 문서에 안 적힌 것을 구분하지 않는다.** 둘 다 "아직 정해지지 않음"으로 취급한다.
- 정해지지 않은 것을 에이전트가 혼자 확정해 구현하지 않는다. 선택지를 좁혀 **권장안으로 제시하고 사용자의 선택을 받는다.**
- 기획·조사의 원본이 저장소 밖에 있으면 세션 컨텍스트에서 찾거나 사용자에게 요청한다. 경로를 추측하지 않는다.
- 밖에서 가져온 내용은 인용만으로 끝내지 말고 §4 대로 `documents/` 에 **사실만** 남긴다. 출처 표기는 §6 을 따른다.
  다음 세션이 저장소 밖을 다시 열지 않아도 되게 하는 것이 이 폴더의 존재 이유다.

## 3. 문서와 코드가 어긋날 때

- 코드를 문서에 맞추거나 문서를 코드에 맞추는 판단을 **에이전트가 혼자 하지 않는다.** 어긋난 지점을 보고하고 어느 쪽이 맞는지 확인받는다.
- 문서가 맞으면 코드를 고치고, 코드가 맞으면 §4 대로 문서를 고친다. 어느 쪽이든 한쪽만 고치고 끝내지 않는다.

## 4. 작업이 끝나면 문서에 되돌린다

작업 중에 아래 넷 중 하나가 생겼으면 커밋 전에 `documents/` 에 반영한다. 대화에만 남기지 않는다.

- [ ] 새 결정을 내렸다 → 결정 문서에 `- YYYY-MM-DD — <결정 한 줄>` 추가
- [ ] 미결이 풀렸거나 새 미결이 생겼다 → 해당 문서의 미결 목록 갱신
- [ ] 눈에 띄는 진행이 있었다(기능 완성, 스택 교체, 범위 변경) → 진행경과 갱신
- [ ] 문서를 새로 만들거나 지웠다 → `documents/_index.md` 의 목록 갱신

날짜는 상대 표현("어제", "지난주")이 아니라 절대 날짜로 적는다.

## 5. `documents/` 의 형태

- 문서 하나 = 주제 하나. 파일명이 내용을 말하게 한다(`쿠폰-발급-규칙.md`, `저장소-구조.md`).
- `documents/_index.md` 가 유일한 진입점이다. 모든 문서는 여기서 한 줄 설명과 함께 도달 가능해야 한다.
- 각 문서는 최소한 **결정**(날짜 + 한 줄)과 **미결**(체크박스) 절을 갖는다. 근거는 결정 아래에 붙인다.
- 결정은 덮어쓰지 말고 쌓는다. 뒤집힌 결정은 지우지 말고 뒤집었다는 사실을 새 날짜로 적는다.
- 상세를 문서 하나에 몰지 말고 주제별로 쪼갠다 — 무관한 맥락까지 읽게 만들지 않는다.

## 6. 근거는 저장소 안에 선다

이 저장소는 **자기완결**이다. 저장소 문서만 읽어도 결정과 그 근거가 서야 한다.
밖에서 가져오는 것은 *결론과 근거*이지 *출처*가 아니다. 근거가 저장소 문서만으로 서지 않으면 그 근거까지 옮겨 적는다.
"밖에 자세히 있다"로 미루지 않는다.

적용 대상은 커밋되는 전부다 — `documents/` 문서, `.agent/` 스킬, 코드 주석, 커밋 메시지, PR 본문, README.

**적지 않는다 — 개인 작업 환경**

공모전 제출물이자 팀 공유물이므로 개인의 작업 환경이 문서에 새어 나가면 안 된다.

- 개인 지식 베이스·노트 앱의 **도구 이름**과 그 앱 고유 표기(위키링크 `[[...]]` 문법 포함)
- 홈 디렉터리 절대경로, 개인 노트 폴더 구조, 개인 머신 경로
- 개인 노트가 원본이라는 서술과 그 동기화 방향

**적어도 된다 — 팀이 함께 쓰는 프로젝트 시스템**

팀 전원이 접근하고 이 저장소와 함께 운영되는 것은 가리켜도 된다. 이슈 트래커의 보드·티켓 주소가 여기 해당한다.
가리키는 목적이 **저장소 안에서 그 시스템을 다룰 수 있게 하는 것**일 때만이고, 근거를 그쪽에 미루는 용도로는 쓰지 않는다.
티켓을 가리키더라도 판단·수치·결정은 `documents/` 에 적는다.

**판단 기준 한 줄** — 팀원이 아닌 사람이 이 저장소를 열었을 때 **개인의 작업 환경**이 드러나는가. 드러나면 지운다.

| 쓰지 않는 표현 | 대체 |
| --- | --- |
| "`<개인 노트 이름>` 이 원본" | 근거를 이 문서에 직접 옮겨 적고 출처 줄을 생략한다 |
| "개인 노트에 결정되어 있음" | 결정 내용을 `- YYYY-MM-DD — <결정>` 으로 여기에 적는다 |
| "`~/...` 의 문서 참고" | 저장소 상대 경로(`documents/<파일>.md`)로만 참조한다 |
| "아직 옮기지 않음, 원본은 밖에 있음" | `- [ ] <주제> — 아직 기록되지 않음` 으로 주제만 남긴다 |
| "상세는 `KAN-8` 티켓 참조" | 상세를 여기 적고, 티켓은 실행 상태를 보는 곳으로만 가리킨다 |

읽는 쪽은 자유다 — 저장소 밖 자료를 읽고 참고하는 데 제한은 없다. 제한되는 것은 **커밋되는 텍스트**뿐이다.
대화에서 출처를 밝히는 것도 자유다. 파일에 적지 않을 뿐이다.

## 7. 함께 쓰는 스킬

- 구현 작업이면 `test-first-implementation` 이 이어진다. 테스트 도구·명령의 결정도 `documents/` 가 SSOT다.
