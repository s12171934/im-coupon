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
  expect(candidates).toHaveLength(240);
  expect(prepared.size).toBe(20);
  for (const result of prepared.values()) {
    expect(result.enabled).toBe(true);
    expect(Object.keys(result.scoresByMerchantId)).toHaveLength(12);
    const scores = Object.values(result.scoresByMerchantId);
    expect(scores.every((score) => Number.isFinite(score) && score >= 0 && score <= 1)).toBe(true);
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(0.001);
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
  await db.writeCollection('merchant-vectors', []);
  const candidates = await new JsonCandidateSource(directory).load();
  const prepared = await new JsonPersonalFitSource(directory).prepare(candidates, Math.max(...events.map((event) => event.recordedAt)) + 86400000);
  for (const result of prepared.values()) expect(result).toMatchObject({ enabled: false, reason: 'MISSING_VECTOR' });
});

it('현재 내용의 벡터가 없으면 과거 메뉴 벡터로 대체하지 않는다', async () => {
  const events = await db.readCollection<PersonalFitUsageEvent>('personal-fit-events');
  const asOf = Math.max(...events.map((event) => event.recordedAt)) + 86400000;
  const contents = await db.readCollection<{ merchantId: string; contentVersion: string; knownAt: number; verifiedAt: number }>('merchant-contents');
  const newest = contents.filter((row) => row.merchantId === 'mer-001').sort((a, b) => b.knownAt - a.knownAt)[0];
  const vectors = await db.readCollection<{ merchantId: string; contentVersion: string }>('merchant-vectors');
  await db.writeCollection('merchant-vectors', vectors.filter((row) => row.contentVersion !== newest.contentVersion));
  const candidates = await new JsonCandidateSource(directory).load();
  const prepared = await new JsonPersonalFitSource(directory).prepare(candidates, asOf);
  for (const result of prepared.values()) expect(result).toMatchObject({ enabled: false, reason: 'MISSING_VECTOR' });
});

it('미래 내용은 현재 후보 버전을 바꾸지 않는다', async () => {
  const events = await db.readCollection<PersonalFitUsageEvent>('personal-fit-events');
  const asOf = Math.max(...events.map((event) => event.recordedAt)) + 86400000;
  const candidates = await new JsonCandidateSource(directory).load();
  const source = new JsonPersonalFitSource(directory);
  const before = await source.prepare(candidates, asOf);
  const contents = await db.readCollection('merchant-contents');
  await db.writeCollection('merchant-contents', [...contents, {
    merchantId: 'mer-001', contentVersion: 'future-menu', knownAt: asOf + 1, verifiedAt: asOf + 1,
  }]);
  expect(await source.prepare(candidates, asOf)).toEqual(before);
});

it('현재 내용 컬렉션이 없으면 벡터만 보고 후보 버전을 추측하지 않는다', async () => {
  const events = await db.readCollection<PersonalFitUsageEvent>('personal-fit-events');
  await db.writeCollection('merchant-contents', []);
  const candidates = await new JsonCandidateSource(directory).load();
  const prepared = await new JsonPersonalFitSource(directory).prepare(candidates, Math.max(...events.map((event) => event.recordedAt)) + 86400000);
  for (const result of prepared.values()) expect(result).toMatchObject({ enabled: false, reason: 'MISSING_VECTOR' });
});
