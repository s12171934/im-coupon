import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { publicConsumptionContext } from './public-consumption-context.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const catalog = await read(resolve(root,'data/reference/store-codes.json'));
const dirs = [...new Set([resolve(root,'data/seed'),resolve(process.env.IM_COUPON_DATA_DIR ?? resolve(root,'data/runtime'))])];
// Preflight every destination before writing. Non-mock transactions remain untouched.
const outputs = await Promise.all(dirs.map(async dir => {
  const path = resolve(dir,'personal-fit-events.json');
  const [events, merchants, citizens] = await Promise.all(['personal-fit-events','merchants','citizens'].map(name=>read(resolve(dir,`${name}.json`))));
  if (![events,merchants,citizens].every(Array.isArray)) throw new Error('컬렉션은 배열이어야 합니다.');
  let enriched = 0;
  const rows = events.map(event => {
    if (!event.transactionId?.startsWith('mock-personal-fit:')) return event;
    const merchant = merchants.find(m=>m.id===event.merchantId);
    if (!citizens.some(c=>c.id===event.actualUserId)) throw new Error('소비 유저 참조가 없습니다.');
    enriched++;
    return {...event,...publicConsumptionContext(merchant,catalog)};
  });
  return {path,rows,enriched};
}));
for (const {path,rows,enriched} of outputs) {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp,JSON.stringify(rows,null,2)+'\n');
  await rename(temp,path);
  console.log(`${path.replace(root+'/','')}: 공공 코드 연결 ${enriched}건, 총 ${rows.length}건`);
}
