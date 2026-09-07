# 서버 코드 배치

도메인(`issuance`, `coupons`, `citizens`, `health`)을 먼저 나누고, 각 도메인 안에서 역할별로 배치한다. 필요한 계층만 만들며 빈 폴더는 만들지 않는다.

- `presentation/`: HTTP 컨트롤러·오류 필터. 요청을 명령으로 옮기고 응답을 만든다.
- `application/`: 유스케이스와 `ports/`의 외부 의존 인터페이스·Nest 주입 토큰.
- `domain/`: 프레임워크에 의존하지 않는 규칙·파라미터·계산. `signals/`와 `triggers/`에 확장 축을 모으고, 각 폴더 루트에 인터페이스, `implementations/`에 구현체와 그 테스트를 둔다.
- `infrastructure/`: 파일 DB 등 외부 자원 구현체. JSON 구현체는 `Json*` / `json-*`로 이름을 붙인다.
- 도메인 루트의 `*.module.ts`: 인터페이스 토큰과 구현체를 `{ provide: TOKEN, useClass: JsonImplementation }`으로 연결한다.
- `shared/infrastructure/`: 데이터 경로와 컬렉션 읽기 등 공통 저장소 도구.
- `bootstrap/`: 프로세스 수명·포트 검사. `main.ts`는 기동, `app.module.ts`는 도메인 모듈 조립을 담당한다.

호출자는 `application/ports`의 인터페이스를 타입으로 사용하고 `@Inject(TOKEN)`으로 주입받는다. 구현체는 `implements Interface`를 선언한다. 모듈 외부의 유스케이스나 컨트롤러에서 JSON 구현체를 직접 생성·참조하지 않는다. 교체할 때는 모듈의 바인딩만 바꾸며, 테스트에서는 같은 토큰을 `overrideProvider`할 수 있다.

예: `HealthService` → `StorageHealth` (`STORAGE_HEALTH`) ← `JsonStorageHealth`. 발급 신호는 순수 함수 경계이므로 `Signal` 인터페이스를 구현하는 `randomSignal` 객체를 사용한다. 발급 트리거도 같은 순수 함수 경계이며 `IssueTrigger` 계약과 `manualTrigger` 구현을 신호와 대칭으로 둔다. HTTP 요청 검증은 컨트롤러가 담당하고 트리거는 입력을 발급 명령으로 옮긴다.

```text
issuance/domain/
  signals/
    signal.ts
    implementations/
      random-signal.ts
      random-signal.test.ts
  triggers/
    issue-trigger.ts
    implementations/
      manual-trigger.ts
      manual-trigger.test.ts
```

새 신호·트리거는 해당 `implementations/`에 추가하고 같은 상위 폴더의 인터페이스를 구현한다.

테스트는 검증하는 파일과 같은 폴더에 둔다. 외부 동작을 검증하는 HTTP 통합 테스트는 `presentation/`에 둔다.
