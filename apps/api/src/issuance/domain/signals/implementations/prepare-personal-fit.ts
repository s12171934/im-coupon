import {
  DEFAULT_PERSONAL_FIT_PARAMS, PERSONAL_FIT_SIGNAL_VERSION,
  type PersonalFitCandidateRef, type PersonalFitDisabledReason, type PersonalFitMerchantVector,
  type PersonalFitParams, type PersonalFitUsageEvent, type PreparePersonalFitInput,
  type PreparedPersonalFit,
} from './personal-fit-input';

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const EVENT_FIELDS = [
  'transactionId', 'revision', 'actualUserId', 'merchantId', 'usedAt', 'recordedAt',
  'status', 'netAmount', 'contentVersion',
] as const;

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8.64e15;
}
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function key(merchantId: string, contentVersion: string): string {
  return JSON.stringify([merchantId, contentVersion]);
}

// 요청 자체의 계약 오류는 예외로 거부하고, 데이터 부족으로 인한 비활성과 구분한다.
function validateRequest(input: PreparePersonalFitInput): PersonalFitParams {
  if (!nonempty(input.citizenId)) throw new TypeError('personalFit: citizenId must be nonempty');
  if (!timestamp(input.asOf)) throw new TypeError('personalFit: asOf must be an epoch millisecond timestamp');
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) {
    throw new TypeError('personalFit: candidates must be nonempty');
  }
  const ids = new Set<string>();
  for (const candidate of input.candidates) {
    if (!candidate || !nonempty(candidate.merchantId) || !nonempty(candidate.contentVersion)) {
      throw new TypeError('personalFit: candidate merchantId and contentVersion must be nonempty');
    }
    if (ids.has(candidate.merchantId)) throw new TypeError(`personalFit: duplicate candidate ${candidate.merchantId}`);
    ids.add(candidate.merchantId);
  }
  if (input.params !== undefined
    && (input.params === null || typeof input.params !== 'object' || Array.isArray(input.params))) {
    throw new TypeError('personalFit: params must be an object');
  }
  // 생략한 키만 기본값을 쓰고 명시한 undefined/null은 아래 검증에서 거부한다.
  const params = { ...DEFAULT_PERSONAL_FIT_PARAMS, ...input.params };
  for (const name of ['lookbackDays', 'halfLifeDays', 'merchantWeightCap', 'normEpsilon'] as const) {
    const value = params[name];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new TypeError(`personalFit: ${name} must be positive and finite`);
    }
  }
  if (params.dayZone !== 'Asia/Seoul') throw new TypeError('personalFit: dayZone must be Asia/Seoul');
  return params;
}

function validEvent(event: PersonalFitUsageEvent): boolean {
  return !!event && nonempty(event.transactionId) && Number.isSafeInteger(event.revision) && event.revision >= 0
    && (event.actualUserId === null || nonempty(event.actualUserId)) && nonempty(event.merchantId)
    && nonempty(event.contentVersion) && timestamp(event.usedAt) && timestamp(event.recordedAt)
    && (event.status === 'confirmed' || event.status === 'cancelled')
    && typeof event.netAmount === 'number' && Number.isFinite(event.netAmount);
}

function selectHistory(input: PreparePersonalFitInput, params: PersonalFitParams):
  PersonalFitUsageEvent[] | 'INVALID_HISTORY' | 'NO_HISTORY' {
  if (!Array.isArray(input.events)) return 'INVALID_HISTORY';
  for (const event of input.events) if (!validEvent(event)) return 'INVALID_HISTORY';
  // 사용자 필터 전에 revision 충돌을 검사해야 정정 전 사용자의 이력을 되살리지 않는다.
  const transactions = new Map<string, Map<number, PersonalFitUsageEvent>>();
  for (const event of input.events) {
    if (event.recordedAt > input.asOf) continue;
    let revisions = transactions.get(event.transactionId);
    if (!revisions) { revisions = new Map(); transactions.set(event.transactionId, revisions); }
    const previous = revisions.get(event.revision);
    if (previous && EVENT_FIELDS.some(field => previous[field] !== event[field])) return 'INVALID_HISTORY';
    revisions.set(event.revision, event);
  }
  // 최신 revision에서 이 시민의 유효 사용만 고른 뒤, 가게·날짜별 한 사건을 남긴다.
  const days = new Map<string, PersonalFitUsageEvent>();
  const start = input.asOf - params.lookbackDays * DAY_MS;
  for (const revisions of transactions.values()) {
    let latest: PersonalFitUsageEvent | undefined;
    for (const event of revisions.values()) if (!latest || event.revision > latest.revision) latest = event;
    if (!latest || latest.actualUserId !== input.citizenId || latest.status !== 'confirmed'
      || latest.netAmount <= 0 || latest.usedAt < start || latest.usedAt >= input.asOf) continue;
    // 고정 KST 날짜 경계는 서버 로컬 시간대와 무관하게 계산한다.
    const day = Math.floor((latest.usedAt + KST_OFFSET_MS) / DAY_MS);
    const dayKey = JSON.stringify([latest.merchantId, day]);
    const previous = days.get(dayKey);
    if (!previous || latest.usedAt > previous.usedAt
      || (latest.usedAt === previous.usedAt && compare(latest.transactionId, previous.transactionId) < 0)) {
      days.set(dayKey, latest);
    }
  }
  const history = [...days.values()].sort((a, b) => compare(a.merchantId, b.merchantId)
    || a.usedAt - b.usedAt || compare(a.transactionId, b.transactionId));
  return history.length ? history : 'NO_HISTORY';
}

