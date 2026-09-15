/** Explicit catalog join; names alone are never joined across provinces/districts. */
export function publicConsumptionContext(merchant, catalog) {
  const source = merchant?.publicData;
  if (!source) throw new Error('공공 상가 출처가 없는 가게입니다.');
  const one = (rows, label) => {
    if (rows.length !== 1) throw new Error(`${merchant.id}: ${label} 코드가 없거나 중복입니다.`);
    return rows[0];
  };
  const province = one(catalog.provinces.filter(r => r.code === source.regionCode), '시도');
  const district = one(catalog.districts.filter(r => r.provinceCode === province.code && r.name === source.district), '시군구');
  const neighborhood = one(catalog.neighborhoods.filter(r => r.districtCode === district.code && r.name === source.neighborhood), '행정동');
  const small = one(catalog.smallCategories.filter(r => r.code === source.categoryCode), '소분류');
  const middle = one(catalog.middleCategories.filter(r => r.code === small.middleCode && r.largeCode === small.largeCode), '중분류');
  const large = one(catalog.largeCategories.filter(r => r.code === small.largeCode), '대분류');
  return { sourceKind: 'mock', currency: 'KRW', publicStoreContext: {
    datasetId: '15012005', publicStoreId: source.id, categorySystem: 'D1',
    provinceCode: province.code, provinceName: province.name,
    districtCode: district.code, districtName: district.name,
    neighborhoodCode: neighborhood.code, neighborhoodName: neighborhood.name,
    largeCategoryCode: large.code, largeCategoryName: large.name,
    middleCategoryCode: middle.code, middleCategoryName: middle.name,
    smallCategoryCode: small.code, smallCategoryName: small.name,
    storeReferenceMonth: source.referenceMonth, storeFetchedAt: source.fetchedAt,
    catalogFetchedAt: catalog.fetchedAt, regionReferenceDate: neighborhood.referenceDate,
    categoryReferenceDate: small.referenceDate,
  } };
}
