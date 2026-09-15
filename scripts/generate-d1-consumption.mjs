import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consumptionTrend as trend, candidateReadiness } from './sales-recovery-readiness.mjs';
const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const catalog = await read('data/reference/store-codes.json');
const seeds = await read('data/seed/merchants.json');
const citizens = await read('data/seed/citizens.json');
const asOf = process.argv[2] ? Date.parse(process.argv[2]) : Date.now();
if (!Number.isFinite(asOf) || !citizens.length) throw new Error('기준 시각 또는 시민 목록을 확인하세요.');
const districts = catalog.districts.filter(d => d.provinceCode === '30').sort((a,b) => a.code.localeCompare(b.code));
if (districts.length !== 5) throw new Error('대전 5개 구 목록을 확인하세요.');
if (new Set(seeds.map(s=>s.id)).size !== seeds.length) throw new Error('발급 가게 ID가 중복됩니다.');
for (const merchant of seeds) {
  if (merchant.publicData?.regionCode !== '30'
    || districts.filter(d=>d.name===merchant.publicData.district).length !== 1)
    throw new Error(`대전 지역 코드 연결을 확인하세요: ${merchant.id}`);
}
const codes = [...new Set(seeds.map(s => s.publicData?.categoryCode))].sort();
const categories = codes.map(code => {
  const row = catalog.smallCategories.find(c => c.code === code);
  if (!row) throw new Error(`공공 업종 없음: ${code}`);
  if (!catalog.middleCategories.some(c=>c.code===row.middleCode && c.largeCode===row.largeCode)
    || !catalog.largeCategories.some(c=>c.code===row.largeCode)) throw new Error(`업종 계층 오류: ${code}`);
  return row;
});
const months = [{month:'202604',days:30},{month:'202605',days:31},{month:'202606',days:30}];
const stores = [];
for (const district of districts) for (const category of categories) {
  const matches = seeds.filter(s => s.publicData.district === district.name && s.publicData.categoryCode === category.code);
  const members = matches.length ? matches : [{id:`mock-${district.code}-${category.code}`,name:`가상 ${district.name} ${category.name}`}];
  for (const merchant of members) stores.push({id:merchant.id,name:merchant.name,
    identitySource:matches.length ? 'public_store_seed' : 'synthetic', consumptionSource:'mock',
    issuanceCandidate: matches.length > 0, categorySystem:'D1',
    provinceCode:'30',districtCode:district.code,districtName:district.name,
    categoryCode:category.code,categoryName:category.name,largeCode:category.largeCode,middleCode:category.middleCode});
}
const events = [];
for (const [si,store] of stores.entries()) for (const [mi,{month,days}] of months.entries()) {
  const di = districts.findIndex(d => d.code === store.districtCode);
  const ci = categories.findIndex(c => c.code === store.categoryCode);
  // Transaction count changes drive trends. Amounts are arbitrary, not market estimates.
  const activity = mi === 0 ? 4 : mi === 1 ? 5 : [2,3,5,6,7][(di+ci)%5];
  for (let day=1;day<=days;day++) for (let n=0;n<activity;n++) {
    events.push({id:`mock-sale-${store.id}-${month}${String(day).padStart(2,'0')}-${n+1}`,
      sourceKind:'mock',merchantId:store.id,actualUserId:citizens[(si+day+n)%citizens.length].id,
      consumedAt:`${month.slice(0,4)}-${month.slice(4)}-${String(day).padStart(2,'0')}T${String(10+n).padStart(2,'0')}:00:00+09:00`,
      amount:1000*(5+((si+day+n)%16)),currency:'KRW'});
  }
}
const storeMap = new Map(stores.map(s => [s.id,s]));
const grouped = new Map();
for (const e of events) {
  const s = storeMap.get(e.merchantId);
  if (!s || !Number.isSafeInteger(e.amount) || e.amount < 0) throw new Error('소비 이력 참조/금액 오류');
  const month = e.consumedAt.slice(0,7).replace('-','');
  const key = `${s.districtCode}/${s.categoryCode}/${month}`;
  if (!grouped.has(key)) grouped.set(key,{sourceKind:'mock',categorySystem:'D1',provinceCode:'30',districtCode:s.districtCode,
    districtName:s.districtName,categoryCode:s.categoryCode,categoryName:s.categoryName,month,amount:0,count:0});
  const row = grouped.get(key); row.amount+=e.amount;row.count++;
}
const monthly = [...grouped.values()];
const lookup = (district,category,month) => grouped.get(`${district}/${category}/${month}`);
const city = categories.flatMap(c => months.map(({month}) => {
  const rows = districts.map(d => lookup(d.code,c.code,month));
  const complete = rows.every(Boolean);
  return {sourceKind:'mock',categorySystem:'D1',provinceCode:'30',provinceName:'대전광역시',categoryCode:c.code,
    categoryName:c.name,month,status:complete?'available':'missing_region_month',
    amount:complete?rows.reduce((s,r)=>s+r.amount,0):null,count:complete?rows.reduce((s,r)=>s+r.count,0):null};
}));
const comparisons=districts.flatMap(d=>categories.map(c=>{
  const local=trend(months.map(m=>lookup(d.code,c.code,m.month)));
  const cityTrend=trend(months.map(m=>city.find(r=>r.categoryCode===c.code && r.month===m.month)));
  return {sourceKind:'mock',categorySystem:'D1',districtCode:d.code,districtName:d.name,categoryCode:c.code,categoryName:c.name,
    referenceMonth:'202606',local,city:cityTrend,
    excessDeclineRate:local.declineRate!==null && cityTrend.declineRate!==null?local.declineRate-cityTrend.declineRate:null};
}));
const total=events.reduce((s,e)=>s+e.amount,0);
const quality={stores:stores.length,publicSeedStores:stores.filter(s=>s.identitySource==='public_store_seed').length,
  syntheticStores:stores.filter(s=>s.identitySource==='synthetic').length,categories:categories.length,districts:districts.length,
  events:events.length,monthlyRows:monthly.length,expectedMonthlyRows:districts.length*categories.length*months.length,
  cityRows:city.length,comparisonRows:comparisons.length,duplicateEventIds:events.length-new Set(events.map(e=>e.id)).size,
  eventAmount:total,monthlyAmount:monthly.reduce((s,r)=>s+r.amount,0),cityAmount:city.reduce((s,r)=>s+r.amount,0),
  missingComparisons:comparisons.filter(r=>r.local.status!=='available'||r.city.status!=='available').length};