/** 제곱 전에 스케일을 줄여 큰 유한 성분의 불필요한 오버플로를 피한다. */
function normalize(values: readonly number[], epsilon: number): number[] | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  let scale = 0;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    scale = Math.max(scale, Math.abs(value));
  }
  if (scale === 0) return undefined;
  let squares = 0;
  for (const value of values) squares += (value / scale) ** 2;
  const scaledNorm = Math.sqrt(squares);
  const norm = scale * scaledNorm;
  if (!Number.isFinite(norm) || norm <= epsilon) return undefined;
  return values.map(value => (value / scale) / scaledNorm);
}

interface VectorNeed extends PersonalFitCandidateRef { readonly cutoff: number }
function needKey(need: VectorNeed): string {
  return JSON.stringify([need.merchantId, need.contentVersion, need.cutoff]);
}
function sameVector(a: PersonalFitMerchantVector, b: PersonalFitMerchantVector): boolean {
  return a.specId === b.specId && a.knownAt === b.knownAt && a.verifiedAt === b.verifiedAt
    && a.values.length === b.values.length && a.values.every((value, i) => value === b.values[i]);
}

function resolveVectors(input: PreparePersonalFitInput, history: readonly PersonalFitUsageEvent[], epsilon: number):
  Map<string, readonly number[]> | 'MISSING_VECTOR' | 'INVALID_VECTOR' {
  // 정제된 사건은 사용 당시, 후보는 준비 시점에 알려지고 검증된 정확한 버전을 요구한다.
  const needs = new Map<string, VectorNeed>();
  for (const event of history) {
    const need = { merchantId: event.merchantId, contentVersion: event.contentVersion, cutoff: event.usedAt };
    needs.set(needKey(need), need);
  }
  for (const candidate of input.candidates) {
    const need = { ...candidate, cutoff: input.asOf };
    needs.set(needKey(need), need);
  }
  const neededKeys = new Set([...needs.values()].map(need => key(need.merchantId, need.contentVersion)));
  const index = new Map<string, PersonalFitMerchantVector[]>();
  if (!Array.isArray(input.vectors)) return 'INVALID_VECTOR';
  for (const vector of input.vectors) {
    if (!vector) continue;
    const vectorKey = key(vector.merchantId, vector.contentVersion);
    if (!neededKeys.has(vectorKey)) continue;
    const records = index.get(vectorKey);
    if (records) records.push(vector); else index.set(vectorKey, [vector]);
  }
  const resolved = new Map<string, readonly number[]>();
  let specId: string | undefined;
  let dimension: number | undefined;
  // 필요한 키만 일정한 순서로 검사해 무관한 벡터 결함과 입력 순서의 영향을 배제한다.
  const ordered = [...needs.values()].sort((a, b) => compare(a.merchantId, b.merchantId)
    || compare(a.contentVersion, b.contentVersion) || a.cutoff - b.cutoff);
  for (const need of ordered) {
    const records = index.get(key(need.merchantId, need.contentVersion)) ?? [];
    if (records.some(v => !timestamp(v.knownAt) || !timestamp(v.verifiedAt))) return 'INVALID_VECTOR';
    const available = records.filter(v => v.knownAt <= need.cutoff && v.verifiedAt <= need.cutoff);
    if (!available.length) return 'MISSING_VECTOR';
    let first: PersonalFitMerchantVector | undefined;
    let unit: number[] | undefined;
    for (const vector of available) {
      const normalized = normalize(vector.values, epsilon);
      if (!nonempty(vector.specId) || !normalized) return 'INVALID_VECTOR';
      if (first && !sameVector(first, vector)) return 'INVALID_VECTOR';
      first = vector;
      unit = normalized;
    }
    if (!first || !unit) return 'INVALID_VECTOR';
    if ((specId !== undefined && specId !== first.specId)
      || (dimension !== undefined && dimension !== unit.length)) return 'INVALID_VECTOR';
    specId = first.specId;
    dimension = unit.length;
    resolved.set(needKey(need), unit);
  }
  return resolved;
}

