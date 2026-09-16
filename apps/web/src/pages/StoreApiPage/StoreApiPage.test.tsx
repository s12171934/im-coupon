import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { StoreApiPage } from './StoreApiPage';

afterEach(() => { vi.unstubAllGlobals(); });

it('소분류를 선택하면 공식 상위 분류를 채우고 상위 분류 변경 시 초기화한다', async () => {
  render(<StoreApiPage />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('소분류'), 'I20111');
  expect(screen.getByLabelText('대분류')).toHaveValue('I2');
  expect(screen.getByLabelText('중분류')).toHaveValue('I201');
  await user.selectOptions(screen.getByLabelText('대분류'), 'F1');
  expect(screen.getByLabelText('중분류')).toHaveValue('');
  expect(screen.getByLabelText('소분류')).toHaveValue('');
});

it('지역 구분과 시도를 바꾸면 해당 지역의 시군구만 제공한다', async () => {
  render(<StoreApiPage />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('지역 구분'), 'signguCd');
  expect(screen.getByLabelText('시군구')).toHaveValue('30140');
  await user.selectOptions(screen.getByLabelText('시도'), '11');
  expect(screen.getByLabelText('시군구')).not.toHaveValue('30140');
  expect(screen.queryByRole('option', { name: '유성구 (30200)' })).not.toBeInTheDocument();
});

it('버튼을 누를 때만 대전 상가를 조회하고 결과를 표시한다', async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({
    source: '소상공인시장진흥공단 상가(상권)정보', referenceMonth: '202608', totalCount: 1,
    pageNo: 1, numOfRows: 20, elapsedMs: 100,
    items: [{ id: '1', name: '중구 식당', branchName: '', district: '중구', neighborhood: '성내동',
      category: '중국 음식점', categoryCode: 'I20102', address: '대전 중구', longitude: 127.4, latitude: 36.3 }],
  })));
  vi.stubGlobal('fetch', fetcher);
  render(<StoreApiPage />);
  expect(fetcher).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '상가 조회' }));
  expect(await screen.findByText('중구 식당')).toBeInTheDocument();
  expect(fetcher.mock.calls[0]?.[0]).toContain('/api/store-api/stores?');
  expect(fetcher.mock.calls[0]?.[0]).toContain('key=30');
  expect(fetcher.mock.calls[0]?.[0]).not.toContain('serviceKey');
});

it('실패한 응답을 빈 목록으로 표시하지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: '인증을 확인해 주세요.' }), { status: 502 })));
  render(<StoreApiPage />);
  await userEvent.click(screen.getByRole('button', { name: '상가 조회' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('인증을 확인해 주세요.');
});
