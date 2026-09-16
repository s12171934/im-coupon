import test from 'node:test';
import assert from 'node:assert/strict';
import { consumptionTrend, candidateReadiness } from './sales-recovery-readiness.mjs';

test('missing observations and zero baseline are not a zero decline', () => {
  assert.equal(consumptionTrend([{amount:3000},undefined,{amount:0}]).declineRate,null);
  assert.equal(consumptionTrend([{amount:0},{amount:0},{amount:3000}]).status,'zero_denominator');
  assert.equal(consumptionTrend([{amount:3000},{amount:3100},{amount:0}]).declineRate,1);
  assert.equal(consumptionTrend([{amount:3000},{amount:3100},{amount:2400}]).baselineDailyAmount,100);
});
test('an older vector cannot qualify a merchant whose latest content lacks a vector', () => {
  const candidate = candidateReadiness({merchant:{id:'m',name:'가게'},asOf:100,
    comparison:{local:{status:'available'},city:{status:'available'},districtCode:'30',categoryCode:'I21201'},
    contents:[{merchantId:'m',contentVersion:'old',knownAt:1,verifiedAt:1},{merchantId:'m',contentVersion:'new',knownAt:2,verifiedAt:2}],
    vectors:[{merchantId:'m',contentVersion:'old',knownAt:1,verifiedAt:1,specId:'e5',values:[1,0]}]});
  assert.equal(candidate.eligible,false);
  assert.deepEqual(candidate.reasons,['MISSING_VECTOR']);
});
