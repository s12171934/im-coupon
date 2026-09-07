import type { ApiErrorCode, IssueDecision, SignalWeights } from '@im-coupon/contracts';

import { DEFAULT_ISSUANCE_PARAMS } from '../params';
import type { Candidate, Signal, SignalContext } from '../ports/signal';

/**
 * 발급이 거부된 이유. 계약의 오류 코드를 그대로 들어, API 층이 이 클래스 하나만 잡고
 * `code` 를 오류 응답으로 옮기면 되게 한다. 여기서 HTTP 상태로 옮기지는 않는다 —
 * 엔진은 NestJS 에 의존하지 않는다.
 */
export class IssuanceError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'IssuanceError';
  }
}

export interface SelectCandidateInput {
  /** 점수를 매길 발급 후보. 비어 있으면 `NO_CANDIDATES` 로 거부한다 */
  candidates: readonly Candidate[];
  /**
   * 신호 키마다 점수를 낼 신호. `Record<keyof SignalWeights, Signal>` 이라, 가중치에
   * 키를 더하고 신호 구현을 빠뜨리면 여기서 컴파일 오류가 난다 — `Signal.key` 가 막지
   * 못하는 반대 방향을 막는 자리다.
   *
   * 엔진은 맵의 키만 신뢰하고 각 신호의 `key` 필드는 읽지 않는다. 키 집합을 강제하는
   * 것이 맵 쪽이고, `key` 필드를 조회에 쓰면 그 강제가 런타임 값에 도로 매달리기 때문이다.
   */
  signals: Record<keyof SignalWeights, Signal>;
  /**
   * 요청의 발급 가중치 부분 덮어쓰기. 지정하지 않은 신호는 발급 파라미터 기본값으로
   * 채우며, 값이 `undefined` 인 키도 지정하지 않은 것으로 본다.
   */
  weights?: Partial<SignalWeights>;
  context: SignalContext;
}

export interface CandidateSelection {
  candidate: Candidate;
  decision: IssueDecision;
}

/**
 * 요청의 부분 덮어쓰기를 발급 파라미터 기본값과 병합하고 값 규칙을 건다.
 *
 * 모르는 신호 키만 병합 **전** 요청에서 본다 — 병합하면 그 키가 사라져 검사할 수 없다.
 * 값이 무엇이든 키를 든 것 자체가 없는 신호를 부른 것이므로 값보다 먼저 본다.
 * 나머지 셋(숫자가 아님·음수·합이 0)은 병합 **후** 값에 건다. 병합 후에도 키가 비는
 * 상황은 발급 파라미터 결손이라 요청 오류가 아니므로 조건에 두지 않는다.
 *
 * "숫자가 아님"은 `Number.isFinite` 로 판정한다. 숫자 아닌 값과 `NaN` 뿐 아니라
 * `±Infinity` 까지 한 번에 걸러야 한다 — `Infinity` 가중치는 점수 `0` 인 발급 후보에서
 * `total` 을 `NaN` 으로 만들고, `NaN` 과의 비교가 늘 거짓이라 그 후보가 최고점 자리에
 * 눌러앉는다. 조건을 늘리는 것이 아니라 이 한 조건의 판정을 제대로 하는 것이다.
 *
 * 알려진 키의 `undefined` 는 지정하지 않은 것으로 본다. `Partial<SignalWeights>` 에서
 * `undefined` 는 "지정하지 않음"이므로, 그대로 스프레드해 기본값을 덮게 두면 키를 생략한
 * 요청과 다른 결과가 난다. JSON 본문에는 없는 형태지만 프로세스 안에서 발급 명령을 만드는
 * 호출자가 `{ random: 있을수도없을수도 }` 를 넘길 때 걸린다. `null` 은 걷어내지 않는다 —
 * JSON 이 실어 보낼 수 있는 값이고 "숫자가 아님"으로 거부하는 것이 맞다.
 */
function resolveWeights(requested: Partial<SignalWeights> | undefined): SignalWeights {
  const defaults = DEFAULT_ISSUANCE_PARAMS.weights;
  const specified: Partial<SignalWeights> = {};
  for (const [key, weight] of Object.entries(requested ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
      throw new IssuanceError('INVALID_WEIGHTS', `모르는 신호의 발급 가중치다 — ${key}`);
    }
    if (weight === undefined) continue;
    specified[key as keyof SignalWeights] = weight;
  }

  const merged: SignalWeights = { ...defaults, ...specified };
  let sum = 0;
  for (const key of Object.keys(merged) as (keyof SignalWeights)[]) {
    const weight = merged[key];
    if (!Number.isFinite(weight)) {
      throw new IssuanceError('INVALID_WEIGHTS', `발급 가중치가 유한한 숫자가 아니다 — ${key}`);
    }
    if (weight < 0) {
      throw new IssuanceError('INVALID_WEIGHTS', `발급 가중치가 음수다 — ${key}`);
    }
    sum += weight;
  }
  if (sum === 0) {
    throw new IssuanceError('INVALID_WEIGHTS', '발급 가중치의 합이 0 이라 발급 후보를 가릴 수 없다');
  }

  return merged;
}

/**
 * 발급 후보마다 신호 점수를 매기고 발급 가중치로 결합해 최고점 하나를 고른다.
 *
 * 난수는 `context` 로 주입받아 신호에 넘길 뿐 직접 뽑지 않는다. 발급 후보 하나에 대해
 * 신호를 가중치 키 순서로 한 번씩 태우므로, 고정 수열 RNG 를 주면 소비 순서가 정해져
 * 결과가 결정적이다. 최고점이 여럿이면 발급 후보 목록에서 먼저 온 쪽을 고른다.
 */
export function selectCandidate(input: SelectCandidateInput): CandidateSelection {
  const weights = resolveWeights(input.weights);
  const keys = Object.keys(weights) as (keyof SignalWeights)[];

  let best: CandidateSelection | undefined;
  for (const candidate of input.candidates) {
    const scores = {} as Record<keyof SignalWeights, number>;
    let total = 0;
    for (const key of keys) {
      const score = input.signals[key].score(candidate, input.context);
      scores[key] = score;
      total += weights[key] * score;
    }
    if (best === undefined || total > best.decision.total) {
      best = { candidate, decision: { candidateCount: input.candidates.length, scores, total } };
    }
  }

  if (best === undefined) {
    throw new IssuanceError('NO_CANDIDATES', '점수를 매길 발급 후보가 없다');
  }
  return best;
}
