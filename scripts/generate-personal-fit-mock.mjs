import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const asOf = process.argv[2] ? Date.parse(process.argv[2]) : Date.now();
if (!Number.isFinite(asOf)) throw new Error('기준 시각은 ISO 8601로 입력하세요.');
const day = 86400000;
const contentVersion = 'mock-personal-fit-v1';
const specId = 'mock-category-5d-v1';
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const citizens = await read(resolve(root, 'data/seed/citizens.json'));
const merchants = await read(resolve(root, 'data/seed/merchants.json'));
if (!citizens.length || !merchants.length) throw new Error('시민과 가맹점 시드가 필요합니다.');

// 학습 모델의 임베딩이 아닌 시연용 특징: 식사·음료·문화·생활취향·생활서비스.
const features = {
  '분식': [1, 0.2, 0, 0, 0], '서점': [0, 0, 1, 0.2, 0],
  '카페': [0.3, 1, 0.2, 0, 0], '꽃집': [0, 0, 0.2, 1, 0],
  '세탁소': [0, 0, 0, 0.1, 1], '한식': [1, 0, 0, 0.1, 0],
  '베이커리': [0.6, 0.8, 0, 0, 0], '식료품': [0.5, 0, 0, 0.2, 0.7],
  '면요리': [0.9, 0.1, 0, 0, 0.1], '사진관': [0, 0, 0.6, 0.7, 0],
  '문구점': [0, 0, 0.8, 0.3, 0.1], '공예': [0, 0, 0.5, 0.9, 0],
  '미용실': [0, 0, 0, 0.4, 0.9], '반찬가게': [0.8, 0, 0, 0.1, 0.4],
  '수선점': [0, 0, 0, 0.2, 1],
};
const knownAt = asOf - 180 * day;
const vectors = merchants.map((merchant) => ({
  merchantId: merchant.id, contentVersion, specId, knownAt, verifiedAt: knownAt,
  values: features[merchant.category] ?? [0.2, 0.2, 0.2, 0.2, 0.2],
}));
const offsets = [1, 4, 10, 18, 35, 60];
const events = citizens.flatMap((citizen, index) => offsets.map((daysAgo, visit) => {
  const merchant = merchants[(index + (visit % 3 === 2 ? 5 : 0)) % merchants.length];
  const usedAt = asOf - daysAgo * day - index * 60000;
  return { transactionId: `mock-personal-fit:${citizen.id}:${visit}`, revision: 0,
    actualUserId: citizen.id, merchantId: merchant.id, usedAt, recordedAt: usedAt + 1000,
    status: 'confirmed', netAmount: 6000 + ((index + visit) % 7) * 2000, contentVersion };
}));
for (const [name, rows] of [['personal-fit-events', events], ['personal-fit-vectors', vectors]]) {
  for (const directory of ['data/seed', 'data/runtime']) {
    const path = resolve(root, directory, `${name}.json`);
    let existing = [];
    try { existing = await read(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    // 이 생성기의 목 데이터만 갱신하고 외부에서 추가한 데이터는 보존한다.
    const retained = existing.filter((row) => name === 'personal-fit-events'
      ? !row.transactionId.startsWith('mock-personal-fit:') : row.contentVersion !== contentVersion);
    await mkdir(resolve(root, directory), { recursive: true });
    await writeFile(path, `${JSON.stringify([...retained, ...rows], null, 2)}\n`);
  }
}
// 후보 파일만 있는 기존 런타임에서도 스키마 상태를 표시할 수 있게 초기화한다.
try {
  await copyFile(resolve(root, 'data/seed/_meta.json'), resolve(root, 'data/runtime/_meta.json'), constants.COPYFILE_EXCL);
} catch (error) { if (error.code !== 'EEXIST') throw error; }
console.log(`기준 ${new Date(asOf).toISOString()}: 행동 이력 ${events.length}건, 가맹점 벡터 ${vectors.length}건`);
