import { loadEnvFile } from 'node:process';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
try { loadEnvFile(resolve(root, 'apps/api/.env')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('API 환경파일을 읽지 못했습니다.'); }
const snapshotPath = resolve(root, 'data/reference/store-codes.json');
const fromSnapshot = process.argv.includes('--from-snapshot');
const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
if (!fromSnapshot && !key) throw new Error('DATA_GO_KR_SERVICE_KEY가 필요합니다.');
let secret;
try { secret = key ? decodeURIComponent(key) : ''; } catch { throw new Error('인증키의 인코딩을 확인해 주세요.'); }
const requests = [];
const cacheDir = resolve(root, '.tmp/store-code-responses');
await mkdir(cacheDir, { recursive: true });
async function get(operation, params = {}) {
  const cachePath = resolve(cacheDir, `${operation}-${Object.values(params).join('-') || 'all'}.json`);
  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    if (Date.now() - cached.savedAt < 3600000 && Array.isArray(cached.items)) {
      requests.push({ operation, params, count: cached.items.length });
      return cached.items;
    }
  } catch (e) { if (e.code !== 'ENOENT') throw new Error('코드 응답 임시 파일을 확인해 주세요.'); }
  const url = new URL(`https://apis.data.go.kr/B553077/api/open/sdsc2/${operation}`);
  url.search = new URLSearchParams({ ...params, type: 'json', serviceKey: secret }).toString();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await new Promise(r => setTimeout(r, 600));
      const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (!response.ok) throw new Error('HTTP 실패');
      const json = await response.json();
      if (json.header?.resultCode !== '00' || !Array.isArray(json.body?.items)) throw new Error('목록 응답 오류');
      requests.push({ operation, params, count: json.body.items.length });
      await writeFile(cachePath, JSON.stringify({ savedAt: Date.now(), items: json.body.items }));
      return json.body.items;
    } catch {
      if (attempt === 4) throw new Error(`${operation} ${JSON.stringify(params)} 코드 목록 조회 실패. 부분 결과는 적용하지 않습니다.`);
      console.log(`${operation}: 공급자 응답 대기 후 재시도 ${attempt + 1}/4`);
      await new Promise(r => setTimeout(r, 10000 * (attempt + 1)));
    }
  }
}

async function mapLimited(rows, fn) {
  const results = new Array(rows.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(1, rows.length) }, async () => {
    while (next < rows.length) { const i = next++; results[i] = await fn(rows[i]); }
  }));
  return results.flat();
}

let catalog;
if (fromSnapshot) {
  catalog = JSON.parse(await readFile(snapshotPath, 'utf8'));
} else {
  const large = await get('largeUpjongList');
  const middle = await get('middleUpjongList');
  const small = await get('smallUpjongList');
  const provinces = await get('baroApi', { resId: 'dong', catId: 'mega' });
  const districts = await mapLimited(provinces, p => get('baroApi', { resId: 'dong', catId: 'cty', ctprvnCd: String(p.ctprvnCd) }));
  console.log(`전국 시도 ${provinces.length}개, 시군구 ${districts.length}개 수집. 모든 시군구의 행정동을 조회합니다.`);
  let done = 0;
  const neighborhoods = await mapLimited(districts, async d => {
    const rows = await get('baroApi', { resId: 'dong', catId: 'admi', signguCd: String(d.signguCd) });
    if (++done % 40 === 0) console.log(`행정동 조회 ${done}/${districts.length}`);
    return rows;
  });
  const base = (r, code, name) => ({ code: String(r[code]), name: r[name], referenceDate: r.stdrDt });
  catalog = {
    fetchedAt: new Date().toISOString(), datasetId: '15012005',
    regionDivisions: [{ code: 'ctprvnCd', name: '시도', codeLength: 2 }, { code: 'signguCd', name: '시군구', codeLength: 5 }, { code: 'adongCd', name: '행정동', codeLength: 8 }],
    provinces: provinces.map(r => base(r, 'ctprvnCd', 'ctprvnNm')),
    districts: districts.map(r => ({ ...base(r, 'signguCd', 'signguNm'), provinceCode: String(r.ctprvnCd) })),
    neighborhoods: neighborhoods.map(r => ({ ...base(r, 'adongCd', 'adongNm'), provinceCode: String(r.ctprvnCd), districtCode: String(r.signguCd) })),
    largeCategories: large.map(r => base(r, 'indsLclsCd', 'indsLclsNm')),
    middleCategories: middle.map(r => ({ ...base(r, 'indsMclsCd', 'indsMclsNm'), largeCode: String(r.indsLclsCd) })),
    smallCategories: small.map(r => ({ ...base(r, 'indsSclsCd', 'indsSclsNm'), largeCode: String(r.indsLclsCd), middleCode: String(r.indsMclsCd) })),
    requests,
  };
}

