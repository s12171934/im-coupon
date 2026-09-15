export type StoreRegionDivision = 'ctprvnCd' | 'signguCd' | 'adongCd';

export interface StoreCodeEntry {
  code: string;
  name: string;
  referenceDate: string;
}

export interface StoreCodeCatalog {
  fetchedAt: string;
  datasetId: string;
  regionDivisions: { code: StoreRegionDivision; name: string; codeLength: number }[];
  provinces: StoreCodeEntry[];
  districts: (StoreCodeEntry & { provinceCode: string })[];
  neighborhoods: (StoreCodeEntry & { provinceCode: string; districtCode: string })[];
  largeCategories: StoreCodeEntry[];
  middleCategories: (StoreCodeEntry & { largeCode: string })[];
  smallCategories: (StoreCodeEntry & { largeCode: string; middleCode: string })[];
  requests: { operation: string; params: Record<string, string>; count: number }[];
}
