# 클라이언트 코드 배치

- `app/`: 라우팅, 공통 레이아웃, 앱 조립. `App`은 화면을 연결하고 `AppLayout`은 제목과 내비게이션을 그린다.
- `pages/<PageName>/`: URL에 대응하는 화면. 기능 훅과 컴포넌트를 조립한다.
- `features/<기능>/components/<ComponentName>/`: 해당 기능 전용 UI. `issuance`는 발급 입력·결과, `my-coupons`는 소유자 선택·쿠폰 목록, `storage`는 저장소 상태를 담당한다.
- `features/<기능>/hooks/`: API 호출과 상태 관리.
- `features/<기능>/model/`: 기능에서 공유하는 타입·상수·계산.
- `shared/components/<ComponentName>/`: 여러 기능에서 쓰는 범용 UI. 예: `ErrorNotice`.

컴포넌트마다 PascalCase 폴더를 만들고 `ComponentName.tsx`와 `ComponentName.test.tsx`를 함께 둔다. 페이지·레이아웃·앱도 이 규칙을 따른다. 임포트는 실제 파일을 가리키며, 용도 없이 전체 파일을 재노출하는 배럴은 만들지 않는다. 테스트 전용 헬퍼는 테스트 파일 안에 둘 수 있다.

`main.tsx`의 `BrowserRouter`가 브라우저 이력을 관리한다. `/`는 `/issue`로 이동하며 `/issue`와 `/my-coupons`는 직접 진입·새로고침·뒤로/앞으로 가기를 지원한다. 알 수 없는 URL은 안내 화면을 보여준다. 웹 호스팅은 `/api` 요청을 제외한 화면 URL을 `index.html`로 돌려주는 SPA fallback이 필요하다(Vite dev/preview는 기본 지원).

공식 API: [React Router 선언형 라우팅](https://reactrouter.com/start/declarative/routing).
