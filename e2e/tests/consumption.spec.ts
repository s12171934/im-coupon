import { expect, test } from '@playwright/test';

test('소유자 결제와 공개 쿠폰 결제를 브라우저에서 끝까지 시연한다', async ({ page }) => {
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 500) failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('/consumption');
  await expect(page.getByRole('combobox', { name: '쿠폰 소유자' })).not.toHaveValue('');
  const firstResponse = page.waitForResponse((response) => response.url().endsWith('/api/coupons/issue'));
  await page.getByRole('button', { name: '쿠폰 발급', exact: true }).click();
  const first = await firstResponse;
  expect(first.status()).toBe(201);
  const { coupon } = await first.json();
  await expect(page.getByRole('combobox', { name: '쿠폰 소유자' })).toHaveValue(coupon.ownerId);
  const ownPayment = page.waitForResponse((response) => response.url().endsWith(`/coupons/${coupon.id}/consume`));
  await page.getByRole('button', { name: '이 쿠폰으로 결제 시연' }).click();
  const own = await ownPayment;
  expect(own.status()).toBe(201);
  expect((await own.json()).pointEntries).toEqual(expect.arrayContaining([
    expect.objectContaining({ couponId: coupon.id, recipientId: coupon.ownerId, amount: coupon.faceValue }),
  ]));
  await expect(page.getByRole('status')).toContainText('결제를 시연했습니다');

  const secondResponse = page.waitForResponse((response) => response.url().endsWith('/api/coupons/issue'));
  await page.getByRole('button', { name: '쿠폰 발급', exact: true }).click();
  const second = await (await secondResponse).json();
  await expect(page.getByRole('combobox', { name: '쿠폰 소유자' })).toHaveValue(second.coupon.ownerId);
  const directory = await (await page.request.get('/api/citizens')).json();
  const consumer = directory.citizens.find((citizen: { id: string }) => citizen.id !== second.coupon.ownerId);
  await page.getByRole('combobox', { name: '쿠폰 소비자' }).selectOption(consumer.id);
  const release = page.waitForResponse((response) => response.url().endsWith('/simulate-owner-expiry'));
  await page.getByRole('button', { name: '소유자 기한 경과 시연' }).click();
  expect((await release).status()).toBe(201);
  const reserve = page.waitForResponse((response) => response.url().endsWith(`/coupons/${second.coupon.id}/reserve`));
  await page.getByRole('button', { name: '쿠폰 점유하기' }).click();
  expect((await reserve).status()).toBe(201);
  const payment = page.waitForResponse((response) => response.url().endsWith(`/coupons/${second.coupon.id}/consume`));
  await page.getByRole('button', { name: '이 쿠폰으로 결제 시연' }).click();
  const response = await payment;
  expect(response.status()).toBe(201);
  const result = await response.json();
  const entries = result.pointEntries.filter((entry: { couponId: string }) => entry.couponId === second.coupon.id);
  expect(entries).toHaveLength(2);
  expect(entries.reduce((sum: number, entry: { amount: number }) => sum + entry.amount, 0)).toBe(second.coupon.faceValue);
  await expect(page.getByRole('status')).toContainText('결제를 시연했습니다');
  expect(failures).toEqual([]);
});
