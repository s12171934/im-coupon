import { describe, it, expect } from 'vitest';
import { prepareSalesRecovery } from './sales-recovery';
import type { Candidate } from '../signal';
const candidate = {citizen:{id:'c',name:'시민'},merchant:{id:'m',name:'가게',category:'카페',publicData:{regionCode:'30',district:'유성구',categoryCode:'I21201'}}} as Candidate;
const districts=[{code:'30200',name:'유성구',provinceCode:'30'},{code:'30110',name:'동구',provinceCode:'30'}];
const metadata=[{referenceMonth:'202606',sourceKind:'mock',categorySystem:'D1'}];
const rows = ['30200','30110'].flatMap(districtCode => ['202604','202605','202606'].map((month,i)=>({districtCode,categoryCode:'I21201',provinceCode:'30',categorySystem:'D1',sourceKind:'mock',month,amount:i===0?3000:i===1?3100:districtCode==='30200'?2250:3000})));
describe('salesRecovery',()=>{
 it('일평균과 도시 합산으로 댓글의 식을 계산한다',()=>{
  const r=prepareSalesRecovery([candidate],rows,metadata,districts);
  expect(r.enabled).toBe(true);
  expect(r.byMerchantId.get('m')?.score).toBeCloseTo(0.6+0.4*(0.125/0.15));
 });
 it('다른 구의 관측 누락도 도시 비교를 비활성화한다',()=>{
  const r=prepareSalesRecovery([candidate],rows.slice(0,-1),metadata,districts);
  expect(r.enabled).toBe(false);expect(r.byMerchantId.get('m')?.score).toBeNull();
 });
 it('중복·0분모를 0점으로 바꾸지 않는다',()=>{
  expect(prepareSalesRecovery([candidate],[...rows,rows[0]!],metadata,districts).enabled).toBe(false);
  expect(prepareSalesRecovery([candidate],rows.map(r=>({...r,amount:0})),metadata,districts).byMerchantId.get('m')?.score).toBeNull();
 });
});