function buildProfile(history: readonly PersonalFitUsageEvent[], vectors: Map<string, readonly number[]>,
  asOf: number, params: PersonalFitParams): number[] | undefined {
  // 내용 버전이 달라도 같은 가게의 최근성 합에 하나의 상한을 적용한다.
  const weights = history.map(event => 2 ** (-((asOf - event.usedAt) / DAY_MS) / params.halfLifeDays));
  const totals = new Map<string, number>();
  for (let i = 0; i < history.length; i++) {
    const id = history[i]!.merchantId;
    const total = (totals.get(id) ?? 0) + weights[i]!;
    if (!Number.isFinite(total)) return undefined;
    totals.set(id, total);
  }
  let scale = 0;
  for (const total of totals.values()) scale = Math.max(scale, Math.min(total, params.merchantWeightCap));
  if (scale === 0) return undefined;
  const dimension = vectors.values().next().value!.length;
  const sum = new Array<number>(dimension).fill(0);
  let denominator = 0;
  for (let i = 0; i < history.length; i++) {
    const event = history[i]!;
    const total = totals.get(event.merchantId)!;
    // 일부 가게만 언더플로하면 기여를 건너뛰고, 나머지 가게로 프로필을 만든다.
    if (total === 0) continue;
    // a = (r / W) * min(W, cap). 공통 스케일을 먼저 나눠 극소 cap과 성분의 곱에서
    // 방향을 잃지 않게 한다. 분자·분모에 같은 스케일을 쓰므로 가중 평균은 같다.
    const weight = (weights[i]! / total) * (Math.min(total, params.merchantWeightCap) / scale);
    if (!Number.isFinite(weight)) return undefined;
    denominator += weight;
    const unit = vectors.get(needKey({ ...event, cutoff: event.usedAt }))!;
    for (let j = 0; j < dimension; j++) sum[j] = sum[j]! + weight * unit[j]!;
  }
  // 무효 분모·비유한 합·노름 상쇄는 방향을 정할 수 없으므로 전체 비활성으로 넘긴다.
  if (!Number.isFinite(denominator) || denominator <= 0 || sum.some(value => !Number.isFinite(value))) return undefined;
  return normalize(sum.map(value => value / denominator), params.normEpsilon);
}

function scoreCandidates(input: PreparePersonalFitInput, profile: readonly number[],
  vectors: Map<string, readonly number[]>): Record<string, number> | undefined {
  // 모든 내적이 유한한지 확인한 뒤 제한한다. 음수는 정상 0점이며 NaN을 숨기지 않는다.
  const scores: Record<string, number> = Object.create(null);
  for (const candidate of [...input.candidates].sort((a, b) => compare(a.merchantId, b.merchantId))) {
    const vector = vectors.get(needKey({ ...candidate, cutoff: input.asOf }))!;
    let dot = 0;
    for (let i = 0; i < profile.length; i++) dot += profile[i]! * vector[i]!;
    if (!Number.isFinite(dot)) return undefined;
    scores[candidate.merchantId] = Math.min(1, Math.max(0, dot));
  }
  return scores;
}

function result(input: PreparePersonalFitInput, reason: PersonalFitDisabledReason | null,
  scores?: Record<string, number>): PreparedPersonalFit {
  // 실패하면 전 후보를 0으로 채워 부분 점수를 내보내지 않는다. 복사·동결로 원본 변경도 차단한다.
  const ownedScores: Record<string, number> = Object.create(null);
  for (const candidate of input.candidates) ownedScores[candidate.merchantId] = reason ? 0 : scores![candidate.merchantId]!;
  const base = {
    citizenId: input.citizenId, asOf: input.asOf, signalVersion: PERSONAL_FIT_SIGNAL_VERSION,
    candidates: Object.freeze(input.candidates.map(candidate => Object.freeze({
      merchantId: candidate.merchantId, contentVersion: candidate.contentVersion,
    }))),
    scoresByMerchantId: Object.freeze(ownedScores),
  } as const;
  return reason === null ? Object.freeze({ ...base, enabled: true, reason: null })
    : Object.freeze({ ...base, enabled: false, reason });
}

/** 시민·후보 집합당 한 번 준비한다. 외부 호출·시계·난수·공유 상태 없이 입력만 사용한다. */
export function preparePersonalFit(input: PreparePersonalFitInput): PreparedPersonalFit {
  const params = validateRequest(input);
  const history = selectHistory(input, params);
  if (typeof history === 'string') return result(input, history);
  const vectors = resolveVectors(input, history, params.normEpsilon);
  if (typeof vectors === 'string') return result(input, vectors);
  const profile = buildProfile(history, vectors, input.asOf, params);
  if (!profile) return result(input, 'INVALID_PROFILE');
  const scores = scoreCandidates(input, profile, vectors);
  return scores ? result(input, null, scores) : result(input, 'INVALID_PROFILE');
}
