import type { Citizen, Merchant } from '@im-coupon/contracts';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { IssuanceError } from '../../issuance/domain/services/engine';
import { JsonCandidateSource } from './json-candidate-source';

let dataDir: string;

/**
 * 가맹점 수와 시민 수를 다르게 둔다. 같은 수로 두면 한 컬렉션만 두 번 읽어 제곱으로
 * 세는 구현이 건수 단언을 그대로 지나가기 때문이다 — 3×2 에서는 9 나 4 가 나와 걸린다.
 * 건수가 가리지 못하는 나머지 둘은 다른 단언이 든다. 곱이 교환법칙을 따라 두 컬렉션을
 * 맞바꿔 읽어도 순회를 뒤집어도 건수는 6 그대로이므로, 맞바꿈은 아래 `toContainEqual`
 * 이(가맹점 자리에 시민 모양이 오면 맞지 않는다), 뒤집힘은 순서 테스트가 잡는다.
 *
 * 파일에 든 순서를 id 순과 어긋내 둔 것은 같은 종류의 또 다른 대비다 — 두 순서가 같으면
 * 적재가 파일 순서를 지키는지 id 로 정렬하는지 가려지지 않는데, 정렬은 시드 순서와 발급
 * 순서를 갈라 동점일 때 발급되는 쿠폰을 조용히 바꾼다. 바깥·안쪽 순회 양쪽을 덮도록
 * 두 컬렉션 모두 어긋내 둔다.
 */
const MERCHANTS: Merchant[] = [
  { id: 'mer-003', name: '오후네시커피', category: '카페' },
  { id: 'mer-001', name: '별빛분식', category: '분식' },
  { id: 'mer-002', name: '미리내책방', category: '서점' },
];
const CITIZENS: Citizen[] = [
  { id: 'cit-002', name: '이도담' },
  { id: 'cit-001', name: '김하람' },
];

/** 시드가 놓이는 자리에 컬렉션 파일을 직접 만든다 — 적재가 읽는 것은 데이터 디렉터리다. */
function seed(collection: string, rows: unknown): Promise<void> {
  return writeFile(join(dataDir, `${collection}.json`), JSON.stringify(rows), 'utf8');
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'im-coupon-api-'));
});

describe('JsonCandidateSource', () => {
  it('가맹점 수 × 시민 수 만큼의 쌍을 계약 타입 그대로 낸다', async () => {
    await seed('merchants', MERCHANTS);
    await seed('citizens', CITIZENS);

    const candidates = await new JsonCandidateSource(dataDir).load();

    expect(candidates).toHaveLength(MERCHANTS.length * CITIZENS.length);
    expect(candidates).toContainEqual({ merchant: MERCHANTS[1], citizen: CITIZENS[1] });
  });
});

describe('JsonCandidateSource 의 목록 순서', () => {
  it('가맹점을 바깥, 시민을 안쪽으로 두고 두 컬렉션의 시드 순서를 그대로 잇는다', async () => {
    // 8장의 동점 규칙이 "먼저 온 쪽"이라 이 순서가 곧 동점일 때 발급되는 쿠폰을 정한다.
    // 기대 배열이 id 순이 아닌 것은 픽스처가 파일 순서를 id 순과 어긋내 두었기 때문이다.
    await seed('merchants', MERCHANTS);
    await seed('citizens', CITIZENS);

    const candidates = await new JsonCandidateSource(dataDir).load();

    expect(candidates.map((each) => `${each.merchant.id}×${each.citizen.id}`)).toEqual([
      'mer-003×cit-002',
      'mer-003×cit-001',
      'mer-001×cit-002',
      'mer-001×cit-001',
      'mer-002×cit-002',
      'mer-002×cit-001',
    ]);
  });
});

describe('JsonCandidateSource 의 빈 컬렉션', () => {
  /**
   * 발급 후보 0건은 이 자리의 실패가 아니다. `NO_CANDIDATES` 는 빈 목록을 받은 엔진이
   * 던지며, 여기서도 던지면 오류가 두 자리에서 나 오류 우선순위가 흔들린다.
   */
  it.each([
    ['가맹점이 없으면', [], CITIZENS],
    ['시민이 없으면', MERCHANTS, []],
    ['둘 다 없으면', [], []],
  ])('%s 예외 없이 빈 목록을 낸다', async (_label, merchants, citizens) => {
    await seed('merchants', merchants);
    await seed('citizens', citizens);

    await expect(new JsonCandidateSource(dataDir).load()).resolves.toEqual([]);
  });

  it('컬렉션 파일이 아직 없어도 예외 없이 빈 목록을 낸다', async () => {
    // 시드 부트스트랩 전의 데이터 디렉터리다 — `JsonFileDb` 가 없는 컬렉션을 빈 배열로 읽는다.
    await expect(new JsonCandidateSource(dataDir).load()).resolves.toEqual([]);
  });
});

/**
 * 읽기 실패는 두 컬렉션 어느 쪽에서 나든 같아야 한다. 케이스 표를 컬렉션마다 따로 두면
 * 한쪽에만 케이스를 더했을 때 두 컬렉션의 검증 범위가 조용히 갈리므로, 표는 하나만 두고
 * 깨뜨릴 컬렉션을 바깥에서 바꿔 가며 돌린다.
 *
 * 유효한 JSON 이되 배열이 아닌 파일은 `JsonFileDb` 가 걸러 주지 않는다 — 파싱 결과를
 * 캐스트만 하기 때문이다. 그냥 두면 `null` 은 순회에서 감싸지지 않은 `TypeError` 로
 * 새고, 문자열은 글자 하나하나가 가맹점·시민 행세를 해 발급 후보를 오염시킨다.
 */
const UNREADABLE: [string, string][] = [
  ['깨진 JSON 이면', '{ 깨진 JSON'],
  ['null 이면', 'null'],
  ['{} 이면', '{}'],
  ['42 이면', '42'],
  ['"abc" 이면', '"abc"'],
];

/** 깨뜨릴 컬렉션과, 그 짝으로 온전히 채워 둘 컬렉션. */
const COLLECTIONS: [string, string, string, Merchant[] | Citizen[]][] = [
  ['가맹점', 'merchants', 'citizens', CITIZENS],
  ['시민', 'citizens', 'merchants', MERCHANTS],
];

describe.each(COLLECTIONS)(
  'JsonCandidateSource 의 %s 컬렉션 읽기 실패',
  (_label, broken, intact, intactRows) => {
    it.each(UNREADABLE)('%s `STORAGE_FAILURE` 를 든 `IssuanceError` 로 올린다', async (
      _case,
      content,
    ) => {
      await writeFile(join(dataDir, `${broken}.json`), content, 'utf8');
      await seed(intact, intactRows);

      const call = new JsonCandidateSource(dataDir).load();

      await expect(call).rejects.toThrowError(IssuanceError);
      await expect(call).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });
    });
  },
);
