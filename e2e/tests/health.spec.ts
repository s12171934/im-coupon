import { expect, test } from '@playwright/test';

test('화면이 API 를 거쳐 JSON 파일 DB 의 상태를 보여준다', async ({ page }) => {
  await page.goto('/');

  const storage = page.getByRole('region', { name: '저장소 상태' });
  await expect(storage.getByTestId('storage-status')).toHaveText('정상');
  await expect(storage.getByTestId('storage-detail')).toHaveText(/^스키마 \d+판 · 컬렉션 \d+개$/);
});
