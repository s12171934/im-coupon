import { expect, test } from '@playwright/test';

test('화면 URL 직접 진입·새로고침·뒤로/앞으로 가기가 화면과 일치한다', async ({ page }) => {
  await page.goto('/my-coupons');
  await expect(page.getByRole('combobox', { name: '소유자 선택' })).toBeVisible();
  await expect(page.getByRole('link', { name: '내 쿠폰' })).toHaveAttribute('aria-current', 'page');

  await page.reload();
  await expect(page).toHaveURL(/\/my-coupons$/);
  await expect(page.getByRole('combobox', { name: '소유자 선택' })).toBeVisible();

  await page.getByRole('link', { name: '발급 실행' }).click();
  await expect(page).toHaveURL(/\/issue$/);
  await expect(page.getByRole('button', { name: '발급 1건 실행' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/my-coupons$/);
  await expect(page.getByRole('combobox', { name: '소유자 선택' })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/issue$/);
  await expect(page.getByRole('button', { name: '발급 1건 실행' })).toBeVisible();
});

test('없는 화면 URL에서 안내를 보고 발급 화면으로 돌아간다', async ({ page }) => {
  await page.goto('/missing');
  await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없습니다' })).toBeVisible();
  await page.getByRole('link', { name: '발급 실행으로 이동' }).click();
  await expect(page).toHaveURL(/\/issue$/);
  await expect(page.getByRole('button', { name: '발급 1건 실행' })).toBeVisible();
});
