# im-coupon

소비 데이터 기반 상생형 쿠폰 프로토타입.

이 저장소의 **결정·진행경과·설계방침**은 [`documents/`](documents/_index.md) 에 있다.
무엇을 왜 이렇게 만들었는지는 코드가 아니라 그쪽을 읽는다.

## 준비

- Node.js 22 이상
- pnpm

```bash
pnpm install
```

## 실행

```bash
pnpm dev        # apps/api(:3000) 와 apps/web(:5173) 을 함께 띄운다
```

`http://localhost:5173` 을 연다. 화면의 `/api/*` 요청은 Vite 개발 서버가 API 로 프록시한다.
API 는 기동할 때 런타임 데이터 디렉터리가 비어 있으면 `data/seed` 를 `data/runtime` 으로 복사한다.

3000 번이 이미 물려 있으면 API 가 점유자를 찾는 명령과 함께 종료한다. 안내대로 `lsof` 로 확인하거나
`PORT=<번호> pnpm dev` 로 다른 포트에 띄운다. API 는 자기 소스 디렉터리가 사라지면 스스로 종료하므로,
워크트리를 지운 뒤 서버가 남아 포트를 붙드는 일은 없다.

## 검증

```bash
pnpm typecheck  # 전 워크스페이스 타입 검사
pnpm test       # 각 워크스페이스의 단위 테스트 (Vitest)
pnpm build      # 전 워크스페이스 빌드
pnpm e2e        # Playwright. 앱을 실제로 띄워 브라우저에서 검증한다
```

e2e 는 처음 한 번 브라우저 설치가 필요하다.

```bash
pnpm --filter @im-coupon/e2e exec playwright install chromium
```

## 구성

```
apps/web           React + Vite. 화면
apps/api           NestJS. API 와 발급 로직
packages/contracts 프론트·백엔드 계약 타입
packages/db        JSON 파일 DB 구현
e2e                Playwright
data/seed          커밋되는 시드 데이터
data/runtime       런타임 데이터 (커밋하지 않는다)
documents          결정·진행경과·설계방침
```

경계와 의존 방향의 규칙은 [`documents/저장소-구조와-기술-스택.md`](documents/저장소-구조와-기술-스택.md) 에 있다.
