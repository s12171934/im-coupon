import { readFile, writeFile } from 'node:fs/promises';

// Project mapping decisions, not a provider-issued crosswalk. No statistics are generated.
const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const catalog = await read('data/reference/store-codes.json');
const merchants = await read('data/seed/merchants.json');
const sourceUrl = 'https://abp.bccard.com/dataContest/dataContestDetailPage?contestNo=9000001';
const d0Categories = Object.entries({
  '4004': '대형할인점', '4010': '편의점', '4020': '슈퍼마켓',
  '8001': '일반한식', '8002': '갈비전문점', '8003': '한정식',
  '8004': '일식회집', '8005': '중국음식', '8006': '서양음식',
  '8021': '스넥', '8301': '제과점',
}).map(([code, name]) => ({ code, name }));
const decisions = new Map();
function decide(codes, status, candidates, reason) {
  for (const code of codes.split(' ')) {
    if (decisions.has(code)) throw new Error(`중복 판단: ${code}`);
    decisions.set(code, { status, d0Code: status === 'supported' ? candidates[0] : null,
      candidateD0Codes: candidates, reason });
  }
}
const support = (codes, target, reason) => decide(codes, 'supported', [target], reason);
const review = (codes, targets, reason) => decide(codes, 'review_required', targets, reason);
support('G20404', '4020', '소매 형태와 D0 업종 정의가 일치한다.');
support('G20405', '4010', '소매 형태와 D0 업종 정의가 일치한다.');
support('I20111 I20301', '8004', 'D0 상세 범위에 회 전문 음식이 포함된다. D1 한식 부모만으로 판단하지 않는다.');
support('I20201 I20202', '8005', 'D1 중식의 하위 음식점을 D0 중국 요리 범위에 연결하는 프로젝트 판단이다.');
support('I20401 I20402 I20403 I20499', '8006', 'D1 서양식의 하위 음식점을 D0 서양 요리 범위에 연결하는 프로젝트 판단이다.');
support('I21003 I21004 I21005 I21201', '8006', 'D0 상세 범위가 해당 간편식 또는 커피·음료 영업을 포함한다.');
support('I21006 I21007', '8021', 'D0 상세 범위가 닭튀김과 분식 영업을 포함한다.');
support('I21002', '8301', 'D0 상세 범위가 전통 떡류 영업을 포함한다.');
review('G20402', ['4004', '4020'], '대형 할인 업태와 마트 명칭이 겹친다. 규모·영업 형태의 구분 기준 확인이 필요하다.');
review('G20499 G20509', ['4020'], '종합·식품 소매 범위가 넓다. 슈퍼마켓과 전문 판매점을 코드만으로 구분할 수 없다.');
review('G20507', ['8301'], '제품은 겹치지만 할인 소매점과 제과 영업은 다르다. 상품명만으로 연결하지 않는다.');
review('I20101 I20102 I20103 I20104 I20105 I20106 I20107 I20108 I20109 I20110 I20112 I20113 I20199',
  ['8001', '8002', '8003'], 'D0 한식 세 코드의 공개 상세 설명이 동일하다. D1만으로 단일 코드를 선택할 수 없다.');
review('I20302', ['8004', '8006'], '일식 복합 분류에 서양식 상세 범위와 겹치는 메뉴가 포함된다.');
review('I20303', ['8004', '8021'], '일식과 분식의 면 요리 경계를 추가 확인해야 한다.');
review('I20399', ['8004', '8006'], '기타 일식은 상세 메뉴가 없어 중첩되는 서양식 범위를 배제할 수 없다.');
review('I20501 I20599 I20601', ['8006'], 'D0의 외국 음식 표현만으로 모든 외국 요리를 포괄한다고 단정할 수 없다.');
review('I20701 I20702 I20801', ['8001', '8002', '8003', '8004', '8005', '8006', '8021'],
  '급식·뷔페·출장 제공 방식만으로 음식 종류나 카드 업종을 결정할 수 없다. 후보는 확인 출발점이다.');
review('I20901 I21099', ['8001', '8002', '8003', '8004', '8005', '8006', '8021', '8301'],
  '복합 영업 또는 기타 분류이다. 실제 영업 범위 확인 전 하나의 통계로 연결하지 않는다.');
review('I21001 I21008', ['8006', '8301'], '복합 소분류와 D0 디저트·제과 범위가 겹친다. 단일 코드로 확정하지 않는다.');

