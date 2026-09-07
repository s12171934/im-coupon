import type { Candidate } from '../../../issuance/domain/signals/signal';

export interface CandidateSource {
  load(): Promise<Candidate[]>;
}

export const CANDIDATE_SOURCE = Symbol('CANDIDATE_SOURCE');
