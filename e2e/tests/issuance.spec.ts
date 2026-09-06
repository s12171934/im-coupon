import { expect, test } from '@playwright/test';
import { JsonFileDb } from '@im-coupon/db';
import { resolve } from 'node:path';

/**
 * 발급부터 내 쿠폰 확인까지를 브라우저로 관통하는 e2e (설계문서 12장 「구현 완료 후 E2E」).
 *
 * 목을 쓰지 않는다 — `page.route` 로 API 를 가로채지 않는다. 실제로 빌드된 API 프로세스
 * (`node dist/main.js`)와 `vite preview` 를 지나 JSON 파일 DB 까지 닿는다
 * (`playwright.config.ts` 의 `webServer`). 목으로 덮은 구간은 e2e 가 검증하지 않은 구간이다.
 *
 * `packages/db` 를 직접 쓰는 것은 시작 상태 준비 한 줄뿐이고, 그 뒤의 발급·조회는 전부
 * 화면과 HTTP 를 통한다 (설계문서 10장 이 브랜치).
 */

/** 저장소 루트. `orphan-guard.spec.ts` 가 같은 방식으로 잡는다 */
const REPO_ROOT = resolve(__dirname, '../..');

/**
 * API 프로세스가 실제로 쓰는 런타임 데이터 디렉터리.
 *
 * `webServer` 는 API 를 인자 없이 띄우므로 API 는 자기 기본값인 저장소 루트 `data/runtime`
 * 을 쓴다. 그 규칙을 여기서 그대로 되짚는다 — `IM_COUPON_DATA_DIR` 가 설정된 환경에서는
 * `webServer` 로 뜨는 API 도 그 환경변수를 물려받으므로, 준비 단계가 기본값만 보면 API 와
 * 다른 디렉터리를 비우고 정작 발급은 다른 곳에 쌓인다. 이 상수를 `apps/api` 에서 가져오지
 * 않는 것은 e2e 가 앱 내부 모듈에 의존하지 않기 때문이다 (설계문서 5장 의존 방향).
 */
const DATA_DIR = process.env.IM_COUPON_DATA_DIR ?? resolve(REPO_ROOT, 'data/runtime');

/** 이중 기한의 표기 형태 (설계문서 11장 — 쿠폰 카드는 `YYYY-MM-DD HH:mm KST` 로 적는다) */
const DISPLAY_MINUTE = String.raw`\d{4}-\d{2}-\d{2} \d{2}:\d{2} KST`;

test('TC-07-01 발급한 쿠폰이 그 소유자의 내 쿠폰 화면에 거래조건 고지와 함께 보인다', async ({
  page,
}) => {
  /*
    1. 준비 — `coupons` 를 빈 배열로 연다. 5단계에서 카드 건수를 단언하려면 시작 건수를
    알아야 하고, 시연으로 쌓인 쿠폰이 남아 있으면 그 수를 알 수 없다.

    이 쓰기가 `data/runtime` 의 컬렉션 수를 늘리지만 `health.spec.ts` 와 부딪히지 않는다 —
    그쪽은 컬렉션 수를 정규식(`컬렉션 \d+개`)으로만 보므로 수가 몇이든 통과한다.
    `orphan-guard.spec.ts` 는 자기 임시 디렉터리를 쓰므로 이 디렉터리를 아예 보지 않는다.
    쿠폰을 쓰는 스펙이 이 파일 하나뿐이라 `fullyParallel` 아래에서도 건수가 흔들리지 않는다.
  */
  await new JsonFileDb(DATA_DIR).writeCollection('coupons', []);

  await page.goto('/');

  // 2. 발급 실행 화면에서 발급 1건 실행을 클릭한다.
  await page.getByRole('button', { name: '발급 1건 실행' }).click();

  // 3. 발급 결과 카드에 가맹점명·소유자명·액면이 나타난다.
  const issued = page.getByRole('region', { name: '방금 발급된 쿠폰' });
  await expect(issued.getByTestId('issued-merchant-name')).toBeVisible();
  await expect(issued.getByTestId('issued-owner-name')).toBeVisible();
  await expect(issued).toContainText(/액면 \d+원/);

  const merchantName = (await issued.getByTestId('issued-merchant-name').textContent()) ?? '';
  const ownerName = (await issued.getByTestId('issued-owner-name').textContent()) ?? '';
  const faceValue = (await issued.innerText()).match(/액면 (\d+)원/)?.[1];
  expect(merchantName).not.toBe('');
  expect(ownerName).not.toBe('');
  expect(faceValue).toBeDefined();

  // 4. 내 쿠폰 화면으로 전환해 그 소유자를 선택한다.
  await page.getByRole('tab', { name: '내 쿠폰' }).click();
  /*
    소유자를 **이름(표시 텍스트)** 으로 고른다. 발급은 랜덤 신호로 후보를 골라 실행마다
    소유자가 달라지므로, 3단계에서 읽은 값으로 4단계를 골라야 한다. 그런데 발급 결과
    카드가 내주는 것은 이름뿐이고(`issued-owner-name`), 소유자 선택의 `<option>` 은 값이
    시민 id · 표시 텍스트가 이름이다 — id 로 고르려면 화면 밖에서 id 를 다시 캐야 하는데
    그것은 "준비 뒤로는 화면과 HTTP 만"이라는 이 스펙의 규칙을 깬다.

    이름으로 고르는 것이 안전한 근거는 시드 시민 5건의 이름이 서로 달라 이름이 시민을
    유일하게 가리킨다는 것이다. 어긋나면 조용히 다른 시민이 골라지는 것이 아니라
    `selectOption` 이 그 선택지를 찾지 못해 실패한다.
  */
  await page.getByRole('combobox', { name: '소유자 선택' }).selectOption({ label: ownerName });

  // 5. 쿠폰 카드 1건과 그 카드의 거래조건 고지.
  await expect(page.getByRole('article')).toHaveCount(1);
  const card = page.getByRole('article', { name: merchantName });
  /* 액면까지 맞아야 화면 둘이 같은 쿠폰 한 건을 보고 있다는 것이 선다 */
  await expect(card).toContainText(`액면 ${faceValue}원 페이백`);
  /*
    배분 비율만 수치를 여기 적는다. 발급 파라미터의 수치는 그것을 드는 상수 파일 밖에
    다시 등장하지 않는 것이 원칙이지만, 이 값은 발급 결과 카드에 나오지 않아 액면처럼
    화면에서 받아 올 수 없고, e2e 는 그 상수를 든 `apps/api` 에 의존하지 않는다
    (설계문서 5장 의존 방향). 설계문서 12장 `TC-07-01` 이 기대 결과로 이 두 수를 못박고
    있으므로, 시연 기본값을 바꾸면 이 줄도 함께 고치는 것이 맞다.
  */
  await expect(card).toContainText('배분 비율 — 소유자 20% / 소비자 80%');
  /*
    두 기한은 값을 다시 계산해 맞추지 않고 표기 형태와 존재만 본다. 값이 맞는지는 고정
    입력으로 판정하는 `coupon-card.test.tsx` 의 몫이고, 여기서 계산하면 e2e 가 화면의
    변환식을 그대로 베껴 같은 실수를 함께 통과시킨다.
  */
  await expect(card).toContainText(
    new RegExp(`소유자 점유 기한 — ${DISPLAY_MINUTE} 까지는 소유자만 사용`),
  );
  await expect(card).toContainText(new RegExp(`유효 소비 기한 — ${DISPLAY_MINUTE} 에 만료`));
});