// 중복·부모 누락·빈 조회는 조용히 제거하거나 추측하지 않는다.
for (const key of ['provinces', 'districts', 'neighborhoods', 'largeCategories', 'middleCategories', 'smallCategories']) {
  const rows = catalog[key];
  if (!rows.length || new Set(rows.map(r => r.code)).size !== rows.length || rows.some(r => !r.name || !r.referenceDate || r.code === 'undefined')) throw new Error(`${key}: 코드 누락 또는 중복`);
  rows.sort((a, b) => a.code.localeCompare(b.code));
}
for (const r of catalog.districts) if (!catalog.provinces.some(p => p.code === r.provinceCode)) throw new Error('시군구 상위 시도 누락');
for (const r of catalog.neighborhoods) if (!catalog.districts.some(p => p.code === r.districtCode && p.provinceCode === r.provinceCode)) throw new Error('행정동 상위 지역 누락');
for (const r of catalog.middleCategories) if (!catalog.largeCategories.some(p => p.code === r.largeCode)) throw new Error('중분류 상위 분류 누락');
for (const r of catalog.smallCategories) if (!catalog.middleCategories.some(p => p.code === r.middleCode && p.largeCode === r.largeCode)) throw new Error('소분류 상위 분류 누락');

const names = rows => new Map(rows.map(r => [r.code, r.name]));
const ms = names(catalog.middleCategories);
const cell = v => String(v).replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = (headers, rows) => `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map(r => '| ' + r.map(cell).join(' | ') + ' |').join('\n')}\n`;
const note = `> 공공 API 실조회: ${catalog.fetchedAt}. 아래 명칭·코드·기준일은 공급자가 반환한 값이다.\n> 자동 생성 문서. 갱신은 \`node scripts/sync-store-code-catalog.mjs\`.\n\n`;
let regions = '# 공공 상가정보 지역 코드 전체표\n\n' + note;
regions += '## 지역 구분 → 요청 값\n\n' + table(['명칭', 'divId', 'key 자리수'], catalog.regionDivisions.map(r => [r.name, r.code, r.codeLength]));
regions += '\n지역 구분은 상가조회 `storeListInDong`의 `divId`, 선택한 지역 코드는 `key`에 넣는다. 코드 목록을 구하는 `baroApi`의 `catId=mega/cty/admi`와 구분한다. 법정동(`zone`)은 이 상가조회가 지원하는 세 지역 구분에 포함되지 않으므로 행정동 코드 대신 넣지 않는다.\n\n';
regions += '## 시도 전체\n\n' + table(['시도명 → 코드', '코드', '기준일'], catalog.provinces.map(r => [r.name, r.code, r.referenceDate]));
regions += '\n## 시도별 시군구·행정동 전체\n\n';
for (const p of catalog.provinces) {
  const districts = catalog.districts.filter(r => r.provinceCode === p.code);
  regions += `### ${p.name} (${p.code})\n\n` + table(['시군구명 → 코드', '코드', '기준일'], districts.map(r => [r.name, r.code, r.referenceDate]));
  for (const d of districts) regions += `\n#### ${p.name} ${d.name} (${d.code})\n\n` + table(['행정동명 → 코드', '코드', '기준일'], catalog.neighborhoods.filter(r => r.districtCode === d.code).map(r => [r.name, r.code, r.referenceDate]));
}
let industries = '# 공공 상가정보 업종 코드 전체표\n\n' + note;
industries += `대분류 ${catalog.largeCategories.length}개 · 중분류 ${catalog.middleCategories.length}개 · 소분류 ${catalog.smallCategories.length}개. 가게 조회 결과에서 추출한 표본이 아니라 각 분류 목록 API의 전체 응답이다.\n\n`;
industries += '## 대분류 전체\n\n' + table(['업종명 → 코드', 'indsLclsCd', '기준일'], catalog.largeCategories.map(r => [r.name, r.code, r.referenceDate]));
for (const l of catalog.largeCategories) {
  industries += `\n## ${l.name} (${l.code})\n\n`;
  industries += table(['중분류명 → 코드', 'indsMclsCd', '기준일'], catalog.middleCategories.filter(r => r.largeCode === l.code).map(r => [r.name, r.code, r.referenceDate]));
  industries += '\n' + table(['중분류명', '중분류 코드', '소분류명 → 코드', 'indsSclsCd', '기준일'], catalog.smallCategories.filter(r => r.largeCode === l.code).map(r => [ms.get(r.middleCode), r.middleCode, r.name, r.code, r.referenceDate]));
}
for (const doc of ['regions', 'industries']) {
  const footer = '\n## 결정\n\n- ' + catalog.fetchedAt.slice(0,10) + ' — 코드·명칭·부모 관계는 공급자 API 응답을 그대로 사용한다.\n\n## 미결\n\n- [ ] 공급자 개정 시 목록을 재수집한다. 조회 기준일과 실제 상가 데이터의 기준월 차이는 별도로 확인한다.\n';
  if (doc === 'regions') regions += footer; else industries += footer;
}
const data = JSON.stringify(catalog, null, 2) + '\n';
const outputs = [
  [snapshotPath, data],
  [resolve(root, 'packages/contracts/src/store-code-data.ts'), `// 자동 생성: scripts/sync-store-code-catalog.mjs\nimport type { StoreCodeCatalog } from './store-codes';\nexport const STORE_CODE_CATALOG: StoreCodeCatalog = ${data.trim()};\n`],
  [resolve(root, 'documents/공공데이터-코드/지역-전체표.md'), regions],
  [resolve(root, 'documents/공공데이터-코드/업종-전체표.md'), industries],
];
for (const [path, text] of outputs) { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path + '.tmp', text); await rename(path + '.tmp', path); }
console.log(JSON.stringify(Object.fromEntries(['provinces','districts','neighborhoods','largeCategories','middleCategories','smallCategories'].map(k => [k,catalog[k].length]))));
