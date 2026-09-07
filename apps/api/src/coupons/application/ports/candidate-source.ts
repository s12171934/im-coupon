import type { Candidate } from '../../../issuance/domain/ports/signal';

export interface CandidateSource {
  load(): Promise<Candidate[]>;
}

export const CANDIDATE_SOURCE = Symbol('CANDIDATE_SOURCE');
