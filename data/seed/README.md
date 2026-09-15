# 발급 후보와 모델 입력 데이터

시연용 가상 시민 20명과 **공공 API에서 조회한 대전 실제 상가 12곳**을 사용한다. 발급 후보는 시민 × 가맹점 240개 조합이다.
가맹점은 2026-09-15 조회한 상가정보(기준월 202606)로 교체했다. 실제 지역·업종 설명으로 E5 벡터를 다시 생성했다.
이는 공공 상가목록에 있는 업소라는 뜻이며, 서비스 제휴나 쿠폰 사용 계약이 체결되었다는 뜻은 아니다.

- `citizens.json`: 시민 ID와 표시 이름 20건.
- `merchants.json`: 내부 ID `mer-001`~`mer-012`의 실제 상호·업종. `publicData`에는 공공 상가업소번호, 지점명, 주소, 구군·행정동, 업종 코드, 위경도, 자료 기준월·조회 시각을 보관한다. 타입은 `PublicDataMerchant`·`PublicStoreSnapshot`이다.
- `merchant-contents.json`: 실제 지역·업종과 내용 버전 12건. `MerchantContent` 공통 타입을 사용한다. 대표메뉴는 API가 제공하지 않아 전부 빈 배열이며 과거 메뉴 변경을 꾸며 넣지 않는다.
- `merchant-vectors.json`: `multilingual-e5-small`의 384차원 벡터 12건. 명세는 `e5s-761b726d-p1-meanL2-fp32`다. 예전 가상 가게 벡터는 재사용하지 않았다.
- `personal-fit-events.json`: 시민당 6건씩 총 120건의 **가상** 소비 이력. 새 내용·벡터 버전을 참조하며 소비 금액·시각은 공공데이터의 관측값이 아니다.
- `../sources/daejeon-stores.json`: 선택된 실제 상가 12곳의 정규화된 API 응답과 출처. 대전 첫 페이지 100건에서 업종별 한 곳을 선정한 시연 표본이다. 조회 당시 대전 전체는 80,704건이며 전체 상가를 적재한 것이 아니다.
- `coupons.json`: 기존 소비 시연용 예시도 대전 상가명으로 교체했다. 쿠폰 조건·혜택·시민·포인트는 시연값이다.

발급 시 `JsonPersonalFitSource`가 이력·가게 내용·가게 벡터를 읽고 main의 `preparePersonalFit`으로 시민별 점수를 준비한다.
후보는 발급 시각까지 알려지고 검증된 최신 **내용** 버전을 선택한다. 그 버전의 벡터가 없으면 과거 메뉴 벡터로 대신하지 않는다.
소비 이력의 벡터는 소비 당시 알려지고 검증된 정확한 내용 버전이어야 한다.
이력이 없으면 `NO_HISTORY`, 필요한 벡터가 없으면 `MISSING_VECTOR`로 개인화를 비활성화한다. 기존 5차원 `personal-fit-vectors`는 더 이상 읽지 않는다.

기본 가중평균은 `(상권회복 점수 × 0.3 + 개인화 점수 × 0.7) / 가중치 합`이며 발급 화면에서 조절할 수 있다.
E5 유사도는 좁은 구간에 모이므로 회복 신호와의 가중치에 따라 후보 순위가 달라질 수 있다.
모델 점수만으로 선택되는 결과를 시연하려면 상권회복 0·개인화 1로 설정한다. 점수는 확률이나 만족도가 아니다.

## 목 소비 이력 갱신

유저별 이력에는 `sourceKind: mock`, `currency: KRW`, `publicStoreContext`를 함께 보관한다. 공공 상가 ID·대중소 업종·시도/구/행정동의 코드와 이름을 기록하지만 소비 금액은 가상이다. 상세는 [유저별 소비 계약](../../documents/유저별-소비-공공코드.md)을 따른다. 기존 시각·금액을 유지하면서 분류만 갱신하려면 `node scripts/enrich-personal-fit-context.mjs`를 사용한다.

```sh
node scripts/generate-personal-fit-mock.mjs
# 고정 시각으로 재현
node scripts/generate-personal-fit-mock.mjs 2026-09-14T15:00:00Z
```

생성기는 벡터를 생성하거나 모델의 검증 시각을 변경하지 않는다. 최근 1·4·10·18·35·60일을 기본으로 하되,
가맹점 내용과 벡터가 알려진 시각보다 이르지 않도록 소비 시각을 조정한다.
따라서 처음 준비된 가맹점에는 같은 날의 이력이 여러 건 생길 수 있다. 개인화 계산에서는 가맹점·날짜별 한 건만 사용한다.
90일 관측 구간을 벗어난 목 이력은 재생성한다.

출력은 시드와 런타임의 `personal-fit-events.json`이다. 런타임은 `IM_COUPON_DATA_DIR` 또는 기본 `data/runtime`을 쓴다.
거래 ID가 `mock-personal-fit:`으로 시작하는 이력만 갱신하며 외부 이력은 보존한다.
결제 시연 결과를 행동 이력으로 자동 추가하지 않는다. 페이백 액면을 실제 결제액으로 간주하지 않는다.

## 기존 런타임 적용

새 환경에서는 API가 시드를 복사한다. 이미 데이터가 있는 런타임은 `bootstrapFromSeed`가 자동으로 덮어쓰지 않는다.
이번 요청으로 시드와 기본 런타임을 함께 교체했다. 변경 전 데이터 전체는 `.tmp/daejeon-before-20260915-230118/seed`와 `runtime`에 백업했다.
현재 4건의 시연 발급 쿠폰도 새 상가명과 가맹점 ID로 맞췄다. 쿠폰 ID·발급 시각·기한·사용 상태·포인트 지급액은 보존했다. 현재 목록에 없던 `mer-013`의 예전 시연 쿠폰은 `mer-002`로 연결했다. 실제 거래 이력의 정정이 아닌 목 데이터 교체다.
사용하지 않는 과거 `personal-fit-vectors.json`은 백업 후 제거했다. 실제 거래가 들어온 환경에 이 목 데이터 교체 방식을 적용하지 않는다.

모델과 데이터 생성 조건은 [가게 벡터 모델](../../documents/가게-벡터-모델.md)을 참고한다.

## 상권회복 비교 데이터

기존 발급 가게 12곳은 유지하고, 비교용 60곳(기존 12곳 + 가상 48곳)은 `comparison-merchants`에 둔다. `comparison-consumption-events`의 3개월 합성 거래를 `district-consumption-monthly`와 `city-consumption-monthly`로 집계한다. `sales-recovery-comparisons`는 감소율 비교, `sales-recovery-candidates`는 발급 후보 12곳의 준비 여부, `sales-recovery-dataset`은 생성 출처·품질 기록이다.

`node scripts/generate-d1-consumption.mjs`로 해당 7개 컬렉션을 seed와 runtime에 갱신한다. 비교 거래는 기존 개인화 이력에 중복 입력하지 않는다. 상세는 [시연 후보](../../documents/상권회복-시연-후보.md)에 있다. 실제 발급은 시민을 먼저 지정하며 이 월별 통계로 회복 신호를 계산한다. 세부 계약은 [발급 연결](../../documents/KAN-27/발급-연결.md)에 있다.
