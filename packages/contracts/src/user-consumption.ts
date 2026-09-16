/** 공공 상가·코드 목록을 결합한 분류 출처. 거래 발생 당시의 실측 스냅샷은 아니다. */
export interface PublicConsumptionStoreContext {
  readonly datasetId: '15012005';
  readonly publicStoreId: string;
  readonly categorySystem: 'D1';
  readonly provinceCode: string;
  readonly provinceName: string;
  readonly districtCode: string;
  readonly districtName: string;
  readonly neighborhoodCode: string;
  readonly neighborhoodName: string;
  readonly largeCategoryCode: string;
  readonly largeCategoryName: string;
  readonly middleCategoryCode: string;
  readonly middleCategoryName: string;
  readonly smallCategoryCode: string;
  readonly smallCategoryName: string;
  readonly storeReferenceMonth: string;
  readonly storeFetchedAt: string;
  readonly catalogFetchedAt: string;
  readonly regionReferenceDate: string;
  readonly categoryReferenceDate: string;
}

/** 프로젝트의 유저별 소비 계약. D1 자체에는 개인 소비 데이터가 없다. */
export interface UserConsumptionEvent {
  readonly transactionId: string;
  readonly revision: number;
  readonly actualUserId: string | null;
  readonly merchantId: string;
  /** UTC epoch 밀리초 */
  readonly usedAt: number;
  readonly recordedAt: number;
  readonly status: 'confirmed' | 'cancelled';
  /** 취소분을 제외한 원 단위 금액 */
  readonly netAmount: number;
  readonly contentVersion: string;
  /** 기존 외부 이력은 출처를 임의로 정하지 않는다. */
  readonly sourceKind?: 'mock' | 'observed';
  readonly currency?: 'KRW';
  readonly publicStoreContext?: PublicConsumptionStoreContext;
}

/** 새로 생성하는 mock에는 공공 분류와 합성 표시가 필수다. */
export interface D1MockConsumptionEvent extends UserConsumptionEvent {
  readonly actualUserId: string;
  readonly sourceKind: 'mock';
  readonly currency: 'KRW';
  readonly publicStoreContext: PublicConsumptionStoreContext;
}
