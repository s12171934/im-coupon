/** 쿠폰을 발행하는 가맹점. 이번 프로토타입에서는 시드로만 들어오고 읽기 전용이다. */
import type { StoreApiItem } from './store-api';

/** 공공 상가정보의 실제 상가 식별자와 조회 시점. 내부 가맹점 ID와 구분한다. */
export interface PublicStoreSnapshot extends StoreApiItem {
  datasetId: '15012005';
  regionCode: string;
  referenceMonth: string;
  fetchedAt: string;
}

export interface Merchant {
  /** `mer-` 접두. `merchants` 컬렉션 안에서 유일하다 */
  id: string;
  name: string;
  /** 업종 표시용 자유 문자열. 코드가 분기하지 않으므로 열거형으로 좁히지 않는다 */
  category: string;
  /** 공공 데이터로 적재한 가게의 출처. 독립 테스트·기존 데이터에는 없을 수 있다. */
  publicData?: PublicStoreSnapshot;
}

/** 공공데이터 시드는 출처·주소·좌표를 반드시 함께 보관한다. */
export interface PublicDataMerchant extends Merchant {
  publicData: PublicStoreSnapshot;
}

/** 가게 설명과 벡터 입력의 버전. API가 제공하지 않는 메뉴는 빈 배열이다. */
export interface MerchantContent {
  merchantId: string;
  contentVersion: string;
  regionLabel: string;
  categoryLabel: string;
  representativeMenus: string[];
  lat: number;
  lon: number;
  sourceIds: string[];
  knownAt: number;
  verifiedAt: number;
  textHash: string;
  embeddedText: string;
  note: string;
}
