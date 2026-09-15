import type { ApiErrorCode, IssueDecision, SignalWeights } from '@im-coupon/contracts';
import { DEFAULT_ISSUANCE_PARAMS } from '../params';
import type { Candidate, Signal, SignalContext } from '../signals/signal';
export class IssuanceError extends Error {
  constructor(readonly code: ApiErrorCode, message: string) { super(message); this.name='IssuanceError'; }
}
export interface SelectCandidateInput<C extends SignalContext = SignalContext> {
  candidates: readonly Candidate[];
  signals: Record<keyof SignalWeights, Signal<keyof SignalWeights,C>>;
  weights?: Partial<SignalWeights>;
  context: C;
}
export interface CandidateSelection {candidate:Candidate;decision:IssueDecision;}
export function resolveWeights(requested: Partial<SignalWeights> | undefined): SignalWeights {
  const merged={...DEFAULT_ISSUANCE_PARAMS.weights};
  for(const [key,value] of Object.entries(requested ?? {})) {
    if(!Object.hasOwn(merged,key))throw new IssuanceError('INVALID_WEIGHTS',`모르는 발급 신호입니다: ${key}`);
    if(value!==undefined)merged[key as keyof SignalWeights]=value;
  }
  if(Object.values(merged).some(v=>!Number.isFinite(v)||v<0) || !Number.isFinite(merged.personalFit+merged.salesRecovery) || merged.personalFit+merged.salesRecovery<=0)
    throw new IssuanceError('INVALID_WEIGHTS','가중치는 유한한 0 이상의 숫자이며 합은 0보다 커야 합니다.');
  return merged;
}
export function selectCandidate<C extends SignalContext>(input:SelectCandidateInput<C>): CandidateSelection {
  const weights=resolveWeights(input.weights);
  const weightSum=weights.personalFit+weights.salesRecovery;
  let best:CandidateSelection|undefined;
  for(const candidate of input.candidates) {
    const scores={personalFit:input.signals.personalFit.score(candidate,input.context),salesRecovery:input.signals.salesRecovery.score(candidate,input.context)};
    if(Object.values(scores).some(s=>!Number.isFinite(s)||s<0||s>1)) throw new Error('신호 점수가 0~1 범위의 유한한 값이 아닙니다.');
    const total=weights.personalFit/weightSum*scores.personalFit+weights.salesRecovery/weightSum*scores.salesRecovery;
    const tied=best && total===best.decision.total;
    if(!best || total>best.decision.total || (tied && (scores.personalFit>(best.decision.scores.personalFit ?? 0)
      || (scores.personalFit===best.decision.scores.personalFit && candidate.merchant.id<best.candidate.merchant.id))))
      best={candidate,decision:{candidateCount:input.candidates.length,scores,total,tieBreak:'최종 점수 → 개인화 점수 → 가게 ID 오름차순'}};
  }
  if(!best)throw new IssuanceError('NO_CANDIDATES','점수를 매길 발급 후보가 없습니다.');
  return best;
}
