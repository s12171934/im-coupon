import type { Candidate } from '../signal';

export interface RecoveryValue {
  score: number | null;
  reason: string | null;
  localDeclineRate: number | null;
  cityDeclineRate: number | null;
}
export interface PreparedRecovery {
  enabled: boolean;
  reason: string | null;
  referenceMonth: string | null;
  sourceKind: 'mock' | 'observed' | null;
  unavailableMerchants: { merchantId: string; reason: string }[];
  byMerchantId: Map<string, RecoveryValue>;
}
type Row = Record<string, unknown>;
const object = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const clip = (n: number) => Math.max(0, Math.min(1, n));

/** Read monthly observations afresh; cached candidate scores are not authoritative. */
export function prepareSalesRecovery(candidates: readonly Candidate[], data: unknown[], metadata: unknown[], districts: readonly {code:string;name:string;provinceCode:string}[]): PreparedRecovery {
  const meta = metadata.length === 1 && object(metadata[0]) ? metadata[0] : undefined;
  const referenceMonth = typeof meta?.referenceMonth === 'string' && /^\d{4}(0[1-9]|1[0-2])$/.test(meta.referenceMonth) ? meta.referenceMonth : null;
  const sourceKind = meta?.sourceKind === 'mock' || meta?.sourceKind === 'observed' ? meta.sourceKind : null;
  const result: PreparedRecovery = { enabled: true, reason: null, referenceMonth, sourceKind, unavailableMerchants: [], byMerchantId: new Map() };
  const regions = districts.filter(d => d.provinceCode === '30');
  const months = referenceMonth ? [-2,-1,0].map(offset=>{
    const date = new Date(Date.UTC(Number(referenceMonth.slice(0,4)),Number(referenceMonth.slice(4))-1+offset,1));
    return {month:`${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,'0')}`,days:new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()};
  }) : [];
  const index = new Map<string, Row[]>();
  for(const row of data) if(object(row)) {
    const key=`${row.districtCode}/${row.categoryCode}/${row.month}`;
    index.set(key,[...(index.get(key) ?? []),row]);
  }
  const fail = (id:string, reason:string) => {
    result.unavailableMerchants.push({merchantId:id,reason});
    result.byMerchantId.set(id,{score:null,reason,localDeclineRate:null,cityDeclineRate:null});
  };
  for(const {merchant} of candidates) {
    if(result.byMerchantId.has(merchant.id))continue;
    if(!referenceMonth || !sourceKind || meta?.categorySystem !== 'D1' || !regions.length) { fail(merchant.id,'소비 통계의 기준월·출처·지역 목록을 확인할 수 없습니다.');continue; }
    const store=merchant.publicData;
    const local=regions.filter(d=>d.name===store?.district);
    if(store?.regionCode!=='30' || local.length!==1 || !store.categoryCode) {fail(merchant.id,'가게의 대전 지역·공공 업종 코드가 없습니다.');continue;}
    const totals=[0,0,0], localTotals=[0,0,0];
    let reason: string | null=null;
    for(const [i,month] of months.entries()) for(const district of regions) {
      const values=index.get(`${district.code}/${store.categoryCode}/${month.month}`) ?? [];
      if(values.length!==1) {reason=`${district.name} ${month.month} ${store.categoryCode} 통계가 ${values.length ? '중복되었습니다' : '없습니다'}.`;break;}
      const row=values[0]!;
      if(row.provinceCode!=='30' || row.categorySystem!=='D1' || row.sourceKind!==sourceKind || typeof row.amount!=='number' || !Number.isSafeInteger(row.amount) || row.amount<0) {reason=`${district.name} ${month.month} 소비액 또는 출처가 올바르지 않습니다.`;break;}
      totals[i]=totals[i]!+row.amount;
      if(district.code===local[0]!.code)localTotals[i]=row.amount;
    }
    if(reason) {fail(merchant.id,reason);continue;}
    if(totals.some(n=>!Number.isSafeInteger(n)) || !Number.isSafeInteger(totals[0]!+totals[1]!) || !Number.isSafeInteger(localTotals[0]!+localTotals[1]!)) {fail(merchant.id,'소비액 합계가 안전하게 계산할 수 있는 범위를 벗어났습니다.');continue;}
    const baseline=(localTotals[0]!+localTotals[1]!)/(months[0]!.days+months[1]!.days);
    const cityBaseline=(totals[0]!+totals[1]!)/(months[0]!.days+months[1]!.days);
    if(baseline<=0 || cityBaseline<=0) {fail(merchant.id,'직전 두 달 소비액이 0이어서 감소율을 계산할 수 없습니다.');continue;}
    const d=1-localTotals[2]!/months[2]!.days/baseline;
    const cityD=1-totals[2]!/months[2]!.days/cityBaseline;
    const r=Math.max(0,d);
    result.byMerchantId.set(merchant.id,{score:0.6*clip(r/0.25)+0.4*clip((r-Math.max(0,cityD))/0.15),reason:null,localDeclineRate:d,cityDeclineRate:cityD});
  }
  if(result.unavailableMerchants.length) {
    result.enabled=false;
    result.reason='후보 중 회복 통계가 부족한 가게가 있어 전체 후보에 개인화만 적용했습니다.';
  }
  return result;
}
