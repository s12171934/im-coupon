import { describe,it,expect } from 'vitest';
import { selectCandidate,resolveWeights } from './engine';
const citizen={id:'c',name:'시민'};
const candidates=['b','a'].map(id=>({citizen,merchant:{id,name:id,category:'카페'}}));
const signals={personalFit:{key:'personalFit' as const,score:()=>0.8},salesRecovery:{key:'salesRecovery' as const,score:()=>0.2}};
describe('weighted selection',()=>{
 it('가중치 합으로 나누고 동점은 가게 ID로 결정한다',()=>{
  const r=selectCandidate({candidates,signals,weights:{personalFit:7,salesRecovery:3},context:{}});
  expect(r.candidate.merchant.id).toBe('a');expect(r.decision.total).toBeCloseTo(0.62);
 });
 it('합산 동점이면 개인화 점수가 높은 후보를 고른다',()=>{
  const r=selectCandidate({candidates,signals:{personalFit:{key:'personalFit',score:c=>c.merchant.id==='b'?1:0},salesRecovery:{key:'salesRecovery',score:c=>c.merchant.id==='a'?1:0}},weights:{personalFit:1,salesRecovery:1},context:{}});
  expect(r.candidate.merchant.id).toBe('b');
 });
 it('랜덤·0합·비정상 가중치를 거부한다',()=>{
  expect(()=>resolveWeights({random:1} as never)).toThrow();
  expect(()=>resolveWeights({personalFit:0,salesRecovery:0})).toThrow();
  expect(()=>resolveWeights({personalFit:Infinity})).toThrow();
 });
});
