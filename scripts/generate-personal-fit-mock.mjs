import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { publicConsumptionContext } from './public-consumption-context.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const asOf = process.argv[2] ? Date.parse(process.argv[2]) : Date.now();
if (!Number.isFinite(asOf)) throw new Error('기준 시각은 ISO 8601로 입력하세요.');
const day = 86400000;
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const citizens = await read(resolve(root, 'data/seed/citizens.json'));
const merchants = await read(resolve(root, 'data/seed/merchants.json'));
const contents = await read(resolve(root, 'data/seed/merchant-contents.json'));
const vectors = await read(resolve(root, 'data/seed/merchant-vectors.json'));
const catalog = await read(resolve(root, 'data/reference/store-codes.json'));
if (!citizens.length || !merchants.length) throw new Error('시민과 가맹점 시드가 필요합니다.');

// 실제 모델 산출물은 생성하거나 시각을 고치지 않는다. 이용 가능한 버전을 참조하는 목 이력만 만든다.
const versions = merchants.map((merchant) => contents
  .filter((content) => content.merchantId === merchant.id)
  .flatMap((content) => vectors.filter((vector) => vector.merchantId === merchant.id
    && vector.contentVersion === content.contentVersion).map((vector) => ({
      contentVersion: content.contentVersion,
      availableAt: Math.max(content.knownAt, content.verifiedAt, vector.knownAt, vector.verifiedAt),
    })))
  .filter((version) => Number.isFinite(version.availableAt) && version.availableAt < asOf - 60000)
  .sort((a, b) => a.availableAt - b.availableAt || a.contentVersion.localeCompare(b.contentVersion)));
if (versions.some((rows) => !rows.length)) {
  throw new Error('모든 가맹점의 검증된 내용·벡터가 준비된 시각보다 1분 이상 뒤를 기준으로 지정하세요.');
}
const offsets = [1, 4, 10, 18, 35, 60];
const events = citizens.flatMap((citizen, index) => offsets.map((daysAgo, visit) => {
  const merchantIndex = (index + (visit % 3 === 2 ? 5 : 0)) % merchants.length;
  const merchant = merchants[merchantIndex];
  const available = versions[merchantIndex];
  // 모델 확인 이전으로 거래를 소급하지 않는다. 최근 확인된 가맹점은 같은 날의 이력이 된다.
  const usedAt = Math.max(asOf - daysAgo * day - index * 60000,
    Math.floor(available[0].availableAt + (asOf - available[0].availableAt) * (visit + 1) / 7));
  const version = available.filter((row) => row.availableAt <= usedAt).at(-1);
  return { transactionId: `mock-personal-fit:${citizen.id}:${visit}`, revision: 0,
    actualUserId: citizen.id, merchantId: merchant.id, usedAt, recordedAt: usedAt + 1000,
    status: 'confirmed', netAmount: 6000 + ((index + visit) % 7) * 2000,
    contentVersion: version.contentVersion, ...publicConsumptionContext(merchant, catalog) };
}));
const runtimeDir = process.env.IM_COUPON_DATA_DIR
  ? resolve(process.env.IM_COUPON_DATA_DIR) : resolve(root, 'data/runtime');
// 두 파일을 먼저 읽어 오류가 있는 런타임을 일부만 덮어쓰지 않는다.
const outputs = await Promise.all([resolve(root, 'data/seed'), runtimeDir].map(async (directory) => {
  const path = resolve(directory, 'personal-fit-events.json');
  let existing = [];
  try { existing = await read(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(existing)) throw new Error(`${path}는 레코드 배열이어야 합니다.`);
  const retained = existing.filter((row) => !row.transactionId?.startsWith('mock-personal-fit:'));
  return { directory, path, rows: [...retained, ...events] };
}));
for (const { directory, path, rows } of outputs) {
  await mkdir(directory, { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(rows, null, 2)}\n`);
  await rename(temporary, path);
}
console.log(`기준 ${new Date(asOf).toISOString()}: 모델 내용 버전을 참조하는 목 행동 이력 ${events.length}건`);
