import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { publicConsumptionContext } from './public-consumption-context.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const asOf = process.argv[2] ? Date.parse(process.argv[2]) : Date.now();
if (!Number.isFinite(asOf)) throw new Error('기준 시각은 ISO 8601로 입력하세요.');
const day = 86400000;
const kstDay = Math.floor((asOf + 9 * 3600000) / day);
// All generated historical visits occur at noon KST, on completed calendar days.
const noon = daysAgo => (kstDay-daysAgo)*day + 3*3600000;
const prefix = 'mock-history:';
const read = async path => JSON.parse(await readFile(path,'utf8'));
const catalog = await read(resolve(root,'data/reference/store-codes.json'));
const directories = [...new Set([resolve(root,'data/seed'),resolve(process.env.IM_COUPON_DATA_DIR ?? resolve(root,'data/runtime'))])];
const outputs = await Promise.all(directories.map(async directory => {
  const [citizens,merchants,allContents,allVectors,previousEvents] = await Promise.all(
    ['citizens','merchants','merchant-contents','merchant-vectors','personal-fit-events'].map(name=>read(resolve(directory,`${name}.json`))));
  if (![citizens,merchants,allContents,allVectors,previousEvents].every(Array.isArray) || !citizens.length || !merchants.length) throw new Error('시민·가게·모델·이력 배열이 필요합니다.');
  const retained = previousEvents.filter(e=>!e.transactionId?.startsWith('mock-personal-fit:'));
  // Keep scenario versions referenced by non-generator records; never strand their history.
  const referenced = new Set(retained.map(e=>`${e.merchantId}/${e.contentVersion}`));
  const contents = allContents.filter(c=>!c.contentVersion.startsWith(prefix) || referenced.has(`${c.merchantId}/${c.contentVersion}`));
  const vectors = allVectors.filter(v=>!v.contentVersion.startsWith(prefix) || referenced.has(`${v.merchantId}/${v.contentVersion}`));
  const historical = new Map();
  for (const merchant of merchants) {
    const content = contents.filter(c=>c.merchantId===merchant.id && !c.contentVersion.startsWith(prefix)
      && c.knownAt<=asOf && c.verifiedAt<=asOf).sort((a,b)=>b.knownAt-a.knownAt || b.verifiedAt-a.verifiedAt || b.contentVersion.localeCompare(a.contentVersion))[0];
    const available = vectors.filter(v=>v.merchantId===merchant.id && v.contentVersion===content?.contentVersion && v.knownAt<=asOf && v.verifiedAt<=asOf);
    if (!content || available.length!==1) throw new Error(`${merchant.id}: 확인된 현재 내용·벡터가 필요합니다.`);
    // Synthetic backdated versions make the scenario explicit; source timestamps stay intact.
    const contentVersion = `${prefix}${kstDay}:${content.contentVersion}`;
    const knownAt = noon(120);
    if(!contents.some(c=>c.merchantId===merchant.id && c.contentVersion===contentVersion))contents.push({...content,contentVersion,knownAt,verifiedAt:knownAt,
      sourceKind:'mock',derivedFromContentVersion:content.contentVersion,
      note:'시연용 과거 버전. 현재 공공 설명을 복제한 가정이며 과거 영업·메뉴의 관측 사실이 아님.'});
    if(!vectors.some(v=>v.merchantId===merchant.id && v.contentVersion===contentVersion))vectors.push({...available[0],contentVersion,knownAt,verifiedAt:knownAt,
      sourceKind:'mock',derivedFromContentVersion:content.contentVersion});
    historical.set(merchant.id,contentVersion);
  }
  const snack=merchants.find(m=>m.publicData?.categoryCode==='I21007');
  const fish=merchants.find(m=>m.publicData?.categoryCode==='I20111');
  if(!snack || !fish)throw new Error('빈도 비교용 분식·횟집 가게가 필요합니다.');
  const events=[];const scenarios=[];
  const kinds=['frequency_snack','frequency_fish','balanced','same_day_duplicates','recency','no_history','cancelled','zero_amount','outside_window','revision_cancelled'];
  for(const [index,citizen] of citizens.entries()) {
    const kind=kinds[index] ?? 'mixed_visits';
    const primary=index<10?snack:merchants[index%merchants.length];
    const secondary=index<10?fish:merchants[(index+5)%merchants.length];
    let visits=[];
    if(kind==='frequency_snack')visits=[[primary,1],[primary,3],[primary,5],[primary,7],[secondary,4],[secondary,6]];
    else if(kind==='frequency_fish')visits=[[secondary,1],[secondary,3],[secondary,5],[secondary,7],[primary,4],[primary,6]];
    else if(kind==='balanced')visits=[1,4,7].flatMap(d=>[[primary,d],[secondary,d]]);
    else if(kind==='same_day_duplicates')visits=[[primary,2],[primary,2],[primary,2],[primary,2],[secondary,2],[secondary,2]];
    else if(kind==='recency')visits=[[primary,40],[primary,45],[primary,50],[primary,55],[secondary,1],[secondary,3]];
    else if(kind==='no_history')visits=[];
    else if(kind==='outside_window')visits=[[primary,100],[secondary,101]];
    else if(kind==='cancelled'||kind==='zero_amount'||kind==='revision_cancelled')visits=[[primary,1],[secondary,3]];
    else visits=[1,4,10,18,35,60].map((d,i)=>[i%3===2?secondary:primary,d]);
    const own=[];
    for(const [i,[merchant,daysAgo]] of visits.entries()) {
      const usedAt=noon(daysAgo)+i*60000;
      const event={transactionId:`mock-personal-fit:${citizen.id}:${i}`,revision:0,actualUserId:citizen.id,merchantId:merchant.id,
        usedAt,recordedAt:usedAt+1000,status:kind==='cancelled'?'cancelled':'confirmed',netAmount:kind==='zero_amount'?0:6000+((index+i)%7)*2000,
        contentVersion:historical.get(merchant.id),...publicConsumptionContext(merchant,catalog)};
      own.push(event);
      if(kind==='revision_cancelled')own.push({...event,revision:1,status:'cancelled',netAmount:0,recordedAt:usedAt+2000});
    }
    events.push(...own);
    const latest=new Map();for(const e of own)if(!latest.has(e.transactionId)||latest.get(e.transactionId).revision<e.revision)latest.set(e.transactionId,e);
    const eligible=[...latest.values()].filter(e=>e.status==='confirmed'&&e.netAmount>0&&e.usedAt>=asOf-90*day&&e.usedAt<asOf);
    const counts=merchants.map(m=>({merchantId:m.id,name:m.name,transactions:own.filter(e=>e.merchantId===m.id).length,
      effectiveVisitDays:new Set(eligible.filter(e=>e.merchantId===m.id).map(e=>Math.floor((e.usedAt+9*3600000)/day))).size})).filter(r=>r.transactions);
    scenarios.push({citizenId:citizen.id,name:citizen.name,scenario:kind,sourceKind:'mock',asOf,historyRows:own.length,visits:counts,
      note:'유효 방문일 수는 중복·취소·0원·90일 창을 반영한 값. 실제 개인화 점수는 최근성·가게 영향력 상한·벡터 유사도도 적용한다.'});
  }
  return {directory,collections:{'merchant-contents':contents,'merchant-vectors':vectors,'personal-fit-events':[...retained,...events],
    'personal-fit-scenarios':scenarios},summary:{generatedEvents:events.length,citizens:citizens.length,firstCitizen:scenarios[0]}};
}));
for(const {directory,collections,summary} of outputs) {
  await mkdir(directory,{recursive:true});
  // Install referenced model versions before the events that use them.
  for(const [name,rows] of Object.entries(collections)) {
    const path=resolve(directory,`${name}.json`),temp=`${path}.${process.pid}.tmp`;
    await writeFile(temp,JSON.stringify(rows,null,2)+'\n');await rename(temp,path);
  }
  console.log(JSON.stringify({directory,...summary},null,2));
}
