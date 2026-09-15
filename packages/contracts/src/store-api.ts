export const STORE_API_PATH = '/api/store-api/stores';

export interface StoreApiItem {
  id: string;
  name: string;
  branchName: string;
  district: string;
  neighborhood: string;
  categoryCode: string;
  category: string;
  address: string;
  longitude: number | null;
  latitude: number | null;
}

export interface StoreApiResponse {
  source: '소상공인시장진흥공단 상가(상권)정보';
  referenceMonth: string;
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  elapsedMs: number;
  items: StoreApiItem[];
}
