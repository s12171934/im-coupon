/** Readiness checks only: this module does not issue coupons or compute a weighted score. */
export function consumptionTrend(rows) {
  if (rows.length !== 3 || rows.some(r => !r || r.amount === null))
    return { status: 'missing_region_month', baselineDailyAmount: null, currentDailyAmount: null, declineRate: null };
  if (rows.some(r => !Number.isSafeInteger(r.amount) || r.amount < 0))
    return { status: 'invalid_amount', baselineDailyAmount: null, currentDailyAmount: null, declineRate: null };
  const baselineDailyAmount = (rows[0].amount + rows[1].amount) / 61;
  const currentDailyAmount = rows[2].amount / 30;
  return { status: baselineDailyAmount === 0 ? 'zero_denominator' : 'available', baselineDailyAmount, currentDailyAmount,
    declineRate: baselineDailyAmount === 0 ? null : 1 - currentDailyAmount / baselineDailyAmount };
}

export function candidateReadiness({ merchant, comparison, contents, vectors, asOf }) {
  const reasons = [];
  if (!comparison) reasons.push('MISSING_STATISTICS');
  else {
    if (comparison.local.status !== 'available') reasons.push(`LOCAL_${comparison.local.status.toUpperCase()}`);
    if (comparison.city.status !== 'available') reasons.push(`CITY_${comparison.city.status.toUpperCase()}`);
  }
  const known = row => Number.isFinite(row.knownAt) && Number.isFinite(row.verifiedAt)
    && row.knownAt <= asOf && row.verifiedAt <= asOf;
  const versions = contents.filter(c => c.merchantId === merchant.id && known(c))
    .sort((a,b) => b.knownAt-a.knownAt || b.verifiedAt-a.verifiedAt || (a.contentVersion < b.contentVersion ? 1 : a.contentVersion > b.contentVersion ? -1 : 0));
  const content = versions[0];
  let vector;
  if (!content) reasons.push('MISSING_CONTENT');
  else {
    const matches = vectors.filter(v => v.merchantId === merchant.id && v.contentVersion === content.contentVersion && known(v));
    if (!matches.length) reasons.push('MISSING_VECTOR');
    else if (matches.length !== 1) reasons.push('AMBIGUOUS_VECTOR');
    else {
      vector = matches[0];
      const values = vector.values;
      if (typeof vector.specId !== 'string' || !vector.specId.trim() || !Array.isArray(values)
        || !values.length || !values.every(Number.isFinite)
        || !Number.isFinite(Math.hypot(...values)) || Math.hypot(...values) <= 1e-12) reasons.push('INVALID_VECTOR');
    }
  }
  return { merchantId: merchant.id, name: merchant.name, sourceKind: 'mock', evaluatedAt: asOf,
    referenceMonth: '202606', districtCode: comparison?.districtCode ?? null, categoryCode: comparison?.categoryCode ?? null,
    eligible: reasons.length === 0, reasons, contentVersion: content?.contentVersion ?? null,
    vectorSpecId: vector?.specId ?? null, vectorDimension: vector?.values?.length ?? null };
}