const large = new Map(catalog.largeCategories.map(x => [x.code, x.name]));
const middle = new Map(catalog.middleCategories.map(x => [x.code, x.name]));
const known = new Set(catalog.smallCategories.map(x => x.code));
if (known.size !== 1255 || known.size !== catalog.smallCategories.length) throw new Error('D1 목록 변경: 전체 분류를 다시 검토하세요.');
for (const [code, decision] of decisions) {
  if (!known.has(code) || decision.candidateD0Codes.some(c => !d0Categories.some(x => x.code === c))) {
    throw new Error(`존재하지 않는 업종 코드: ${code}`);
  }
}
const rows = catalog.smallCategories.map(category => ({
  d1Code: category.code, d1Name: category.name,
  largeCode: category.largeCode, largeName: large.get(category.largeCode),
  middleCode: category.middleCode, middleName: middle.get(category.middleCode),
  referenceDate: category.referenceDate,
  ...(decisions.get(category.code) ?? {
    status: 'unsupported', d0Code: null, candidateD0Codes: [],
    reason: category.largeCode === 'I2' ? 'D0 11개 업종에는 주점 통계가 별도로 없다. 음식 제공 여부만으로 음식점에 합치지 않는다.'
      : category.largeCode === 'G2' ? '해당 전문 소매 업태를 D0 종합 소매 또는 음식점으로 연결할 근거가 없다.'
        : `${large.get(category.largeCode)}의 영업 활동은 D0 음식점·종합 소매 11개 범위 밖이다. 제조·도매를 동일 상품의 음식점·소매로 연결하지 않는다.`,
  }),
}));
const counts = rows.reduce((out, row) => { out[row.status]++; return out; }, { supported: 0, review_required: 0, unsupported: 0 });
const byCode = new Map(rows.map(row => [row.d1Code, row]));
const seedCoverage = merchants.map(merchant => {
  const row = byCode.get(merchant.publicData?.categoryCode);
  return { merchantId: merchant.id, name: merchant.name, d1Code: merchant.publicData?.categoryCode ?? null,
    status: row?.status ?? 'unknown', d0Code: row?.d0Code ?? null,
    statisticsAvailability: 'not_checked' };
});
const output = { version: 1, reviewedAt: '2026-09-15', authority: 'project_inference',
  sourceUrl, d1CatalogFetchedAt: catalog.fetchedAt, statisticsAvailability: 'not_checked',
  d0Categories, counts, rows, seedCoverage };
const labels = { supported: '대응 가능', review_required: '확인 필요', unsupported: '미지원', unknown: '알 수 없음' };
const target = code => code ? `${code} ${d0Categories.find(x => x.code === code).name}` : '—';
const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = (headers, values) => `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${values.map(row => `| ${row.map(cell).join(' | ')} |`).join('\n')}\n`;
const doc = `# D0 ↔ D1 업종 대응 전체표\n\n` +
  '생성: `node scripts/generate-d0-d1-crosswalk.mjs`. 판단 기준과 사용 제한은 [안내](D0-D1-업종-대응.md)를 먼저 읽는다.\n\n' +
  `총 ${rows.length}개: 대응 가능 ${counts.supported}, 확인 필요 ${counts.review_required}, 미지원 ${counts.unsupported}. 통계 확보 여부는 전부 별도 확인 대상이다.\n\n` +
  `## D0 코드별 역방향 목록\n\n` + table(['D0 코드·명칭', '대응 가능한 D1 코드', '확인 필요 D1 코드'], d0Categories.map(d0 => [target(d0.code), rows.filter(r => r.d0Code === d0.code).map(r => r.d1Code).join(', ') || '없음', rows.filter(r => r.status === 'review_required' && r.candidateD0Codes.includes(d0.code)).map(r => r.d1Code).join(', ') || '없음'])) +
  `\n## 현재 시드 가게\n\n통계값은 만들지 않았다. 가게 이름 대신 공공 소분류 코드를 사용한다.\n\n` + table(['가게 ID', '이름', 'D1', '판정', 'D0'], seedCoverage.map(r => [r.merchantId, r.name, r.d1Code, labels[r.status], target(r.d0Code)])) +
  `\n## D1 소분류 전체\n\n` + table(['대분류', '중분류', '소분류', '판정', 'D0', '검토 후보', '근거'], rows.map(r => [`${r.largeCode} ${r.largeName}`, `${r.middleCode} ${r.middleName}`, `${r.d1Code} ${r.d1Name}`, labels[r.status], target(r.d0Code), r.status === 'review_required' ? r.candidateD0Codes.join(', ') : '—', r.reason]));
await writeFile(new URL('data/reference/d0-d1-category-mapping.json', root), JSON.stringify(output, null, 2) + '\n');
await writeFile(new URL('documents/공공데이터-코드/D0-D1-업종-전체표.md', root), doc);
console.log(JSON.stringify({ counts, seedCoverage }, null, 2));
