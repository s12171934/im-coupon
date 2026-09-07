# KAN-13 PR별 변경 흐름

각 PR의 바로 아래 base 브랜치 대비 변경 범위를 설명한다. 설계 PR의 그림은 후속 구현 계획이며, 각 구현 PR의 그림은 해당 단계의 동작을 나타낸다.

| PR | 주제 | 파일 |
| --- | --- | --- |
| [#8](https://github.com/s12171934/im-coupon/pull/8) | PR #8 · 쿠폰 발급 구현 계획 | [PNG](pr08.png) · [SVG](pr08.svg) · [HTML](pr08.html) · [원본](pr08.json) |
| [#9](https://github.com/s12171934/im-coupon/pull/9) | PR #9 · 시드와 공유 계약 | [PNG](pr09.png) · [SVG](pr09.svg) · [HTML](pr09.html) · [원본](pr09.json) |
| [#10](https://github.com/s12171934/im-coupon/pull/10) | PR #10 · 신호와 트리거의 대칭 구조 | [PNG](pr10.png) · [SVG](pr10.svg) · [HTML](pr10.html) · [원본](pr10.json) |
| [#11](https://github.com/s12171934/im-coupon/pull/11) | PR #11 · 발급 요청에서 저장까지 | [PNG](pr11.png) · [SVG](pr11.svg) · [HTML](pr11.html) · [원본](pr11.json) |
| [#12](https://github.com/s12171934/im-coupon/pull/12) | PR #12 · 내 쿠폰 조회의 판단 순서 | [PNG](pr12.png) · [SVG](pr12.svg) · [HTML](pr12.html) · [원본](pr12.json) |
| [#13](https://github.com/s12171934/im-coupon/pull/13) | PR #13 · 발급 화면의 역할 분리 | [PNG](pr13.png) · [SVG](pr13.svg) · [HTML](pr13.html) · [원본](pr13.json) |
| [#14](https://github.com/s12171934/im-coupon/pull/14) | PR #14 · 소유자 선택에서 거래조건 표시까지 | [PNG](pr14.png) · [SVG](pr14.svg) · [HTML](pr14.html) · [원본](pr14.json) |
| [#15](https://github.com/s12171934/im-coupon/pull/15) | PR #15 · 실제 서버를 관통하는 검증 | [PNG](pr15.png) · [SVG](pr15.svg) · [HTML](pr15.html) · [원본](pr15.json) |

## 검증 및 사용

Archify architecture 형식으로 작성했다. 각 JSON을 고정한 뒤 HTML을 생성했으며, 8개 모두 showcase 검사 9/9, 구성 오류·경고 0건이다. 브라우저에서 4개 데스크톱 크기와 light/dark 테마를 확인했고, 자동 측정과 별도로 이미지 시각 검토를 수행했다. SHA-256 및 구분된 검증 결과는 [validation.json](validation.json)에 기록했다.

PNG와 SVG는 생성된 HTML의 기본 내보내기 기능으로 추출했다. HTML은 내려받아 브라우저에서 열면 확대·검색·테마 전환과 재내보내기가 가능하다. 본문은 한국어이며 고정 Viewer UI와 HTML lang은 English로 동작한다. 수정할 때는 JSON 원본을 변경하고 HTML을 재생성·검증한 후 내보낸다.
