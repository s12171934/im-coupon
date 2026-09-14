import { JsonFileDb } from '@im-coupon/db';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { PersonalFitUsageEvent } from '../../issuance/domain/signals/implementations/personal-fit-input';
import { resolveSeedDir } from '../../shared/infrastructure/data-dir';
import { JsonCandidateSource } from './json-candidate-source';
import { JsonPersonalFitSource } from './json-personal-fit-source';

let directory: string;
let db: JsonFileDb;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'personal-fit-source-'));
  db = new JsonFileDb(directory);
  await db.bootstrapFromSeed(resolveSeedDir());
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

it('목 데이터의 모든 시민에게 후보 전체의 개인화 점수를 준비한다', async () => {
  const candidates = await new JsonCandidateSource(directory).load();
  const events = await db.readCollection<PersonalFitUsageEvent>('personal-fit-events');
  const asOf = Math.max(...events.map((event) => event.recordedAt)) + 86400000;
  const prepared = await new JsonPersonalFitSource(directory).prepare(candidates, asOf);
  expect(candidates).toHaveLength(300);
  expect(prepared.size).toBe(20);
  for (const result of prepared.values()) {
    expect(result.enabled).toBe(true);
    expect(Object.keys(result.scoresByMerchantId)).toHaveLength(15);
    const scores = Object.values(result.scoresByMerchantId);
    expect(scores.every((score) => Number.isFinite(score) && score >= 0 && score <= 1)).toBe(true);
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(0.1);
  }
  expect(prepared.get('cit-001')?.scoresByMerchantId).not.toEqual(prepared.get('cit-002')?.scoresByMerchantId);
});

it('행동 이력이 없으면 0점과 NO_HISTORY를 반환한다', async () => {
  await db.writeCollection('personal-fit-events', []);
  const candidates = await new JsonCandidateSource(directory).load();
  const prepared = await new JsonPersonalFitSource(directory).prepare(candidates, Date.now());
  for (const result of prepared.values()) {
    expect(result).toMatchObject({ enabled: false, reason: 'NO_HISTORY' });
    expect(Object.values(result.scoresByMerchantId).every((score) => score === 0)).toBe(true);
  }
});

it('후보 벡터가 없으면 개인화가 적용된 것으로 가장하지 않는다', async () => {
  const events = await db.readCollection<PersonalFitUsageEvent>('personal-fit-events');
  await db.writeCollection('personal-fit-vectors', []);
  const candidates = await new JsonCandidateSource(directory).load();
  const prepared = await new JsonPersonalFitSource(directory).prepare(candidates, Math.max(...events.map((event) => event.recordedAt)) + 86400000);
  for (const result of prepared.values()) expect(result).toMatchObject({ enabled: false, reason: 'MISSING_VECTOR' });
});