if(quality.duplicateEventIds || quality.monthlyRows!==quality.expectedMonthlyRows || total!==quality.monthlyAmount || total!==quality.cityAmount)
  throw new Error('생성 데이터의 키·집계가 일치하지 않습니다.');
const rootPath = fileURLToPath(root);
const destinations = [...new Set([resolve(rootPath,'data/seed'),resolve(process.env.IM_COUPON_DATA_DIR ?? resolve(rootPath,'data/runtime'))])];
const generatorId = 'd1-comparison-seed.v1';
// Build and inspect both destinations before writing any generated collections.
const prepared = await Promise.all(destinations.map(async directory => {
  const load = async name => JSON.parse(await readFile(resolve(directory,`${name}.json`),'utf8'));
  const [localMerchants,contents,vectors,localCitizens] = await Promise.all(['merchants','merchant-contents','merchant-vectors','citizens'].map(load));
  if (!localMerchants.every(m=>seeds.some(s=>s.id===m.id && JSON.stringify(s.publicData)===JSON.stringify(m.publicData)))
    || localMerchants.length!==seeds.length || !citizens.every(c=>localCitizens.some(u=>u.id===c.id)))
    throw new Error('seed와 runtime의 가게·시민 연결이 다릅니다. 기존 데이터를 보존하고 중단합니다.');
  const candidates = localMerchants.map(merchant=> {
    const store = storeMap.get(merchant.id);
    const comparison = comparisons.find(r=>r.districtCode===store?.districtCode && r.categoryCode===store?.categoryCode);
    return candidateReadiness({merchant,comparison,contents,vectors,asOf});
  });
  const specs = new Set(candidates.filter(c=>c.eligible).map(c=>`${c.vectorSpecId}/${c.vectorDimension}`));
  if(specs.size>1) for (const candidate of candidates.filter(c=>c.eligible)) {
    candidate.eligible=false;candidate.reasons.push('INCOMPATIBLE_VECTOR_SPACE');
  }
  const metadata = [{generatorId,sourceKind:'mock',version:1,categorySystem:'D1',evaluatedAt:asOf,referenceMonth:'202606',months,
    catalogFetchedAt:catalog.fetchedAt,quality,eligibleCandidates:candidates.filter(c=>c.eligible).length,
    excludedCandidates:candidates.filter(c=>!c.eligible).length,
    scope:'Existing issuance merchants only; synthetic merchants are comparison population only.',
    disclaimer:'All consumption is synthetic. Historical merchant presence, population shares and region boundaries are not verified.'}];
  const collections = {'comparison-merchants':stores,'comparison-consumption-events':events,
    'district-consumption-monthly':monthly,'city-consumption-monthly':city,
    'sales-recovery-comparisons':comparisons,'sales-recovery-candidates':candidates,'sales-recovery-dataset':metadata};
  let owned = false;
  try { const previous = await load('sales-recovery-dataset'); owned = previous?.[0]?.generatorId===generatorId; }
  catch(e) { if(e.code!=='ENOENT')throw e; }
  for(const name of Object.keys(collections)) {
    try { await readFile(resolve(directory,`${name}.json`)); if(!owned) throw new Error(`기존 미관리 컬렉션을 덮어쓰지 않습니다: ${name}`); }
    catch(e) { if(e.code!=='ENOENT')throw e; }
  }
  return {directory,collections,candidates};
}));
for (const {directory,collections} of prepared) {
  await mkdir(directory,{recursive:true});
  for(const [name,data] of Object.entries(collections)) {
    const target=resolve(directory,`${name}.json`),temporary=`${target}.${process.pid}.tmp`;
    // Compact transactions keep the generated seed reasonably small.
    const json = name==='comparison-consumption-events' ? '[\n'+data.map(r=>JSON.stringify(r)).join(',\n')+'\n]\n' : JSON.stringify(data,null,2)+'\n';
    await writeFile(temporary,json);await rename(temporary,target);
  }
}
console.log(JSON.stringify({quality,destinations:prepared.map(p=>({directory:p.directory,eligible:p.candidates.filter(c=>c.eligible).length,excluded:p.candidates.filter(c=>!c.eligible)}))},null,2));
